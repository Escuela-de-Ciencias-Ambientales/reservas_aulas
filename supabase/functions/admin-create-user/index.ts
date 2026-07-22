import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ ok: false, error: 'Método no permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return response({ ok: false, error: 'Configuración o sesión incompleta.' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return response({ ok: false, error: 'Sesión no válida.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role,active')
      .eq('id', userData.user.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin' || !callerProfile.active) {
      return response({ ok: false, error: 'Se requiere acceso de administrador.' }, 403);
    }

    const payload = await request.json();
    const fullName = String(payload.fullName || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const role = payload.role === 'admin' ? 'admin' : 'teacher';

    if (fullName.length < 3 || fullName.length > 100) return response({ ok: false, error: 'El nombre no es válido.' }, 400);
    if (!email.includes('@')) return response({ ok: false, error: 'El correo no es válido.' }, 400);
    if (password.length < 8) return response({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (createError) return response({ ok: false, error: createError.message }, 400);

    if (role === 'admin' && created.user) {
      const { error: roleError } = await adminClient.from('profiles').update({ role: 'admin' }).eq('id', created.user.id);
      if (roleError) return response({ ok: false, error: roleError.message }, 400);
    }

    return response({ ok: true, userId: created.user?.id });
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Error inesperado.' }, 500);
  }
});
