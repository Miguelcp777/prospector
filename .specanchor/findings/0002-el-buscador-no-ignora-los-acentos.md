---
type: finding
status: resolved
created: 2026-09-16
visibility: cross-task
---

# Hallazgo: el buscador de Mensajes no ignora los acentos

## Observación

Buscar `peluqueria` en Mensajes devuelve **0 de 200**, aunque hay al menos dos
borradores cuyo asunto es «colaboración entre estudio de tatuajes y
**peluquería**». Con `Sandra` —sin acentos que perder— devuelve 2 de 200 sin
problema.

Encontrado de paso al verificar TASK-011, y es **anterior**: el filtro de
procedencia no lo toca.

## Causa

`Mensajes.tsx` compara con `toLowerCase()` e `includes()`, que bajan las
mayúsculas pero no descomponen los diacríticos. `peluquería` y `peluqueria`
son cadenas distintas y no hay forma de que una contenga a la otra.

La detección de columnas de TASK-010 ya resolvió exactamente esto en
`deteccion-de-columnas.ts` con `NFD` + borrado de diacríticos. Aquí no se
aplicó porque son dos módulos que nunca se miraron juntos.

## Por qué importa más de lo que parece

El proyecto trabaja en español y sobre negocios españoles. «Peluquería»,
«Óptica», «Panadería», «Fisioterapia», «Cafetería» — el buscador falla justo
en las palabras que alguien va a escribir para encontrar algo, y **falla en
silencio**: no dice «no encuentro», dice «0 de 200», que se lee como «no hay».

## Alcance

No es solo Mensajes. Conviene mirar el mismo patrón en Leads, Listas y
Supresiones antes de arreglarlo suelto: una función `normalizar()` compartida
en `lib/` vale para las cuatro, y cuatro arreglos independientes son cuatro
sitios donde se vuelve a olvidar.

## Fuera de alcance de TASK-011

Esa tarea añade un filtro por procedencia. Arreglar el buscador aquí habría
mezclado dos cosas en el mismo cambio y en la misma revisión.

## Resuelto

TASK-019, el 16 de septiembre de 2026. `frontend/src/lib/busqueda.ts` con
`plegar()` y `coincide()`, y las **cuatro** pantallas pasando por ahí:
Historial, Leads, Lista y Mensajes. Ocho pruebas nuevas, la primera es
literalmente el caso de este hallazgo.

Supresiones no estaba en la lista de verdad: **no tiene buscador**. Lo dije de
memoria al anotar esto y no lo comprobé; eran cuatro pantallas, no cinco.
