-- ============================================================
-- Prospector · 038 · el identificador del dominio en el proveedor
--
-- `config_correo` (028) ya guarda qué dominio quiere usar el cliente, en
-- qué estado está la verificación y qué registros DNS hay que poner. Lo
-- que no había era quién los rellena: `registros_dns` nace en '[]' y
-- `estado_dominio` en 'sin_verificar', y nada los movía nunca.
--
-- Los rellena la Edge Function `dominio-correo`, que da de alta el dominio
-- en el proveedor y pregunta por su estado. Para preguntar hace falta
-- recordar con qué identificador quedó dado de alta allí, y eso es esta
-- columna.
--
-- Va aquí y no en una tabla nueva porque es un atributo del mismo dominio:
-- una fila por tenant, que es lo que `config_correo` ya es.
-- ============================================================

alter table config_correo
  add column if not exists proveedor_dominio_id text;

comment on column config_correo.proveedor_dominio_id is
  'Identificador del dominio en el proveedor de correo (el id de Resend). Lo escribe solo la Edge Function con service_role; el cliente no puede tocarlo. Sin él no se puede volver a preguntar por el estado de verificación.';

-- No hace falta GRANT: 028 revocó UPDATE sobre la tabla entera y lo
-- devolvió columna a columna. Una columna nueva queda fuera de esa lista,
-- que es exactamente donde tiene que estar.
--
-- Y no es una precaución teórica: si el cliente pudiera escribir este id,
-- podría apuntarlo al dominio ya verificado de OTRO tenant y heredar su
-- verificación sin haber puesto un solo registro DNS.
