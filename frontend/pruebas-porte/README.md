# Pruebas del studio portado

Las pruebas que trae el Campaign Studio, apuntadas al studio que la
aplicación usa de verdad —`src/studio/`— en vez de a la subaplicación
autónoma de `campaign-studio/`, que no entra en el build.

```bash
npm run test:studio --prefix frontend
```

Son copias con las rutas reapuntadas, no un duplicado de la lógica: lo que
comprueban es el mismo contrato. Sirven para lo que el porte de la V45 tenía
de arriesgado — que el documento de plantilla, el renderizador de correo y
la finalización móvil sigan comportándose igual después de reconciliar dos
versiones del mismo archivo.

## Cuatro fallan, y tienen que fallar

**49 de 53.** Los cuatro fallos son las adaptaciones que el traslado hizo a
propósito, y por eso no se «arreglan»: arreglarlos sería deshacerlas.

| Prueba | Por qué falla aquí |
|---|---|
| `accepts isolated anonymous browser sessions` | `lib/request-user.ts` no existe: aceptaba como usuario cualquier cadena por cabecera. La identidad es la sesión de Supabase |
| `reference HTTP adapter keeps authorization server-side` | Es un archivo de la subaplicación Next. Aquí no hay servidor propio |
| `keeps upload chunks safely below the request limit` | El troceado existía por el tope de petición de un Worker de Cloudflare. `apiFetch` no sale a la red: le pasa el File a supabase-js |
| `all application themes reach portalled dialogs` | Exige la clase del tema en `<html>`. Aquí va en el shell del studio: fuera está el resto de Prospector |

Si algún día falla una **quinta**, eso sí es una regresión. Ver
`docs/decisiones/0005-v45-al-studio-de-la-app.md`.
