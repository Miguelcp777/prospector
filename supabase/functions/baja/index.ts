// ============================================================
// Edge Function · baja
//
// La página que abre quien no quiere volver a recibir nuestros correos.
// Pública y sin auth por definición: el destinatario no es usuario de nada.
// Lo único que le identifica es el token del enlace.
//
// POR QUÉ UN GET NO DA DE BAJA
// Los antivirus de correo y los previsualizadores de enlaces abren las URL
// de los mensajes antes de que nadie las pulse. Si el GET ejecutase la
// baja, daríamos de baja a gente que no la pidió — y nos quedaríamos sin
// poder distinguir una baja real de un escáner. Así que GET enseña un
// botón y POST ejecuta.
//
// Excepción: RFC 8058. Gmail y Yahoo mandan un POST con
// `List-Unsubscribe=One-Click` cuando el usuario pulsa "cancelar
// suscripción" en su propio cliente. Ese POST sí es una persona.
//
// Desplegar: supabase functions deploy baja --no-verify-jwt
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";

  if (!token) return pagina(400, "Enlace incompleto", "Este enlace no trae la referencia necesaria. Revisa que lo hayas copiado entero.");

  if (req.method === "GET") {
    return pagina(200, "Cancelar el envío de correos", `
      <p>Vas a pedir que no volvamos a escribirte a la dirección asociada a
      este mensaje.</p>
      <p class="sutil">La baja es inmediata y no hace falta dar ningún motivo.</p>
      <form method="POST">
        <button type="submit">Confirmar la baja</button>
      </form>`);
  }

  if (req.method !== "POST") {
    return pagina(405, "Método no permitido", "");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .rpc("registrar_baja", { p_token: token })
    .single();

  if (error) {
    console.error("Error registrando baja:", error.message);
    return pagina(500, "No hemos podido completar la baja",
      "Ha fallado algo por nuestra parte. Vuelve a intentarlo en unos minutos.");
  }

  const r = data as { ok: boolean; email: string | null; ya_estaba: boolean };

  // Token inválido: no decimos si existió alguna vez ni a qué dirección
  // apuntaba. Un enlace roto no debe servir para averiguar nada.
  if (!r.ok) {
    return pagina(404, "Enlace no válido",
      "Este enlace no corresponde a ningún envío nuestro. Si sigues recibiendo correos, respóndenos y lo resolvemos a mano.");
  }

  const cuerpo = r.ya_estaba
    ? `<p><strong>${escapar(r.email!)}</strong> ya estaba dada de baja. No vas a recibir nada más.</p>`
    : `<p>Hecho. <strong>${escapar(r.email!)}</strong> ya no recibirá más correos nuestros.</p>`;

  return pagina(200, "Baja confirmada", cuerpo + `
    <p class="sutil">La baja se aplica a partir de ahora. Si tenías un envío
    ya en camino, puede que llegue uno último.</p>`);
});

/** El HTML va aquí dentro: esta página tiene que funcionar sin depender de nada. */
function pagina(estado: number, titulo: string, cuerpo: string): Response {
  return new Response(
    `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapar(titulo)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#f6f7f9; color:#1a1d23; }
  @media (prefers-color-scheme: dark) { body { background:#0f1115; color:#e6e8ec; } }
  main { max-width:460px; background:#fff; border:1px solid #e2e5ea; border-radius:12px; padding:28px; }
  @media (prefers-color-scheme: dark) { main { background:#171a21; border-color:#262b36; } }
  h1 { font-size:1.3rem; margin:0 0 12px; }
  p { margin:0 0 12px; }
  .sutil { color:#6b7280; font-size:0.9rem; }
  button { background:#5b8cff; color:#0b0d12; border:0; border-radius:8px;
           padding:12px 18px; font:inherit; font-weight:600; cursor:pointer; width:100%; }
</style>
</head>
<body><main><h1>${escapar(titulo)}</h1>${cuerpo}</main></body>
</html>`,
    {
      status: estado,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Que nadie indexe ni cachee una página con una dirección dentro.
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
