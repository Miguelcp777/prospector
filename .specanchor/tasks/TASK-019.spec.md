---
type: task-lite
id: TASK-019
status: verified
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: el buscador ignora los acentos

## Petición

Miguel: «arregla el buscador de acentos». Cierra `findings/0002`, anotado al
verificar TASK-011.

## Qué pasaba

Buscar `peluqueria` en Mensajes devolvía **0 de 200** habiendo dos borradores
cuyo asunto decía «colaboración entre estudio de tatuajes y **peluquería**».

`toLowerCase()` baja las mayúsculas pero **no descompone los diacríticos**, así
que «peluquería» y «peluqueria» son cadenas distintas y ninguna contiene a la
otra.

Esto trabaja en español y sobre negocios españoles —peluquería, óptica,
panadería, fisioterapia, cafetería—, o sea que fallaba justo en las palabras
que alguien va a escribir para encontrar algo. Y **fallaba en silencio**: no
decía «no encuentro», decía «0 de 200», que se lee como «no hay».

## Qué cambia

`frontend/src/lib/busqueda.ts`, con dos funciones:

- **`plegar()`** — minúsculas y sin tildes, **conservando todo lo demás**.
  `NFD` separa cada letra acentuada en letra + diacrítico y el reemplazo se
  lleva los sueltos.
- **`coincide(buscado, ...campos)`** — ¿alguno de los campos lo contiene?
  Con la búsqueda vacía devuelve `true`, que es lo que las cuatro pantallas
  hacían ya a mano antes de comparar.

Y las **cuatro** pantallas pasan por ahí: Historial, Leads, Lista y Mensajes.
Estaba repetido con el mismo error en las cuatro, así que arreglarlo cuatro
veces habría sido dejar cuatro sitios donde volver a olvidarlo.

## Dos decisiones que conviene justificar

**No se toca la puntuación.** `deteccion-de-columnas.ts` también tiene una
`normalizar()` que además aplasta arrobas, puntos y guiones a espacios — la
necesita, porque compara cabeceras de hoja de cálculo. Reutilizarla aquí
rompería buscar por dominio. Son dos normalizaciones distintas a propósito.

**La ñ se pliega**, así que «Muñoz» pasa a «munoz». En español la ñ es una
letra propia y no una n con virgulilla, así que en teoría es discutible. En un
buscador no lo es: hace que `munoz` encuentre «Muñoz», y `muñoz` lo sigue
encontrando porque los dos se pliegan a lo mismo. **Solo añade resultados,
nunca los quita.** Lo mismo con la ç.

## Aceptación

- **TASK-019/AC-001** · `peluqueria` encuentra «peluquería».
- **TASK-019/AC-002** · La puntuación se conserva: se puede seguir buscando
  por dominio, `@algo.es`.
- **TASK-019/AC-003** · El arreglo **amplía** lo que se encuentra y no
  convierte el buscador en un comodín.

## Evidencia

- **EV-001** · **Ocho pruebas nuevas** en `pruebas/busqueda.test.ts`, y la
  primera es literalmente el caso del hallazgo. Incluye las seis palabras del
  negocio español una por una, la ñ en los dos sentidos, la puntuación, la
  búsqueda vacía, los nulos y una que comprueba que lo que no está sigue sin
  estar.
- **EV-002** · `npm run test:importacion` → **42 de 42**, `# fail 0` (eran 34).
  `tsc -b --force` → 0. `npm run build` → correcto, principal 646,17 kB —
  **baja** de 646,46: cuatro filtros a mano pesan más que una función. Pruebas
  del studio sin fallos nuevos.
- **EV-003** · **En Mensajes, en producción**, con el paquete servido
  comprobado antes (`index-CmPQTyUX.js`):

  | Se busca | Contador |
  |---|---|
  | `peluqueria` sin tilde | **5 de 200** — antes **0 de 200** |
  | `peluquería` con tilde | 5 de 200 — lo que ya funcionaba |
  | `dentista` | **0 de 200** — sigue sin ser un comodín |

  Cinco, no dos: al anotar el hallazgo dije «dos borradores» contando los que
  vi en pantalla. Eran cinco.

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | Prueba automática con el caso exacto del hallazgo | **pass** | EV-001 |
| AC-002 | Prueba del correo con dominio y tilde dentro | **pass** | EV-001 |
| AC-003 | Prueba de que «dentista» no encuentra «Óptica La Almudena» | **pass** | EV-001 |
| AC-001 | En producción: 5 de 200 con y sin tilde, 0 con «dentista» | **pass** · VERIFIED | EV-003 |

## Dos cosas que se corrigen de paso

**El hallazgo decía cinco pantallas y son cuatro.** Nombré Supresiones de
memoria al anotarlo y **no lo comprobé**: no tiene buscador. Queda corregido
en el propio hallazgo.

**El guion `test:importacion` se le ha quedado corto el nombre**: ya corre
también las pruebas del buscador, y correrá las del siguiente módulo puro que
haya. Renombrarlo toca `package.json`, el CI y `entrega.spec.md`, así que no
entra aquí — pero queda dicho, porque un guion que se llama distinto de lo que
hace es de las cosas que despistan a los seis meses.

## Revisión final

- Cobertura documental: **PASS**.
- Spec → Código: **ALIGNED** — `INV-WEB-017`.
- Código → Spec: **ALIGNED**.

Solo se comprobó en pantalla **Mensajes**, que es donde apareció el fallo. Las
otras tres llaman a la misma función y están cubiertas por las ocho pruebas,
pero no se han abierto: si alguna tiene un problema, será de cómo pasa los
campos, no del plegado.
