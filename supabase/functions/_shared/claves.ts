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

/**
 * La caché va por cliente, no por proveedor.
 *
 * Desde la 047 cada cliente sin modo demo paga su propio modelo, así que
 * una caché por proveedor le serviría a uno la clave del que llamó antes.
 * Es la clase de error que no da la cara: funciona, y factura a quien no
 * toca.
 */
const memoria = new Map<string, { clave: string; hasta: number }>();
const llaveCache = (proveedor: string, tenant?: string | null) =>
  `${proveedor}::${tenant ?? "servicio"}`;

/** Qué variable de entorno respalda a cada proveedor, si no hay nada en el Vault. */
const RESPALDO: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export class ErrorSinClave extends Error {
  /**
   * El mensaje depende de a quién le tocaba poner la clave, y esa
   * diferencia es la mitad del valor: a un cliente no se le puede decir que
   * vaya a un panel de administración que no verá nunca.
   */
  constructor(proveedor: string, deQuien: "cliente" | "servicio" = "servicio") {
    super(
      deQuien === "cliente"
        ? `Falta la clave de ${proveedor} de tu cuenta. Se pega en ` +
          `Cuenta → Proveedor de modelo. Mientras no esté, las funciones ` +
          `con inteligencia artificial no pueden trabajar.`
        : `Falta la clave de ${proveedor}. Se pone en el panel: Ajustes → ` +
          `Proveedores de modelo.`,
    );
  }
}

/**
 * La clave del proveedor, del Vault o del entorno. Nunca devuelve vacío:
 * si no hay ninguna, lanza — un fetch con la cabecera en blanco devuelve un
 * 401 del proveedor que no dice qué falta.
 */
export async function claveDelModelo(
  proveedor: string,
  tenant?: string | null,
): Promise<string> {
  const llave = llaveCache(proveedor, tenant);
  const guardada = memoria.get(llave);
  if (guardada && guardada.hasta > Date.now()) return guardada.clave;

  let clave = "";
  let origen: "cliente" | "servicio" | "falta" = "falta";

  try {
    // service_role: `resolver_clave_modelo` está revocada para todo lo
    // demás. Ver 047 — que se pueda escribir desde el navegador y no leer
    // es toda la diferencia entre guardar una clave y regalarla.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin.rpc("resolver_clave_modelo", {
      p_tenant: tenant ?? null,
      p_proveedor: proveedor,
    });
    const fila = Array.isArray(data) ? data[0] : data;
    clave = (fila?.clave as string | null) ?? "";
    origen = (fila?.origen as typeof origen) ?? "falta";
  } catch (e) {
    // Que la base no conteste no debe dejar sin servicio a un despliegue
    // que todavía funciona con el secreto de entorno.
    console.error(`No se pudo resolver la clave de ${proveedor}:`, e);
  }

  // El respaldo de entorno es del SERVICIO, así que solo vale para quien le
  // corresponde la clave del servicio. Si a un cliente le tocaba poner la
  // suya, caer aquí sería colarle el consumo a otro por la puerta de atrás
  // —justo lo que la 047 viene a impedir—.
  if (!clave && origen !== "falta") {
    clave = Deno.env.get(RESPALDO[proveedor] ?? "") ?? "";
    if (clave) origen = "servicio";
  }

  if (!clave) {
    throw new ErrorSinClave(proveedor, origen === "falta" && tenant ? "cliente" : "servicio");
  }

  memoria.set(llave, { clave, hasta: Date.now() + CADUCIDAD_MS });
  return clave;
}

/**
 * Con qué proveedor habla este cliente para el texto.
 *
 * Hoy la respuesta es casi siempre Anthropic: es el único que los motores
 * de inferencia, redacción, landings y studio-ia saben hablar. La
 * preferencia se guarda desde la 047 para cuando dejen de estarlo.
 */
export async function proveedorDeTexto(tenant?: string | null): Promise<string> {
  if (!tenant) return "anthropic";
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("config_modelo")
      .select("proveedor")
      .eq("tenant_id", tenant)
      .maybeSingle();
    return (data?.proveedor as string | undefined) ?? "anthropic";
  } catch {
    return "anthropic";
  }
}

export const claveAnthropic = (tenant?: string | null) =>
  claveDelModelo("anthropic", tenant);
