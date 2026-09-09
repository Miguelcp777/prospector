// ============================================================
// Edge Function · dominio-correo
//
// Da de alta el dominio del cliente en el proveedor de correo y pregunta
// por su verificación. Es la pieza que faltaba de
// `docs/decisiones/0004-quien-es-el-remitente.md`: la 028 creó dónde vive
// el dominio de cada cliente, pero `registros_dns` nacía en '[]' y
// `estado_dominio` en 'sin_verificar', y nada los movía nunca.
//
// Dos acciones:
//   { "accion": "alta" }      → lo crea allí y trae los registros DNS
//   { "accion": "comprobar" } → pide verificación y actualiza el estado
//
// ------------------------------------------------------------------
// QUÉ LA PROTEGE
//
// Lleva JWT: la invoca un cliente desde su pantalla de Cuenta. Su propia
// configuración se lee con SU token —la RLS decide de quién es—, y solo
// después se usa `service_role`, para dos cosas que el cliente no puede
// hacer por sí mismo:
//
//   · leer la clave del proveedor, que vive en el Vault;
//   · escribir `estado_dominio`, `registros_dns` y `proveedor_dominio_id`,
//     que la 028 dejó fuera del GRANT por columna a propósito.
//
// Ese último detalle no es decorativo. Si el cliente pudiera escribir
// `estado_dominio`, se marcaría 'verificado' y empezaría a enviar sin
// haber puesto un solo registro. Y si pudiera escribir
// `proveedor_dominio_id`, podría apuntarlo al dominio ya verificado de
// otro tenant y heredar su verificación.
// ------------------------------------------------------------------
//
// Desplegar:  supabase functions deploy dominio-correo
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";

/**
 * Región europea, como el proyecto de Supabase. Ver docs/compliance.md:
 * los rebotes y las quejas llevan direcciones de correo, y esas son dato
 * personal aunque sean buzones de empresa.
 */
const REGION = "eu-west-1";

/** Un dominio, no una URL ni una dirección de correo. */
const DOMINIO =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const API = "https://api.resend.com/domains";

/**
 * Traduce el estado del proveedor al del esquema.
 *
 * Conservador a propósito: lo que no se reconoce NO cae en 'verificado'.
 * Un estado nuevo del proveedor que aterrizara ahí por defecto dejaría
 * enviar desde un dominio sin comprobar.
 */
function traducirEstado(status: string): { estado: string; detalle: string } {
  switch (status) {
    case "verified":
      return { estado: "verificado", detalle: "Dominio verificado" };
    case "pending":
    case "not_started":
      return {
        estado: "pendiente_dns",
        detalle: "Faltan registros DNS por propagar. Puede tardar unas horas.",
      };
    // Temporal es reintentable: marcarlo 'fallo' haría que el cliente
    // rehiciera un DNS que ya estaba bien puesto.
    case "temporary_failure":
      return {
        estado: "pendiente_dns",
        detalle: "El proveedor no pudo comprobarlo esta vez. Se reintenta solo.",
      };
    case "failure":
    case "failed":
      return {
        estado: "fallo",
        detalle:
          "El proveedor no encuentra los registros. Revisa que estén tal cual.",
      };
    default:
      return {
        estado: "pendiente_dns",
        detalle: `Estado no reconocido del proveedor: ${status}`,
      };
  }
}

