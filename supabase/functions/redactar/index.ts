// ============================================================
// Edge Function · redactar  (Fase 3)
//
// Escribe un mensaje por lead con Claude y lo deja en 'borrador'. Esto
// REDACTA, no envía: el envío es Fase 4 y no existe todavía.
//
// Cuesta dinero — una llamada a Claude por lead —, así que el encolado
// filtra antes: solo leads con email, sin mensaje previo y que no estén en
// la lista de supresión. Redactar para quien pidió la baja sería pagar por
// algo que la base va a rechazar al enviarlo.
//
// Desplegar: supabase functions deploy redactar --no-verify-jwt
// Secretos:  supabase secrets set ANTHROPIC_API_KEY=...
//            supabase secrets set WORKER_SECRETO=<la misma que descubrir>
//            supabase secrets set URL_PUBLICA=https://tu-proyecto.supabase.co
// ============================================================

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Contexto, ErrorRedaccion, pie, redactarMensaje } from "../_shared/redaccion.ts";

const PLAZO_MS = Number(Deno.env.get("REDACTAR_PLAZO_MS") ?? 100_000);
const TAREAS_POR_TANDA = 3;   // Cada una es una llamada a Claude de ~10 s.

type Tarea = {
  id: string;
  job_id: string;
  tenant_id: string;
  lead_id: string;
  intentos: number;
};

Deno.serve(async (req) => {
  const secreto = Deno.env.get("WORKER_SECRETO");
  if (!secreto || req.headers.get("x-worker-secreto") !== secreto) {
    return new Response(JSON.stringify({ error: "No autorizado." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const base = Deno.env.get("URL_PUBLICA") ?? "https://prospector-captacion.netlify.app";
  const hasta = Date.now() + PLAZO_MS;
  let redactados = 0, errores = 0;

  while (Date.now() < hasta) {
    const { data: tareas, error } = await supabase.rpc("reclamar_tareas", {
      p_limite: TAREAS_POR_TANDA,
      p_tipo: "redactar",
    });

    if (error) {
      console.error("No se pudieron reclamar tareas:", error.message);
      break;
    }
    if (!tareas || tareas.length === 0) break;

    for (const tarea of tareas as Tarea[]) {
      if (Date.now() >= hasta) {
        await devolverACola(supabase, tarea, "Plazo de la invocación agotado");
        continue;
      }

      try {
        const { data: ctx, error: falloCtx } = await supabase
          .from("v_contexto_mensaje")
          .select("*")
          .eq("lead_id", tarea.lead_id)
          .single();

        if (falloCtx || !ctx) throw new Error("No se pudo leer el contexto del lead");

        const { asunto, cuerpo } = await redactarMensaje(
          ctx as Contexto,
          { funcion: "redactar", tenant: tarea.tenant_id },
        );

        // Dos pasos a propósito: el token de baja lo genera la base al
        // insertar, así que el pie con el enlace solo se puede componer
        // después. Sin ese enlace la fila no se podrá enviar nunca.
        const { data: creado, error: falloIns } = await supabase
          .from("messages")
          .insert({
            tenant_id: tarea.tenant_id,
            lead_id: tarea.lead_id,
            asunto,
            cuerpo,
          })
          .select("id, token_baja")
          .single();

        if (falloIns) throw new Error(`Guardando mensaje: ${falloIns.message}`);

        const urlBaja = `${base}/baja.html?t=${creado.token_baja}`;
        const { error: falloPie } = await supabase
          .from("messages")
          .update({ cuerpo: cuerpo + pie((ctx as Contexto).negocio_nombre, urlBaja, (ctx as Contexto).campana_firma) })
          .eq("id", creado.id);

        if (falloPie) throw new Error(`Añadiendo el pie: ${falloPie.message}`);

        await supabase.from("job_tareas")
          .update({
            estado: "hecho",
            detalle: `Redactado: "${asunto}"`.slice(0, 300),
            actualizado_en: new Date().toISOString(),
          })
          .eq("id", tarea.id);

        redactados++;
      } catch (e) {
        errores++;
        const mensaje = e instanceof Error ? e.message : String(e);
        console.error(`Tarea ${tarea.id}:`, mensaje);

        // Un 502 de Anthropic pasa; un JSON mal formado dos veces seguidas,
        // no. Dos intentos y a otra cosa: cada uno cuesta una llamada.
        const recuperable = !(e instanceof ErrorRedaccion && e.estado === 422);
        if (recuperable && tarea.intentos < 2) {
          await devolverACola(supabase, tarea, mensaje);
        } else {
          await supabase.from("job_tareas")
            .update({
              estado: "error",
              detalle: mensaje.slice(0, 300),
              actualizado_en: new Date().toISOString(),
            })
            .eq("id", tarea.id);
        }
      }

      await supabase.rpc("cerrar_job_si_completo", { p_job: tarea.job_id });
    }
  }

  return new Response(
    JSON.stringify({ redactados, errores }),
    { headers: { "content-type": "application/json" } },
  );
});

async function devolverACola(supabase: SupabaseClient, tarea: Tarea, motivo: string) {
  await supabase.from("job_tareas")
    .update({
      estado: "pendiente",
      detalle: motivo.slice(0, 300),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", tarea.id);
}
