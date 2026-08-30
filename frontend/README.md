# Frontend

La aplicación real. Vite + React + TypeScript.

Hoy solo tiene autenticación: registro con contraseña, entrada y una pantalla
mínima que enseña el tenant. Onboarding, campañas y leads van encima de esto.

## Arrancar

```bash
cp .env.example .env.local   # y rellena los dos valores
npm install
npm run dev
```

En http://localhost:5173.

## Las dos variables

| Variable | Qué es |
|---|---|
| `VITE_SUPABASE_URL` | La URL del proyecto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | La clave `sb_publishable_…` |

Las dos son **públicas por definición**: viajan en el bundle y cualquiera que
abra las herramientas de desarrollo las lee. Lo que protege los datos no son
ellas, son las políticas RLS.

`SUPABASE_SERVICE_ROLE_KEY` no aparece aquí, ni debe. Se salta la RLS entera.

## Cómo funciona el alta

El formulario manda los datos del negocio como metadata del `signUp`:

```ts
supabase.auth.signUp({
  email, password,
  options: { data: { negocio, vertical, ciudad } },
});
```

El trigger `crear_tenant_y_perfil` (`supabase/005_alta_de_usuarios.sql`) los
lee de `raw_user_meta_data` y crea el tenant y el perfil de propietario. Los
nombres de esas tres claves tienen que coincidir con los del SQL.

Sin fila en `profiles`, `auth_tenant_id()` devuelve null y la RLS oculta
todo: el usuario entraría a una aplicación vacía sin entender por qué.

## Confirmación por email

**Está activada en el proyecto.** `signUp` devuelve usuario pero no sesión, y
hasta que no se abre el enlace del correo no se puede entrar. La pantalla de
registro lo dice; sin ese aviso parecería que no ha pasado nada.

Para desarrollo se puede desactivar en el panel de Supabase, en
Authentication → Sign In / Providers → Confirm email. Acuérdate de volver a
activarla antes de tener usuarios de verdad.

## Verificado

Ejecutado, no supuesto:

- Contraseñas que no coinciden → error en pantalla, sin llamada a Supabase
- Alta completa → usuario, tenant y perfil `propietario` creados por el trigger
- `options.data` llega a `raw_user_meta_data` con los tres campos
- `npm run build` compila sin errores de TypeScript

Sin verificar: el enlace de confirmación del correo, porque la prueba se hizo
con un dominio sin buzón. Haz un alta con tu email real para cerrar eso.

## Qué falta

- Recuperación de contraseña (`resetPasswordForEmail`)
- Invitar miembros a un tenant existente — hoy cada alta crea un tenant nuevo
- Las tres pantallas del MVP: onboarding, campañas, leads
- Despliegue: aún no está en Netlify. La demo y la app son sitios distintos
