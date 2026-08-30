# Supabase

## Puesta en marcha

1. **Crear el proyecto** en supabase.com. Elige **región europea**
   (Frankfurt o Irlanda). Esto no se puede cambiar después sin migrar.

2. **Cargar el esquema.** SQL Editor → pegar `schema.sql` → ejecutar.
   Crea las tablas, las políticas RLS, la vista de resumen y la función de
   scoring.

3. **Desplegar la función de inferencia:**

   ```bash
   supabase link --project-ref TU_REF
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy infer-segments
   ```

4. **Crear el primer tenant a mano** (todavía no hay pantalla de alta):

   ```sql
   insert into tenants (nombre, vertical, ciudad)
   values ('Clínica de prueba', 'fisioterapia', 'Valencia')
   returning id;

   -- Después de registrar el usuario desde la app:
   insert into profiles (id, tenant_id, email, rol)
   values ('UUID_DE_AUTH_USERS', 'UUID_DEL_TENANT', 'tu@email.com', 'propietario');
   ```

## Probar la inferencia

```bash
curl -X POST https://TU_REF.supabase.co/functions/v1/infer-segments \
  -H "Authorization: Bearer TU_TOKEN_DE_USUARIO" \
  -H "Content-Type: application/json" \
  -d '{"descripcion":"Clínica de fisioterapia y readaptación deportiva, cuatro fisios, mucha lesión deportiva","vertical":"fisioterapia","ciudad":"Valencia"}'
```

Sin `campaign_id` devuelve los segmentos sin guardarlos. Con él, los persiste y
marca la campaña como `inferido`.

## Claves

| Clave | Dónde | Qué puede |
|---|---|---|
| `anon` | Frontend | Solo lo que permitan las políticas RLS |
| `service_role` | Servidor, nunca fuera | Todo. Se salta la RLS por completo |

Si `service_role` acaba en el navegador, cualquiera puede leer los leads de
todos los clientes. Es el único error de este proyecto que no tiene arreglo
discreto.

## Comprobar que la RLS funciona

Crea dos tenants con un usuario cada uno, inserta una campaña en cada uno y
consulta con el token del primero. Si ves las dos campañas, la RLS no está
activa — revisa que `auth_tenant_id()` devuelve valor y que el usuario tiene
fila en `profiles`.

## Pendiente

- Worker de descubrimiento que consuma la tabla `jobs`.
- Edge Function de generación de mensajes.
- Trigger de alta que cree tenant y perfil automáticamente al registrarse.
