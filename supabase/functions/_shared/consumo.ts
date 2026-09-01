// ============================================================
// Compartido · anotar lo que ha costado una llamada al modelo
//
// Los tokens los da el propio proveedor en cada respuesta (`usage`). No se
// estiman: una estimación en un panel de gasto se acaba tomando por buena.
//
// Nunca lanza. Si el registro falla, la operación del usuario ya ha salido
// bien y no hay ningún motivo para romperla por no poder contar.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

type Uso = { input_tokens?: number; output_tokens?: number };

export async function anotarConsumo(
  funcion: string,
  modelo: string,
  uso: Uso | undefined,
  tenantId?: string | null,
): Promise<void> {
  if (!uso) return;

  try {
    // service_role: registrar_consumo_modelo está revocada para todo lo demás,
    // y esta escritura no debe depender de quién sea el usuario.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await admin.rpc("registrar_consumo_modelo", {
      p_funcion: funcion,
      p_modelo: modelo,
      p_entrada: uso.input_tokens ?? 0,
      p_salida: uso.output_tokens ?? 0,
      p_tenant: tenantId ?? null,
    });
  } catch (e) {
    console.error("No se pudo anotar el consumo:", e);
  }
}
