(() => {
  'use strict';
  const config = window.RESERVAS_CONFIG || {};
  const form = document.getElementById('loginForm');
  const email = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');
  const button = document.getElementById('loginButton');
  const message = document.getElementById('loginMessage');

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
    button.disabled = true;
    showMessage('El acceso está en proceso de configuración. Intenta nuevamente más tarde.');
    return;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.replace('reservas.html');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    const userEmail = email.value.trim().toLowerCase();
    if (!/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+@una\.cr$/.test(userEmail)) {
      showMessage('El correo debe tener el formato nombre.apellido.apellido@una.cr.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Ingresando…';
    const { error } = await client.auth.signInWithPassword({ email:userEmail, password:password.value });
    if (error) {
      showMessage(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
      button.disabled = false;
      button.textContent = 'Ingresar a reservas';
      return;
    }
    window.location.replace('reservas.html');
  });
})();
