// ============================================================
// Compartido · de dónde sale la clave de cada proveedor de modelo
//
// Hasta la 041, la clave de Anthropic era un secreto de las Edge Functions:
// rotarla exigía `supabase secrets set` y volver a desplegar cinco
// funciones. Ahora vive en el Vault y se pone desde el panel.
//
// EL SECRETO DE ENTORNO SIGUE VALIENDO, Y A PROPÓSITO
//
// Primero se mira el Vault; si ahí no hay nada, se usa la variable de
// entorno de siempre. Así el despliegue actual no se rompe el día que se
// aplica la migración, y un proyecto recién montado puede arrancar con el
// secreto antes de que exista un administrador que pegue la clave.
//
// El orden importa: el Vault gana. Es lo que hace que poner una clave en el
// panel sirva de algo aunque quede un secreto viejo por ahí.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Caché por isolate, con caducidad.
 *
 * Sin caché, cada mensaje redactado sería una consulta más a la base. Sin
 * caducidad, un isolate caliente seguiría usando una clave revocada hasta
 * que Supabase lo reciclara — que puede ser un buen rato. Cinco minutos es
 * suficiente para no notarlo y poco para que rotar una clave surta efecto
 * mientras sigues mirando la pantalla.
 */
const CADUCIDAD_MS = 5 * 60 * 1000;
const memoria = new Map<string, { clave: string; hasta: number }>();

/** Qué variable de entorno respalda a cada proveedor, si no hay nada en el Vault. */
const RESPALDO: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export class ErrorSinClave extends Error {
  constructor(proveedor: string) {
    super(
      `Falta la clave de ${proveedor}. Se pone en el panel: Ajustes → ` +
        `Proveedores de modelo.`,
    );
  }
}

/**
 * La clave del proveedor, del Vault o del entorno. Nunca devuelve vacío:
 * si no hay ninguna, lanza — un fetch con la cabecera en blanco devuelve un
 * 401 del proveedor que no dice qué falta.
 */
export async function claveDelModelo(proveedor: string): Promise<string> {
  const guardada = memoria.get(proveedor);
  if (guardada && guardada.hasta > Date.now()) return guardada.clave;

  let clave = "";

  try {
    // service_role: `leer_clave_modelo` está revocada para todo lo demás.
    // Ver 041 — que se pueda escribir desde el navegador y no leer es toda
    // la diferencia entre guardar una clave y regalarla.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin.rpc("leer_clave_modelo", {
      p_proveedor: proveedor,
    });
    clave = (data as string | null) ?? "";
  } catch (e) {
    // Que la base no conteste no debe dejar sin servicio a un despliegue
    // que todavía funciona con el secreto de entorno.
    console.error(`No se pudo leer la clave de ${proveedor} del Vault:`, e);
  }

  if (!clave) clave = Deno.env.get(RESPALDO[proveedor] ?? "") ?? "";
  if (!clave) throw new ErrorSinClave(proveedor);

  memoria.set(proveedor, { clave, hasta: Date.now() + CADUCIDAD_MS });
  return clave;
}

/** Atajo: es la que mueve inferencia, redacción, landings y el studio. */
export const claveAnthropic = () => claveDelModelo("anthropic");
