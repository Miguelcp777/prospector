-- ============================================================
-- Prospector · 054 · las listas de contactos del cliente
--
-- EL PROBLEMA
--
-- Hasta hoy la única forma de que exista un destinatario es el
-- descubrimiento de Google Places: `functions/descubrir` es el único punto
-- de inserción en `leads` de todo el repositorio. Un cliente que ya tiene
-- su cartera —en un CRM o en un Excel— no puede usarla.
--
-- Y cada cliente la tiene de una forma distinta: columnas con otros
-- nombres, en otro orden, en otro idioma, a veces sin cabecera.
--
-- LO QUE HACE ESTA MIGRACIÓN
--
-- Tres tablas y dos funciones. Las listas viven fuera de las campañas y se
-- **vuelcan** a la campaña que se quiera, tantas veces como haga falta.
--
-- EL MARCO LEGAL CAMBIA, Y CONVIENE QUE ESTÉ ESCRITO AQUÍ
--
-- `docs/compliance.md` apunta a buzones genéricos de empresa porque toda su
-- estrategia está pensada para correo EN FRÍO: escribir a quien no te ha
-- dado su dirección. Una lista que aporta el cliente de su propia cartera
-- es otra cosa: él es el responsable del tratamiento y la base legal la
-- pone él; nosotros somos encargados.
--
-- Lo que NO cambia, y sigue valiendo en los dos caminos: enlace de baja en
-- cada mensaje, lista de supresión global respetada, y registro de origen
-- del dato por lead. Esta migración construye lo tercero.
--
-- EL ARCHIVO ORIGINAL NO SE GUARDA
--
-- El registro de origen que pide compliance.md se satisface con el nombre
-- del archivo, la fecha, quién lo subió, cuántas filas traía y qué mapeo se
-- usó — y las filas están guardadas una a una con su número de fila. El
-- .xlsx encima solo duplicaría la superficie de datos personales sin
-- añadir información. Se asume la consecuencia: tienes las filas, no el
-- archivo.
--
-- LO QUE ESTA MIGRACIÓN NO TRAE
--
-- El envío masivo, que no existe, y los dos interruptores que lo
-- gobernarán (tenants.envio_en_frio_autorizado y
-- campaigns.enviar_a_descubiertos). Van con la migración de envío: hoy no
-- tendrían nada que gobernar, y un control que no puede hacer nada es un
-- fallo, no una preparación. Lo que sí entra es su cimiento:
-- leads.fuente = 'lista', la columna sobre la que discriminarán.
--
-- Ver .specanchor/tasks/TASK-010.spec.md
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El tope, en ajustes y no en el código
--
-- Por lo mismo que max_leads_demo (039): subírselo a un cliente es un
-- UPDATE, no un despliegue. Y vive en la base y no en el navegador porque
-- un límite de interfaz lo esquiva cualquiera llamando a la RPC desde la
-- consola con la clave publicable, que viaja en el bundle.
-- ------------------------------------------------------------
alter table ajustes add column if not exists max_contactos_por_lista int not null default 2000
  check (max_contactos_por_lista between 1 and 50000);

comment on column ajustes.max_contactos_por_lista is
  'Cuántos contactos como mucho admite una lista importada. El tope de verdad: el del navegador es solo el mensaje.';

-- ------------------------------------------------------------
-- 2 · La lista
-- ------------------------------------------------------------
create table if not exists listas_de_contactos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade
                    default auth_tenant_id(),
  nombre            text not null,

  -- Registro de origen. El archivo no se guarda; su procedencia sí.
  origen            text not null check (origen in ('csv','xlsx','portapapeles')),
  archivo_nombre    text,
  archivo_mime      text,
  archivo_tamano    int,
  codificacion      text,
  -- Las cabeceras tal cual venían y qué rol se le dio a cada una. Sin esto
  -- no se puede reconstruir por qué una dirección acabó en la columna de
  -- email, que es justo lo que hay que poder explicar.
  cabeceras         text[] not null default '{}',
  mapeo             jsonb  not null default '{}'::jsonb,

  filas_leidas      int not null default 0,
  filas_validas     int not null default 0,
  filas_descartadas int not null default 0,

  subido_por        uuid references auth.users(id) on delete set null default auth.uid(),
  -- El correo se congela: el usuario puede borrarse y la lista sigue
  -- teniendo que decir quién la subió. Mismo criterio que
  -- messages.email_destino (012).
  subido_por_email  text,

  -- La declaración del cliente, con su texto literal y su fecha. Es lo que
  -- convierte «asumimos que tiene permiso» en un acto registrado con autor.
  consentimiento       boolean not null default false,
  consentimiento_texto text,
  consentimiento_en    timestamptz,

  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index if not exists listas_tenant on listas_de_contactos(tenant_id, creado_en desc);
