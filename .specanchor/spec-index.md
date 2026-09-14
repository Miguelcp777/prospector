# Índice de especificaciones

Revisión de referencia: `98f80dcf6bb3fd245c065fe7904e5593abf07110`.
361 archivos materiales, 0 sin mapear.

## Módulos

| Módulo | Rutas | Spec | Estado | Revisado | Pruebas |
|---|---|---|---|---|---|
| `datos` | `supabase/*.sql`, `supabase/README.md`, `.mcp.json` | [`modules/datos.spec.md`](modules/datos.spec.md) | ready | 2026-09-14 | ninguna |
| `edge-nucleo` | `supabase/functions/_shared/*`, `supabase/config.toml` | [`modules/edge-nucleo.spec.md`](modules/edge-nucleo.spec.md) | ready | 2026-09-14 | ninguna |
| `descubrimiento` | `supabase/functions/{descubrir,enriquecer}/*` | [`modules/descubrimiento.spec.md`](modules/descubrimiento.spec.md) | ready | 2026-09-14 | ninguna |
| `inteligencia` | 7 funciones de modelo + `data/*` | [`modules/inteligencia.spec.md`](modules/inteligencia.spec.md) | ready | 2026-09-14 | indirectas |
| `correo` | 6 funciones + `aplicar-plantilla.ts` + páginas públicas | [`modules/correo.spec.md`](modules/correo.spec.md) | ready | 2026-09-14 | indirectas |
| `app-web` | `frontend/src/{pages,lib,components}/*`, `App.tsx` | [`modules/app-web.spec.md`](modules/app-web.spec.md) | ready | 2026-09-14 | **ninguna** |
| `studio` | `frontend/src/studio/*`, `pruebas-porte/*` | [`modules/studio.spec.md`](modules/studio.spec.md) | ready | 2026-09-14 | 75 (71 ✓) |
| `demo-publica` | `demo/*` | [`modules/demo-publica.spec.md`](modules/demo-publica.spec.md) | ready | 2026-09-14 | ninguna |
| `campaign-studio-aparcado` | `frontend/campaign-studio/*` | [`modules/campaign-studio-aparcado.spec.md`](modules/campaign-studio-aparcado.spec.md) | **parked** | 2026-09-14 | no se ejecutan |

## Especificaciones globales

- [`global/arquitectura.spec.md`](global/arquitectura.spec.md) — lo estructural que no se rompe sin ADR
- [`global/producto.spec.md`](global/producto.spec.md) — qué promete el producto y qué no
- [`global/calidad-y-seguridad.spec.md`](global/calidad-y-seguridad.spec.md) — qué hay que poder afirmar antes de cerrar
- [`global/convenciones.spec.md`](global/convenciones.spec.md) — cómo se escribe aquí
- [`global/puesta-en-marcha.spec.md`](global/puesta-en-marcha.spec.md) — comandos reales y su resultado medido

## Decisiones (fuera de este árbol, a propósito)

`docs/decisiones/` — `0001` Supabase · `0002` worker troceado · `0003`
campaign-studio aparcado · `0004` quién es el remitente · `0005` la V45 al
studio.

## Solapamientos declarados

Un archivo puede pertenecer a dos módulos; entonces **las dos specs** tienen
que mirarse al cambiarlo.

| Archivo | Módulos |
|---|---|
| `frontend/src/lib/aplicar-plantilla.ts` | `app-web` + `correo` |
| `frontend/src/lib/plantilla-por-defecto.ts` | `app-web` + `correo` |
| `frontend/public/baja.html` | `app-web` + `correo` |
| `frontend/public/landing.html` | `app-web` + `correo` |

## Cobertura, dicha con honestidad

Nueve módulos tienen contrato escrito. **Uno solo tiene pruebas
automáticas.** La cobertura documental es completa; la de verificación, no, y
las specs lo dicen módulo por módulo en vez de dejarlo suponer.
