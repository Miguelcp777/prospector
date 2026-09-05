// ============================================================
// Edge Function · demo-inferir
//
// El escaparate público. Sin auth: cualquiera que abra la demo en Netlify
// escribe su negocio y ve SUS segmentos, no los de un guion.
//
// No toca ninguna tabla de negocio. No recibe campaign_id, no escribe en
// segments, no sabe qué es un tenant. Lo único que persiste es un contador
// de uso por hash de IP.
//
// Sin cuota, esta función es una factura abierta de Anthropic a nombre de
// quien la encuentre. La cuota no es una optimización: es el motivo por el
// que se puede publicar.
//
// Desplegar:  supabase functions deploy demo-inferir --no-verify-jwt
// Secretos:   supabase secrets set ANTHROPIC_API_KEY=sk-...
//             supabase secrets set ORIGENES_PERMITIDOS=https://tu-demo.netlify.app
//             supabase secrets set SAL_DEMO=<cadena larga aleatoria>
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ErrorInferencia,
  inferirSegmentos,
  TAXONOMIAS,
  validarDescripcion,
} from "../_shared/inferencia.ts";
import { hashIp, json, preflight } from "../_shared/http.ts";

// Cuánto regalamos. Subir con cuidado: cada uso es una llamada a Claude.
const MAX_POR_IP = Number(Deno.env.get("DEMO_MAX_POR_IP") ?? 5);
const MAX_POR_DIA = Number(Deno.env.get("DEMO_MAX_POR_DIA") ?? 300);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") return json(req, { error: "Método no permitido." }, 405);

  try {
    const { descripcion, vertical, ciudad } = await req.json();

    const problema = validarDescripcion(descripcion);
    if (problema) return json(req, { error: problema }, 400);

    // service_role: la tabla del contador tiene RLS sin políticas, nadie
    // llega ahí desde el navegador. Esta clave no sale de aquí.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Se calcula una vez: hace falta para cobrar y, si algo falla, para devolver.
    const ipHash = await hashIp(req);

    const { data: cuota, error: errorCuota } = await supabase
      .rpc("registrar_uso_demo", {
        p_ip_hash: ipHash,
        p_max_ip: MAX_POR_IP,
        p_max_dia: MAX_POR_DIA,
      })
      .single();

    if (errorCuota) {
      console.error("Contador de demo caído:", errorCuota.message);
      // Si el contador falla, no inferimos: preferimos una demo degradada
      // a una función sin techo de gasto.
      return json(req, { agotado: true, segmentos: ejemplo(vertical) });
    }

    if (!cuota?.permitido) {
      return json(req, {
        agotado: true,
        mensaje: "Has agotado las inferencias de la demo por hoy. " +
          "Los segmentos que ves son un ejemplo precalculado.",
        segmentos: ejemplo(vertical),
      });
    }

    let segmentos;
    try {
      // Sin tenant: la demo es pública. Se anota igual, porque el coste es
      // nuestro y es justo el que nadie ve venir.
      segmentos = await inferirSegmentos(
        descripcion, vertical, ciudad, { funcion: "demo-inferir", tenant: null },
      );
    } catch (e) {
      // El cargo va antes de inferir a propósito: cobrarlo después dejaría la
      // llamada a Claude fuera del techo de gasto. Pero si falla por nuestra
      // parte, el intento no tiene por qué gastárselo el visitante.
      await supabase.rpc("devolver_uso_demo", { p_ip_hash: ipHash });
      throw e;
    }

    return json(req, { segmentos, restantes: cuota.restantes_ip });
  } catch (e) {
    if (e instanceof ErrorInferencia) return json(req, { error: e.message }, e.estado);
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});

/** Salida de respaldo cuando la cuota se agota: la taxonomía curada, sin llamar a Claude. */
function ejemplo(vertical?: string) {
  const base = TAXONOMIAS[vertical ?? "fisioterapia"] ?? TAXONOMIAS.fisioterapia;
  return base.map((nombre, i) => ({
    slug: `ejemplo-${i}`,
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    motivo: "Segmento de la taxonomía curada para esta vertical.",
    prioridad: i < 4 ? "alta" : i < 6 ? "media" : "baja",
    queries: [],
  }));
}