/** El proveedor da el motivo en `message`; sin leerlo queda un 502 mudo. */
function motivo(cuerpo: unknown, status: number): string {
  const m = cuerpo as { message?: string; error?: string } | null;
  return m?.message ?? m?.error ?? `El proveedor respondió ${status}`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { accion } = await req.json();
    if (accion !== "alta" && accion !== "comprobar") {
      return json(
        req,
        { error: 'La acción tiene que ser "alta" o "comprobar".' },
        400,
      );
    }

    // Con el token del cliente: la RLS decide qué configuración es la suya,
    // así que no hay que comprobar el tenant a mano.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    const { data: cfg, error: falloCfg } = await supabase.rpc("mi_config_correo");
    if (falloCfg) return json(req, { error: falloCfg.message }, 500);
    if (!cfg) return json(req, { error: "No hay configuración de correo." }, 404);

    const conf = cfg as {
      tenant_id: string;
      modo: string;
      dominio: string | null;
      proveedor_dominio_id: string | null;
    };

    // Modo 'propio' es el cliente trayendo SU proveedor. Darlo de alta en
    // nuestra cuenta sería lo contrario de lo que ha elegido, y nos haría
    // responsables de un dominio que no gestionamos.
    if (conf.modo !== "gestionado") {
      return json(
        req,
        {
          error:
            "Este cliente usa su propio proveedor. El alta del dominio se " +
            "hace allí, no aquí.",
        },
        409,
      );
    }

    const dominio = (conf.dominio ?? "").trim().toLowerCase();
    if (!dominio || !DOMINIO.test(dominio)) {
      return json(
        req,
        {
          error:
            "Falta el dominio, o no tiene forma de dominio. Se pone en " +
            "Cuenta → Correo saliente. Ejemplo: envios.tuempresa.com",
        },
        400,
      );
    }

    // A partir de aquí hace falta identidad de servidor: la clave del
    // proveedor y las columnas que el cliente no puede escribir.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: clave } = await admin.rpc("leer_clave_correo");
    if (!clave) {
      return json(
        req,
        {
          error:
            "Falta la clave del proveedor de correo del servicio. Se pone " +
            "en el panel: Ajustes → Correo del servicio.",
        },
        503,
      );
    }

    const cabeceras = {
      Authorization: `Bearer ${clave}`,
      "content-type": "application/json",
    };

    let dominioId = conf.proveedor_dominio_id;

    // Si el cliente cambió el dominio después de darlo de alta, el id
    // guardado apunta al anterior. Sin esta comprobación se verificaría un
    // dominio que ya no usa, y la pantalla diría que todo está bien.
    if (dominioId) {
      const previo = await fetch(`${API}/${dominioId}`, { headers: cabeceras });
      const datos = await previo.json().catch(() => null);
      const nombrePrevio = (datos as { name?: string } | null)?.name?.toLowerCase();
      // 404: borrado en el proveedor. En los dos casos se da de alta otra vez.
      if (previo.status === 404 || (previo.ok && nombrePrevio !== dominio)) {
        dominioId = null;
      }
    }

    if (!dominioId) {
      if (accion === "comprobar") {
        return json(
          req,
          {
            error:
              "Este dominio no está dado de alta todavía. Dale primero a " +
              "«Dar de alta el dominio».",
          },
          409,
        );
      }

      const alta = await fetch(API, {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify({ name: dominio, region: REGION }),
      });
      const cuerpo = await alta.json().catch(() => null);
      if (!alta.ok) {
        // El caso frecuente es que el dominio ya esté en nuestra cuenta
        // porque lo dio de alta otro tenant. Repetir el motivo del
        // proveedor evita media hora mirando un DNS que estaba bien.
        return json(req, { error: motivo(cuerpo, alta.status) }, 502);
      }
      dominioId = (cuerpo as { id?: string } | null)?.id ?? null;
      if (!dominioId) {
        return json(
          req,
          { error: "El proveedor no devolvió identificador de dominio." },
          502,
        );
      }
    } else if (accion === "comprobar") {
      // Dispara la comprobación. Su respuesta no trae el resultado —es
      // asíncrona—, así que el estado se lee justo después.
      await fetch(`${API}/${dominioId}/verify`, {
        method: "POST",
        headers: cabeceras,
      });
    }

    const consulta = await fetch(`${API}/${dominioId}`, { headers: cabeceras });
    const dom = await consulta.json().catch(() => null);
    if (!consulta.ok) return json(req, { error: motivo(dom, consulta.status) }, 502);

    const info = dom as { status?: string; records?: unknown[] } | null;
    const { estado, detalle } = traducirEstado(info?.status ?? "");
    const registros = Array.isArray(info?.records) ? info.records : [];

    const { error: falloU } = await admin
      .from("config_correo")
      .update({
        proveedor_dominio_id: dominioId,
        estado_dominio: estado,
        registros_dns: registros,
        detalle,
        // Solo se sella cuando de verdad lo está. Una fecha puesta en
        // 'pendiente' haría parecer verificado lo que no lo está.
        verificado_en: estado === "verificado" ? new Date().toISOString() : null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("tenant_id", conf.tenant_id);
    if (falloU) return json(req, { error: falloU.message }, 500);

    return json(req, {
      dominio,
      estado_dominio: estado,
      detalle,
      registros_dns: registros,
    });
  } catch (e) {
    return json(
      req,
      {
        error:
          e instanceof Error ? e.message : "Fallo al hablar con el proveedor",
      },
      500,
    );
  }
});
