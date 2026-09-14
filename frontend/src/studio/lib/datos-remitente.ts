// ============================================================
// Quién firma el correo en la vista previa.
//
// El renderizador rellena los huecos que no reciben valor con `DEFAULT_DATA`,
// y ahí el remitente es «Aurevanta Labs · Valencia, España» — el nombre del
// producto del que salió el editor. Salía en el pie de todo lo que se
// diseñaba aquí, y lo peor es que el pie es justo la parte que identifica al
// remitente ante la LSSI-CE: si en la pantalla dice una empresa y en el envío
// dice otra, quien revisa el correo no está revisando lo que se va a mandar.
//
// Solo se corrigen los `sender.*`. Las `lead.*` se quedan como están: esto es
// una vista previa y «María / Empresa Ejemplo» es exactamente lo que hay que
// enseñar donde irá un destinatario que todavía no existe.
//
// El orden de preferencia es el mismo que `lib/aplicar-plantilla.ts` aplica
// al vestir un mensaje de verdad. Si los dos no dicen lo mismo, el correo que
// se ve y el que se manda firman distinto, que es peor que el fallo original.
// ============================================================

import { supabase } from "../../lib/supabase";

export type DatosRemitente = {
  /** Lo que se pasa como `mergeData` al renderizador. */
  merge: Record<string, string>;
  /** Qué falta para poder enviar de verdad. Vacío = nada. */
  falta: string[];
};

let cacheado: Promise<DatosRemitente> | null = null;

/**
 * Los datos del remitente, una vez por sesión.
 *
 * Se memoiza la promesa, no el resultado: dos llamadas simultáneas —la vista
 * previa y el guardado, que ocurren juntos— hacen una sola consulta.
 */
export function datosDelRemitente(): Promise<DatosRemitente> {
  if (!cacheado) cacheado = leer();
  return cacheado;
}

/** Para después de cambiar la configuración en Cuenta → Correo saliente. */
export function olvidarDatosDelRemitente() {
  cacheado = null;
}

async function leer(): Promise<DatosRemitente> {
  try {
    const [cuenta, correo] = await Promise.all([
      supabase.from("tenants").select("nombre, ciudad").maybeSingle(),
      supabase
        .from("config_correo")
        .select("nombre_remitente, direccion_postal, url_privacidad, buzon, dominio")
        .maybeSingle(),
    ]);

    const t = (cuenta.data ?? {}) as { nombre?: string | null; ciudad?: string | null };
    const c = (correo.data ?? {}) as {
      nombre_remitente?: string | null;
      direccion_postal?: string | null;
      url_privacidad?: string | null;
      buzon?: string | null;
      dominio?: string | null;
    };

    // El nombre configurado manda sobre el de la cuenta: es el que el cliente
    // ha decidido que aparezca firmando, y puede no ser su razón social.
    const firma = (c.nombre_remitente ?? "").trim() || (t.nombre ?? "").trim();
    const postal = (c.direccion_postal ?? "").trim();
    const privacidad = (c.url_privacidad ?? "").trim();
    const buzon = (c.buzon ?? "").trim();
    const dominio = (c.dominio ?? "").trim();

    const falta: string[] = [];
    if (!firma) falta.push("la razón social de quien firma");
    if (!postal) falta.push("el domicilio postal");

    return {
      // Cadena vacía a propósito donde no hay dato: `interpolate` usa `??`,
      // así que "" gana a DEFAULT_DATA y el hueco se queda vacío de verdad.
      // El pie omite solo los enlaces sin destino desde la 044.
      merge: {
        "sender.name": firma,
        "sender.company": firma,
        "sender.legal_name": firma,
        "sender.postal_address": postal || (t.ciudad ?? "").trim(),
        "sender.privacy_url": privacidad,
        "sender.privacy_email": buzon && dominio ? `${buzon}@${dominio}` : "",
      },
      falta,
    };
  } catch {
    // Sin sesión o sin red no se inventa nada: mejor los huecos vacíos que
    // una firma que no es de nadie.
    return {
      merge: {
        "sender.name": "", "sender.company": "", "sender.legal_name": "",
        "sender.postal_address": "", "sender.privacy_url": "", "sender.privacy_email": "",
      },
      falta: ["la razón social de quien firma", "el domicilio postal"],
    };
  }
}
