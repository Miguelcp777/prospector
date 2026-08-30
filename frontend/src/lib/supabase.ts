// ============================================================
// Cliente de Supabase para el navegador.
//
// Usa la clave publicable, que es pública a propósito: viaja en el bundle y
// cualquiera puede leerla. Lo que la hace segura no es el secreto, son las
// políticas RLS — sin fila en `profiles`, `auth_tenant_id()` devuelve null y
// no se ve absolutamente nada.
//
// La `service_role` no aparece en este archivo ni en ningún otro de
// `frontend/`. Se salta la RLS entera y vive solo en el servidor.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !clave) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copia frontend/.env.example a frontend/.env.local y rellénalos.",
  );
}

export const supabase = createClient(url, clave);
