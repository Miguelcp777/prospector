# Informe de adopción de SDD · Prospector

**Fecha:** 2026-09-14
**Revisión de referencia:** `98f80dcf6bb3fd245c065fe7904e5593abf07110` (main)
**Alcance:** bootstrap documental. **Sin refactorizar código en ejecución.**

## Lo primero: el software no se ha tocado

Esto es lo que se pidió garantizar, así que se midió antes y después con los
mismos comandos.

| Comprobación | Antes | Después |
|---|---|---|
| `npx tsc -b --force` | salida 0 | salida 0 |
| `npm run build` | salida 0 | salida 0 |
| `index.css` | `index-B4-NYByt.css` | `index-B4-NYByt.css` |
| `Studio.css` | `Studio-BTkJqtpm.css` | `Studio-BTkJqtpm.css` |
| `Studio.js` | `Studio-CsSjkjdk.js` | `Studio-CsSjkjdk.js` |
| `index.js` | `index-BxRDyer5.js` | `index-BxRDyer5.js` |
| `npm run test:studio` | 75 · 71 ✓ · 4 ✗ | 75 · 71 ✓ · 4 ✗ |

Los cuatro hashes son idénticos: **el artefacto que se despliega es el mismo
byte a byte**. Y `git status` no lista ni un archivo modificado — todo lo que
aparece es nuevo y cuelga de `.specanchor/`, más la activación en `CLAUDE.md`
y `AGENTS.md`, que son instrucciones para agentes y no entran en el build.

Los 4 fallos de prueba son **anteriores** a esta adopción y están explicados
uno por uno en `docs/decisiones/0005` y en `modules/studio.spec.md`.

## Qué se ha hecho

1. **Instalada la skill** en `~/.claude/skills/sdd-spec-anchor/`, tras
   ejecutar sus 18 pruebas de regresión en esta máquina (18 correctas) y
   comparar lo extraído contra el artefacto original (idéntico).
2. **Inventariado el repositorio**: 361 archivos materiales.
3. **Nueve módulos** delimitados y mapeados, cada uno con su contrato escrito.
4. **Cinco especificaciones globales**: arquitectura, producto, calidad y
   seguridad, convenciones, puesta en marcha.
5. **Guard copiado y configurado** en `.specanchor/`.
6. **Línea base registrada** en `evidence/baseline.json`.

## Decisiones tomadas durante la adopción

**Los ADR se quedan donde estaban.** `docs/decisiones/0001`–`0005` es una serie
viva y bien escrita. La skill manda respetar las rutas establecidas; duplicarla
en `.specanchor/decisions/` habría creado dos sitios donde mirar y uno se
habría quedado atrás. Un ADR nuevo continúa esa numeración.

**`docs/` queda excluido de rutas materiales.** Es documentación, no código que
se ejecute. Las specs globales se siguen comprobando aunque la raíz de specs
esté excluida.

**`scripts/.gitkeep` excluido**, por ser un marcador de carpeta vacía. Un
script real que aparezca ahí saldrá como no mapeado y obligará a decidir su
módulo — que es el comportamiento que se quiere.

**Cuatro archivos pertenecen a dos módulos a la vez** y está declarado en
`spec-index.md`: tocarlos exige mirar las dos specs. No es un descuido del
mapa, es la costura real entre la aplicación y el correo.

**`campaign-studio-aparcado` se documenta como aparcado, no se especifica por
dentro.** Son 169 archivos que no entran en el build; documentar contratos de
algo que no se ejecuta sería inventar trabajo.

## Cobertura, separada en dos

| | Resultado |
|---|---|
| **Cobertura documental** | PASS · 361 materiales, 0 sin mapear |
| **Alineación funcional** | NOT_VERIFIED · esta adopción no cambia comportamiento, así que no hay nada que alinear |

No se declara `ALIGNED`: el guard no puede producir ese veredicto y aquí no se
ha ejecutado ninguna verificación semántica nueva. Lo que sí se ha ejecutado
está en la tabla de arriba.

## Lo que esta adopción NO consigue

- **No prueba que las specs digan la verdad.** Dicen lo que se ha observado y
  verificado, con el estado de cada afirmación marcado. Las marcadas
  `INFERRED` o `UNKNOWN` están sin confirmar y se llaman así.
- **No añade ni una prueba automática.** La cobertura de verificación sigue
  siendo la que era: 75 pruebas, todas del studio. Ocho de los nueve módulos
  no tienen ninguna.
- **No garantiza que la skill se active sola** en la próxima sesión. Por eso
  la activación se escribe en `CLAUDE.md` y `AGENTS.md`, y aun así hay que
  comprobarlo con un cambio real.
- **No hay CI.** Nada ejecuta el guard ni las pruebas automáticamente.

## Riesgos que quedan a la vista

| Riesgo | Estado |
|---|---|
| Sin CI, el guard depende de que alguien lo ejecute | abierto |
| `main` despliega a producción; no hay entorno de pruebas | abierto |
| La RLS nunca se ha probado con dos tenants y dos tokens | abierto |
| `app-web` (29 pantallas) sin una sola prueba | abierto |
| El MCP de Supabase sigue en modo escritura | decidido y aplazado |

## Siguientes pasos propuestos

1. **Pilotar con un cambio real**, pequeño, en un módulo con contrato claro.
   Es la única forma de saber si la carga de la tarea es proporcionada.
2. Integrar el guard y `npm run test:studio` en CI, con `--base` apuntando a
   la variable de rama de destino de la tubería, no a `main` por costumbre.
3. Empezar a cerrar la deuda de verificación por donde más duele: el
   aislamiento RLS y la resolución de claves por tenant.