create unique index if not exists listas_nombre_unico
  on listas_de_contactos(tenant_id, lower(nombre));

alter table listas_de_contactos enable row level security;

drop policy if exists listas_del_tenant on listas_de_contactos;
create policy listas_del_tenant on listas_de_contactos
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

comment on column listas_de_contactos.mapeo is
  'Qué cabecera se usó para cada rol. Es la mitad de la respuesta a «de dónde salió esta dirección».';

-- ------------------------------------------------------------
-- 3 · Los contactos
-- ------------------------------------------------------------
create table if not exists contactos_de_lista (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade
              default auth_tenant_id(),
  lista_id    uuid not null references listas_de_contactos(id) on delete cascade,

  -- Fila del archivo original, 1-indexada y sin contar la cabecera.
  -- «Lista X, fila 37» es una respuesta a una reclamación; «lo subió el
  -- cliente» no lo es.
  fila        int not null,

  email       text,               -- normalizado aquí: lower(btrim())
  nombre      text,
  empresa     text,
  telefono    text,
  web         text,
  -- Las columnas que no se mapearon, por si el cliente pregunta. Nada más
  -- las lee: el redactor no saca texto de aquí.
  extra       jsonb not null default '{}'::jsonb,

  estado      text not null default 'valido'
              check (estado in ('valido','sin_email','email_invalido')),
  creado_en   timestamptz not null default now()
);

create index if not exists contactos_lista  on contactos_de_lista(lista_id, fila);
create index if not exists contactos_tenant on contactos_de_lista(tenant_id);
-- La misma dirección dos veces en una lista es ruido, no dos contactos.
create unique index if not exists contactos_email_unico
  on contactos_de_lista(lista_id, email) where email is not null;

alter table contactos_de_lista enable row level security;

-- Tres políticas y no una `for all`, a propósito: el INSERT no se concede a
-- nadie. La única vía de entrada es guardar_lista(), que es donde vive el
-- tope de max_contactos_por_lista. Con una política de inserción, ese tope
-- se esquiva metiendo filas directamente por PostgREST.
drop policy if exists contactos_lectura    on contactos_de_lista;
drop policy if exists contactos_correccion on contactos_de_lista;
drop policy if exists contactos_borrado    on contactos_de_lista;

create policy contactos_lectura on contactos_de_lista
  for select using (tenant_id = auth_tenant_id());
create policy contactos_correccion on contactos_de_lista
  for update using (tenant_id = auth_tenant_id())
         with check (tenant_id = auth_tenant_id());
