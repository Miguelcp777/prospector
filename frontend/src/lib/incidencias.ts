// ============================================================
// Reportar un fallo desde el navegador.
//
// La regla: reportar NUNCA puede romper lo que ya estaba roto. Si el
// registro falla —sin sesión, sin red, la base caída— se traga el error y
// devuelve. Un fallo dentro del gestor de fallos es la forma más rápida de
// convertir un error visible en una pantalla en blanco.
// ============================================================

import { supabase } from "./supabase";
import { firmaDe } from "./diagnostico";

type Contexto = Record<string, unknown>;

/**
 * Deja constancia de un fallo. No devuelve nada útil a propósito: quien la
 * llama está en mitad de su propio manejo de error y no debe esperar.
 */
export async function reportar(
  origen: string,
  operacion: string,
  error: unknown,
  contexto: Contexto = {},
): Promise<void> {
  try {
    const mensaje = mensajeDe(error);
    if (!mensaje) return;

    await supabase.rpc("registrar_incidencia", {
      p_origen: origen,
      p_codigo: firmaDe(origen, mensaje),
      p_mensaje: mensaje,
      p_operacion: operacion,
      p_detalle: {
        ...contexto,
        url: window.location.pathname,
        navegador: navigator.userAgent.slice(0, 200),
      },
    });
  } catch {
    // A propósito. Ver la cabecera.
  }
}

function mensajeDe(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const o = error as { message?: string; error?: string };
  return o.message ?? o.error ?? JSON.stringify(error).slice(0, 500);
}
