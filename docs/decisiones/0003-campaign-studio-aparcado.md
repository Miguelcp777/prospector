# 0003 · Campaign Studio entra aparcado, no conectado

**Fecha:** septiembre 2026 · **Estado:** aceptada

## Contexto

`frontend/campaign-studio/` entró en `main` con el PR #3: 162 archivos, el
constructor de campañas v31. No dio ningún conflicto y no comparte un solo
archivo con el resto del proyecto — es puramente aditivo.

Que entre limpio no es lo mismo que que esté conectado, y conviene que quede
escrito antes de que alguien lo dé por hecho.

## Qué es hoy

Un **producto autónomo**, y lo dice su propia documentación. No habla con
Supabase:

| Pieza | Qué usa |
|---|---|
| Persistencia | Cloudflare D1 (SQLite) vía Drizzle |
| Identidad | Cabeceras `oai-authenticated-user-*` del hosting de OpenAI |
| Modelo | `OPENAI_API_KEY` |
| Despliegue | Next.js + Vite + Worker de Cloudflare |

`integration/prospector/supabase/001_campaign_studio.sql` **no es su
almacenamiento**: es el contrato para integrarlo más adelante. No se ha
ejecutado. Ejecutarlo hoy crearía nueve tablas vacías que nada escribiría.

## Decisión

Se fusiona sin conectar, y su SQL no se ejecuta hasta resolver lo de abajo.

## Qué hay que resolver antes de conectarlo

**1 · La función de tenant, o no funcionará nada.**

La migración resuelve la pertenencia leyendo el claim JWT `tenant_id`:

```sql
select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid
```

Los tokens de Prospector **no llevan ese claim**. Aquí la pertenencia se
resuelve por tabla, con `auth_tenant_id()` leyendo `profiles`.

Tal cual está, `current_tenant_id()` devolvería NULL para todo el mundo, las
políticas evaluarían `tenant_id = NULL` → falso, y el studio se vería vacío
**sin un solo mensaje de error**. Es el fallo más caro de diagnosticar de los
cinco, porque no parece un fallo.

El autor lo anticipó en `PROSPECTOR_INTEGRATION.md`: *«Si Prospector resuelve
pertenencia mediante una tabla de membresías, se sustituye solamente
`campaign_studio.current_tenant_id()`»*. Prospector es exactamente ese caso.

**2 · El gasto de IA se contaría por duplicado, o por ninguno.**

`campaign_studio.ai_usage_events` mide lo mismo que `consumo_modelo`, que es
de donde sale el coste por campaña del panel de administración (migración
024). Con las dos tablas vivas, el panel no vería nada de lo que gaste el
studio, y la unidad económica sobre la que se fija el precio de venta
quedaría corta.

`tarifas_modelo` ya admite varios proveedores: dar de alta OpenAI es una
fila, no una migración.

**3 · `tenant_id` sin clave foránea.**

Las nueve tablas lo declaran `not null` pero sin `references tenants(id)`. La
convención del proyecto lleva `on delete cascade`; sin ella, un id equivocado
crea filas huérfanas que no aparecen en ningún sitio.

**4 · La sesión de invitado.**

`lib/request-user.ts` acepta como usuario cualquier cadena de 20 a 80
caracteres alfanuméricos en la cabecera `x-aurevanta-session`. Es razonable
para un producto autónomo en demostración; no con los datos de clientes
reales delante.

**5 · Dónde se despliega.**

Trae `next.config.ts`, `vite.config.ts` y `worker/index.ts`. La decisión 0002
dice que Prospector no tiene servidor propio, y el frontend es Vite estático
en Netlify. Reconciliar eso es una decisión de arquitectura y merece su
propio documento, no colarse dentro de una integración.

## Consecuencias

- El repositorio crece 43.000 líneas que hoy no se ejecutan en producción.
  Es el precio de tenerlo versionado junto a lo demás en vez de en otro sitio
  donde se pierda.
- Nadie debe ejecutar `001_campaign_studio.sql` dando por hecho que "faltan
  las tablas". Faltan cinco decisiones antes que las tablas.