create policy contactos_borrado on contactos_de_lista
  for delete using (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 4 · El histórico de volcados
-- ------------------------------------------------------------
create table if not exists volcados_de_lista (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade
                 default auth_tenant_id(),
  lista_id       uuid not null references listas_de_contactos(id) on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,

  insertados     int not null default 0,
  duplicados     int not null default 0,
  suprimidos     int not null default 0,
  sin_email      int not null default 0,
  fuera_por_demo int not null default 0,

  hecho_por      uuid references auth.users(id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now()
);

create index if not exists volcados_campana on volcados_de_lista(campaign_id, creado_en desc);
create index if not exists volcados_lista   on volcados_de_lista(lista_id, creado_en desc);

alter table volcados_de_lista enable row level security;
drop policy if exists volcados_del_tenant on volcados_de_lista;
create policy volcados_del_tenant on volcados_de_lista
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 5 · Lo que cambia en leads
-- ------------------------------------------------------------
alter table leads add column if not exists contacto_id uuid
  references contactos_de_lista(id) on delete set null;

create index if not exists leads_contacto on leads(contacto_id)
  where contacto_id is not null;

-- Sin este índice, cruzar 2.000 direcciones contra una campaña de 900 leads
-- es un seq scan por fila.
create index if not exists leads_campana_email on leads(campaign_id, lower(email))
  where email is not null;

comment on column leads.contacto_id is
  'De qué contacto de qué lista salió este lead. Nulo = vino del descubrimiento.';
comment on column leads.fuente is
  'De dónde salió la fila: places (descubrimiento) o lista (importación del cliente). Sin check a propósito: una fuente nueva no debería exigir una migración.';

-- ------------------------------------------------------------
-- 6 · La vista que dice si un contacto está suprimido
--
-- security_invoker = on no es un detalle: sin él la vista corre con los
-- privilegios de su dueño, se salta la RLS de contactos_de_lista, y un
-- tenant lee los contactos de otro. Es el fallo más caro de esta migración
-- y el más fácil de pasar por alto.
-- ------------------------------------------------------------
create or replace view v_contactos_de_lista as
select c.id, c.lista_id, c.tenant_id, c.fila, c.email, c.nombre, c.empresa,
       c.telefono, c.web, c.estado, c.extra, c.creado_en,
       case when c.email is null then false
            else esta_suprimido(c.email, c.tenant_id) end as suprimido
  from contactos_de_lista c;

alter view v_contactos_de_lista set (security_invoker = on);
grant select on v_contactos_de_lista to authenticated;

-- ------------------------------------------------------------
-- 7 · guardar_lista — la única puerta de entrada
-- ------------------------------------------------------------
create or replace function guardar_lista(
  p_nombre               text,
  p_origen               text,
  p_archivo_nombre       text,
  p_archivo_mime         text,
  p_archivo_tamano       int,
  p_codificacion         text,
  p_cabeceras            text[],
  p_mapeo                jsonb,
  p_consentimiento_texto text,
  p_filas                jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant  uuid := auth_tenant_id();
  v_tope    int;
  v_lista   uuid;
  v_total   int := coalesce(jsonb_array_length(p_filas), 0);
  v_validas int;
begin
  if v_tenant is null then
    raise exception 'No autorizado';
  end if;

  if p_origen not in ('csv','xlsx','portapapeles') then
    raise exception 'Origen desconocido: %', p_origen;
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'La lista necesita un nombre';
  end if;

  -- Sin declaración no se guarda. Es lo que convierte el supuesto legal en
  -- un acto con autor y fecha.
  if coalesce(btrim(p_consentimiento_texto), '') = '' then
    raise exception 'Una lista no se guarda sin la declaración de origen de los datos';
  end if;

  if v_total = 0 then
    raise exception 'La lista no trae ninguna fila';
  end if;

  select max_contactos_por_lista into v_tope from ajustes limit 1;
  if v_total > coalesce(v_tope, 2000) then
    raise exception 'Una lista admite como mucho % contactos, y esta trae %.',
      coalesce(v_tope, 2000), v_total;
  end if;

  insert into listas_de_contactos (
    tenant_id, nombre, origen, archivo_nombre, archivo_mime, archivo_tamano,
    codificacion, cabeceras, mapeo, filas_leidas,
    subido_por, subido_por_email,
    consentimiento, consentimiento_texto, consentimiento_en
  ) values (
    v_tenant, btrim(p_nombre), p_origen, p_archivo_nombre, p_archivo_mime,
    p_archivo_tamano, p_codificacion,
    coalesce(p_cabeceras, '{}'), coalesce(p_mapeo, '{}'::jsonb), v_total,
    auth.uid(), (select email from profiles where id = auth.uid()),
    true, btrim(p_consentimiento_texto), now()
  )
  returning id into v_lista;

  -- La normalización vive aquí y no en el navegador: si mañana hay otra vía
  -- de entrada, la dirección se guarda igual. lower(btrim()) y nada más —
  -- la comprobación de verdad de un correo es que llegue.
  insert into contactos_de_lista (
    tenant_id, lista_id, fila, email, nombre, empresa, telefono, web, extra, estado
  )
  select
    v_tenant, v_lista,
    (f->>'fila')::int,
    nullif(lower(btrim(coalesce(f->>'email',''))), ''),
    nullif(btrim(coalesce(f->>'nombre','')),   ''),
    nullif(btrim(coalesce(f->>'empresa','')),  ''),
    nullif(btrim(coalesce(f->>'telefono','')), ''),
    nullif(btrim(coalesce(f->>'web','')),      ''),
    coalesce(f->'extra', '{}'::jsonb),
    case
      when nullif(btrim(coalesce(f->>'email','')), '') is null then 'sin_email'
      when lower(btrim(f->>'email')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        then 'email_invalido'
      else 'valido'
    end
  from jsonb_array_elements(p_filas) as f
  -- La dirección repetida dentro del mismo archivo se queda fuera; el
  -- contador de descartadas la recoge abajo.
  --
  -- El `where email is not null` no es decoración: contactos_email_unico es
  -- un índice PARCIAL, y Postgres no lo infiere si el ON CONFLICT no repite
  -- su predicado. Sin él: «there is no unique or exclusion constraint
  -- matching the ON CONFLICT specification», en tiempo de ejecución y no al
  -- crear la función.
  on conflict (lista_id, email) where email is not null do nothing;

  select count(*) filter (where estado = 'valido') into v_validas
    from contactos_de_lista where lista_id = v_lista;

  update listas_de_contactos
     set filas_validas = v_validas,
         filas_descartadas = v_total - v_validas,
         actualizado_en = now()
   where id = v_lista;

  return v_lista;
end;
$fn$;

-- ------------------------------------------------------------
-- 8 · volcar_lista_en_campana — de la lista a los leads
-- ------------------------------------------------------------
create or replace function volcar_lista_en_campana(
  p_lista   uuid,
  p_campana uuid
)
returns table (
  insertados int, duplicados int, suprimidos int, sin_email int, fuera_por_demo int
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant_lista   uuid;
  v_tenant_campana uuid;
  v_capturado      timestamptz;
  v_huecos         int;
  v_max_demo       int;
  v_tope           int;
  v_ins  int := 0;
  v_dup  int := 0;
  v_sup  int := 0;
  v_sin  int := 0;
  v_demo int := 0;
  -- Un contacto de la cartera del cliente no es peor candidato que un
  -- negocio sacado de un mapa. Sin score quedaría el último en el
  -- order by l.score desc nulls last de encolar_redaccion (046) y se
  -- caería del tope por tanda en una campaña mixta.
  c_score constant int := 80;
begin
  select tenant_id, creado_en into v_tenant_lista, v_capturado
    from listas_de_contactos where id = p_lista;
  select tenant_id into v_tenant_campana from campaigns where id = p_campana;

  if v_tenant_lista   is null then raise exception 'Lista no encontrada';   end if;
  if v_tenant_campana is null then raise exception 'Campaña no encontrada'; end if;

  -- Los DOS. Comprobar solo el de la campaña deja volcar la lista de otro
  -- tenant en la campaña propia, que es la fuga entera.
  if v_tenant_lista   is distinct from auth_tenant_id()
  or v_tenant_campana is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  -- Modo demo. No hay trigger sobre leads que imponga huecos_de_leads (045):
  -- solo lo miran encolar_descubrimiento y reclamar_tareas. Si esta función
  -- no lo mirase, importar sería el agujero por el que se salta el techo.
  v_huecos := huecos_de_leads(p_campana);
  if v_huecos = 0 then
    select max_leads_demo into v_max_demo from ajustes limit 1;
    raise exception
      'Esta cuenta usa la versión de prueba y la campaña ya tiene sus % leads. %',
      v_max_demo, aviso_version_de_prueba();
  end if;
  v_tope := coalesce(v_huecos, 2147483647);

  -- El recuento se hace ANTES de insertar, sobre el estado de partida: si
  -- se hiciera después, los que acaban de entrar contarían como duplicados.
  select
    count(*) filter (where c.estado <> 'valido'),
    count(*) filter (where c.estado = 'valido'
                       and esta_suprimido(c.email, v_tenant_lista)),
    count(*) filter (where c.estado = 'valido'
                       and not esta_suprimido(c.email, v_tenant_lista)
                       and exists (select 1 from leads l
                                    where l.campaign_id = p_campana
                                      and lower(l.email) = c.email))
    into v_sin, v_sup, v_dup
    from contactos_de_lista c
   where c.lista_id = p_lista;

  with elegibles as (
    select c.*
      from contactos_de_lista c
     where c.lista_id = p_lista
       and c.estado = 'valido'
       and not esta_suprimido(c.email, v_tenant_lista)
       and not exists (select 1 from leads l
                        where l.campaign_id = p_campana
                          and lower(l.email) = c.email)
     order by c.fila
     limit v_tope
  )
  insert into leads (
    tenant_id, campaign_id, place_id, nombre, email, telefono, web,
    score, estado, fuente, email_origen, email_capturado_en, contacto_id
  )
  select
    v_tenant_lista, p_campana,
    -- place_id sintético: convierte el unique (campaign_id, place_id) que
    -- ya existe en la garantía de «una dirección, un lead por campaña». El
    -- prefijo evita cualquier choque con un identificador de Google.
    'email:' || e.email,
    -- leads.nombre es NOT NULL. La parte local nunca queda vacía porque
    -- estado='valido' exige un @ con algo delante.
    coalesce(e.nombre, e.empresa, split_part(e.email, '@', 1)),
    e.email, e.telefono, e.web,
    c_score, 'nuevo', 'lista',
    -- El registro de origen que pide compliance.md, apuntando a la fila
    -- concreta del archivo concreto.
    format('lista:%s#fila-%s', p_lista, e.fila),
    -- Cuándo el cliente aportó el dato, no cuándo se volcó. Un segundo
    -- volcado no rejuvenece el dato.
    v_capturado,
    e.id
  from elegibles e
  on conflict (campaign_id, place_id) do nothing;

  get diagnostics v_ins = row_count;

  -- Cuántos se quedaron fuera por el techo de la versión de prueba: los
  -- elegibles que después del insert siguen sin tener lead en la campaña.
  if v_huecos is not null then
    select count(*)::int into v_demo
      from contactos_de_lista c
     where c.lista_id = p_lista
       and c.estado = 'valido'
       and not esta_suprimido(c.email, v_tenant_lista)
       and not exists (select 1 from leads l
                        where l.campaign_id = p_campana
                          and lower(l.email) = c.email);
  end if;

  insert into volcados_de_lista (
    tenant_id, lista_id, campaign_id,
    insertados, duplicados, suprimidos, sin_email, fuera_por_demo
  ) values (
    v_tenant_lista, p_lista, p_campana, v_ins, v_dup, v_sup, v_sin, v_demo
  );

  return query select v_ins, v_dup, v_sup, v_sin, v_demo;
end;
$fn$;

-- ------------------------------------------------------------
-- 9 · Permisos
--
-- Las dos son SECURITY DEFINER y se saltan la RLS: la comprobación de
-- tenant que llevan dentro es lo único que las separa de una fuga.
-- Postgres las abre a public por defecto, así que se cierran aquí, en esta
-- misma migración.
-- ------------------------------------------------------------
revoke execute on function guardar_lista(text,text,text,text,int,text,text[],jsonb,text,jsonb)
  from public, anon;
revoke execute on function volcar_lista_en_campana(uuid,uuid) from public, anon;

grant execute on function guardar_lista(text,text,text,text,int,text,text[],jsonb,text,jsonb)
  to authenticated;
grant execute on function volcar_lista_en_campana(uuid,uuid) to authenticated;
