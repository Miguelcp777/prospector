---
type: module-spec
module: demo-publica
status: ready
source_paths:
  - demo/*
last_reviewed: 2026-09-14
---

# Módulo: demo-publica

## Responsabilidad

El escaparate sin sesión: un solo archivo estático que enseña la inferencia de
segmentos a quien no tiene cuenta.

## Propiedad del código

`demo/index.html`, `demo/README.md`, `demo/netlify.toml`. Sin build y sin
dependencias.

## Interfaces públicas

Llama a `demo-inferir` y a nada más. Funciona en dos modos, y el activo se ve
en la cabecera y en el pie: **simulado** (sin `SUPABASE_URL`) y **en vivo**.

## Invariantes de dominio

- **INV-DEM-001** · **No hay ninguna clave en este archivo, y no puede
  haberla.** Es un sitio estático y su código fuente es público. `demo-inferir`
  es pública a propósito; lo que la protege es la cuota, no un secreto.
- **INV-DEM-002** · Los leads son **siempre simulados**, en los dos modos.
  Descubrirlos de verdad consulta Places, que se paga y exige una campaña de
  un cliente real. La demo lo dice en pantalla en vez de dejarlo implícito:
  eso es lo que separa una demo honesta de una que miente sobre qué enseña.
- **INV-DEM-003** · Los nombres de negocio son inventados a propósito —llevan
  «Ejemplo» y el correo el prefijo `ejemplo-`—. Sustituirlos por reales exige
  revisar `docs/compliance.md` antes.
- **INV-DEM-004** · Las etiquetas de modo de la cabecera y el pie no se
  quitan. Quitarlas convierte la demo en un engaño.

## Dependencias

`inteligencia` (`demo-inferir`).

## Seguridad y permisos

`ORIGENES_PERMITIDOS` acota qué dominio puede incrustar la función. Con `*`
cualquiera la usa y la factura es nuestra.

## Pruebas y verificación

Ninguna automática. Se abre el archivo y se mira.

## Incertidumbres y deuda conocidas

- **OBSERVED** · La URL del proyecto se pega a mano en una constante; no lee
  variables de entorno porque no hay build.
- **UNKNOWN** · No consta cuándo se comprobó por última vez que el modo en
  vivo responde.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| No hay claves en `demo/index.html` | OBSERVED | `demo/README.md` y el propio archivo | — |
| Los leads son simulados en ambos modos | OBSERVED | `demo/README.md` | — |
