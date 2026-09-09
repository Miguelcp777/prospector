-- ============================================================
-- Prospector · 037 · respetar el diseño de una plantilla, y el botón
--
-- Al vestir un mensaje, `aplicar-plantilla.ts` tira todos los bloques que
-- no estén en una lista blanca corta, y el botón siempre. El motivo era
-- bueno: las plantillas del catálogo traen copy de muestra —"01 · CREA /
-- 02 · CONVIERTE", "Hola María", el pie de otra empresa— y dejarlo pasar
-- lo manda dentro de un correo real a un lead real.
--
-- Lo que ese filtro no sabe distinguir es el relleno del catálogo del
-- texto que el cliente ha escrito a propósito. Ante la duda borra, y a
-- quien ha diseñado su plantilla entera le llega media.
--
-- Esta columna es esa distinción, declarada a mano. Va en la plantilla y
-- no en la campaña porque lo que se afirma es sobre el DISEÑO: "este copy
-- lo he revisado y es mío". Aplicarla a diez campañas no lo vuelve menos
-- cierto.
--
-- Por defecto FALSE, y eso importa: una plantilla recién traída del
-- catálogo tiene que seguir pasando por el filtro. El interruptor es algo
-- que alguien enciende después de leer lo que va a salir.
-- ============================================================

alter table plantillas
  add column if not exists respetar_diseno boolean not null default false;

comment on column plantillas.respetar_diseno is
  'Si es true, al vestir un mensaje se conservan TODOS los bloques del diseño y el titular tal como se guardaron. El texto del lead, la marca y el pie legal se siguen sustituyendo. Por defecto false: el copy del catálogo no debe salir a un lead sin que alguien lo haya leído.';

-- Sin GRANT ni política nuevos: `plantillas_del_tenant` (025) es `for all`
-- sobre la tabla entera, y plantillas no tiene concesión por columna. Una
-- columna nueva queda cubierta por lo que ya hay.
