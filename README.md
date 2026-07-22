# Reservas de aulas · EDECA

Sistema pequeño de consulta y reserva de aulas para la Escuela de Ciencias Ambientales de la Universidad Nacional. Admite hasta 50 cuentas docentes y conserva como referencia el horario académico del II Ciclo 2026.

## Funciones incluidas

- Consulta pública del horario académico fijo.
- Consulta pública de las reservas registradas por fecha y aula.
- Vista diaria de tramos disponibles y ocupados para cada aula.
- Inicio de sesión individual con correo y contraseña.
- Creación de reservas por fecha, aula, hora de inicio, hora de finalización y actividad.
- Bloqueo de cruces con clases fijas y con otras reservas.
- Lista personal de próximas reservas y cancelación por parte del propietario.
- Acceso maestro para consultar y cancelar cualquier reserva.
- Creación de cuentas docentes y administrativas desde el panel maestro.
- Diseño adaptable para computadora, tableta y teléfono.
- Registro de cancelaciones y reglas de seguridad en la base de datos.
- Reservas habilitadas hasta el 20 de diciembre de 2026.

## Estructura

- `index.html`: interfaz y horario académico base.
- `reservas.css`: estilos del sistema de acceso y reservas.
- `reservas.js`: autenticación, disponibilidad, reservas y administración.
- `config.js`: conexión pública con Supabase.
- `supabase/migrations/`: esquema, restricciones y políticas de seguridad.
- `supabase/seed.sql`: 56 ocupaciones académicas que bloquean reservas.
- `supabase/functions/admin-create-user/`: función segura para crear cuentas.
- `.github/workflows/pages.yml`: publicación automática en GitHub Pages.

## Configuración de Supabase

1. Crear un proyecto de Supabase.
2. Ejecutar la migración `supabase/migrations/202607220001_reservation_system.sql`.
3. Ejecutar `supabase/seed.sql`.
4. Desplegar la función `admin-create-user`.
5. En Authentication, desactivar el registro público de usuarios.
6. Crear manualmente la primera cuenta administrativa.
7. Ejecutar `supabase/bootstrap-admin.sql.example` con el correo real de esa cuenta.
8. Copiar la URL del proyecto y la clave pública `anon` en `config.js`.
9. Agregar como URL permitida de autenticación:
   `https://escuela-de-ciencias-ambientales.github.io/reservas_aulas/`

La clave `anon` de Supabase está diseñada para utilizarse en el navegador. La clave `service_role` nunca debe guardarse en este repositorio ni en `config.js`; la función administrativa la recibe automáticamente en el entorno seguro de Supabase.

## Flujo de cuentas

La primera cuenta maestra se crea desde el panel de Supabase. A partir de ahí, el administrador puede crear las cuentas de los docentes desde la propia página. Cada profesor accede con una contraseña única y un correo con el formato `nombre.apellido.apellido@una.cr`. Su perfil visible muestra únicamente su nombre.

## Seguridad

La base de datos aplica políticas RLS. Un docente solo puede crear reservas a su nombre y cancelar las propias. El administrador puede gestionar todas. La restricción de exclusión de PostgreSQL impide reservas simultáneas incluso si dos personas intentan guardar al mismo tiempo. Un disparador adicional bloquea cruces con el horario académico fijo y otro impide superar las 50 cuentas docentes.

## Desarrollo local

Sirve la carpeta mediante cualquier servidor estático. Por ejemplo:

```text
python -m http.server 8781
```

Después abre `http://127.0.0.1:8781/`.

Sin credenciales en `config.js`, la interfaz carga en modo de configuración y mantiene visible el horario base, pero desactiva el acceso y la creación de reservas.
