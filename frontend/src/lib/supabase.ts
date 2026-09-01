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

// ------------------------------------------------------------
// "Mantener la sesión"
//
// supabase-js guarda la sesión en localStorage y ahí se queda hasta que
// alguien cierre sesión: cerrar el navegador no basta. En un ordenador
// compartido —la recepción de una clínica es exactamente eso— eso no es lo
// que espera quien desmarca la casilla.
//
// Así que el almacén se elige: localStorage si quiere recordarla,
// sessionStorage si no, que muere con la pestaña. La preferencia sí vive
// siempre en localStorage, porque hay que poder leerla antes de que exista
// ninguna sesión.
//
// Todo entre try/catch: en modo privado, o con las cookies de sitio
// bloqueadas, el propio acceso al almacén lanza excepción.
// ------------------------------------------------------------
const CLAVE_RECORDAR = "prospector.recordar-sesion";

/** La llama la pantalla de entrada justo antes de autenticar. */
export function recordarSesion(recordar: boolean) {
  try {
    localStorage.setItem(CLAVE_RECORDAR, recordar ? "1" : "0");
  } catch {
    /* sin almacén no hay preferencia que guardar; se usará el de sesión */
  }
}

export function seRecuerdaLaSesion(): boolean {
  try {
    return localStorage.getItem(CLAVE_RECORDAR) !== "0";
  } catch {
    return false;
  }
}

function almacen(): Storage {
  return seRecuerdaLaSesion() ? localStorage : sessionStorage;
}

const almacenamiento = {
  getItem(k: string) {
    try { return almacen().getItem(k); } catch { return null; }
  },
  setItem(k: string, v: string) {
    try { almacen().setItem(k, v); } catch { /* sesión solo en memoria */ }
  },
  removeItem(k: string) {
    // Los dos, siempre: si la preferencia cambió entre el login y el
    // logout, borrar solo el de turno dejaría la sesión viva en el otro.
    try { localStorage.removeItem(k); } catch { /* nada que borrar */ }
    try { sessionStorage.removeItem(k); } catch { /* nada que borrar */ }
  },
};

export const supabase = createClient(url, clave, {
  auth: {
    storage: almacenamiento,
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para OAuth y para el enlace de recuperar contraseña: los dos
    // vuelven con el token en el fragmento de la URL.
    detectSessionInUrl: true,
  },
});
