// ============================================================
// El perfil del negocio: leerlo, guardarlo y su logo.
//
// Lo comparten la pantalla de bienvenida y la de Cuenta, que son el mismo
// formulario con distinta puesta en escena. Tenerlo aquí evita lo de
// siempre: dos pantallas que guardan lo mismo en sitios distintos y acaban
// discrepando, que es justo lo que `supabase/README.md` cuenta del nombre
// del remitente.
//
// Los datos viven en dos tablas y no es un descuido (migración 051):
//
//   tenants        · el negocio — nombre, actividad, descripción, contacto
//   config_correo  · el domicilio postal, porque es de donde lo lee el pie
//                    legal. Duplicarlo en `tenants` sería garantizar que un
//                    día digan cosas distintas, y el que se quedaría atrás
//                    sería el que identifica al remitente ante la LSSI-CE.
//
// El logo tampoco tiene tabla propia: es `recursos` con `tipo = 'logo'` y
// `campaign_id` nulo, que es lo que `logo_de_campana()` ya prefiere cuando
// la campaña no trae el suyo.
// ============================================================

import { supabase } from "./supabase";

/** Los perfiles públicos. Objeto libre: una red nueva no es una migración. */
export type Redes = {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  tiktok?: string;
};

export type PerfilNegocio = {
  id: string;
  nombre: string;
  /** A qué se dedica, en la palabra con la que se busca. Va al prompt. */
  vertical: string;
  ciudad: string;
  descripcion: string;
  telefono: string;
  emailContacto: string;
  web: string;
  horario: string;
  redes: Redes;
  /** De `config_correo`, no de `tenants`. Ver la cabecera. */
  direccionPostal: string;
  /** Ruta dentro del bucket `logos`, o null. La URL se saca con `urlDelLogo`. */
  rutaLogo: string | null;
  /** Nulo mientras no se haya pasado por la bienvenida. */
  configuradoEn: string | null;
};

/** La vertical que pone el trigger de alta cuando nadie se la ha dicho. */
export const SIN_DEFINIR = "sin_definir";

/** Lo que no se puede dejar en blanco: es lo que leen la inferencia y el redactor. */
export const ESENCIALES: Array<{
  campo: "nombre" | "vertical" | "descripcion" | "ciudad";
  etiqueta: string;
}> = [
  { campo: "nombre", etiqueta: "el nombre del negocio" },
  { campo: "vertical", etiqueta: "a qué se dedica" },
  { campo: "descripcion", etiqueta: "la descripción" },
  { campo: "ciudad", etiqueta: "la ciudad" },
];

export const PERFIL_VACIO: Omit<PerfilNegocio, "id"> = {
  nombre: "", vertical: "", ciudad: "", descripcion: "", telefono: "",
  emailContacto: "", web: "", horario: "", redes: {}, direccionPostal: "",
  rutaLogo: null, configuradoEn: null,
};

type FilaTenant = {
  id: string;
  nombre: string | null;
  vertical: string | null;
  ciudad: string | null;
  descripcion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  web: string | null;
  horario: string | null;
  redes: Redes | null;
  configurado_en: string | null;
};

/** Lo lee todo de una vez. Devuelve null si el usuario no tiene tenant. */
export async function leerPerfil(): Promise<PerfilNegocio | null> {
  const { data: perfil } = await supabase
    .from("profiles").select("tenant_id").maybeSingle();
  const tenantId = (perfil as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return null;

  const [cuenta, correo, logo] = await Promise.all([
    supabase.from("tenants")
      .select("id, nombre, vertical, ciudad, descripcion, telefono, email_contacto, web, horario, redes, configurado_en")
      .eq("id", tenantId).maybeSingle(),
    supabase.from("config_correo").select("direccion_postal").maybeSingle(),
    supabase.rpc("logo_del_negocio"),
  ]);

  const t = cuenta.data as FilaTenant | null;
  if (!t) return null;

  return {
    id: t.id,
    nombre: t.nombre ?? "",
    // 'sin_definir' es una marca interna, no algo que se le enseñe a nadie:
    // el campo sale vacío para que se escriba encima.
    vertical: t.vertical === SIN_DEFINIR ? "" : t.vertical ?? "",
    ciudad: t.ciudad ?? "",
    descripcion: t.descripcion ?? "",
    telefono: t.telefono ?? "",
    emailContacto: t.email_contacto ?? "",
    web: t.web ?? "",
    horario: t.horario ?? "",
    redes: t.redes ?? {},
    direccionPostal:
      (correo.data as { direccion_postal?: string | null } | null)?.direccion_postal ?? "",
    rutaLogo: (logo.data as string | null) || null,
    configuradoEn: t.configurado_en,
  };
}

/** Qué esenciales están en blanco. Vacío = se puede guardar y seguir. */
export function loQueFalta(p: Omit<PerfilNegocio, "id">): string[] {
  return ESENCIALES
    .filter(({ campo }) => !String(p[campo] ?? "").trim())
    .map(({ etiqueta }) => etiqueta);
}

export type ResultadoGuardar = { ok: true } | { ok: false; error: string };

/**
 * Guarda el perfil en sus dos tablas.
 *
 * `cerrarBienvenida` sella `configurado_en`, que es lo que hace que la
 * pantalla de bienvenida deje de salir. Solo se sella si no falta ningún
 * esencial: cerrarla a medias es dejar una cuenta sin los datos con los que
 * después se infiere y se redacta, y nadie vuelve a esa pantalla por gusto.
 */
export async function guardarPerfil(
  p: PerfilNegocio,
  opciones: { cerrarBienvenida?: boolean } = {},
): Promise<ResultadoGuardar> {
  const falta = loQueFalta(p);
  if (falta.length) return { ok: false, error: `Falta ${falta.join(", ")}.` };

  const limpio = (v: string) => v.trim() || null;

  const { error: falloTenant } = await supabase.from("tenants").update({
    nombre: p.nombre.trim(),
    vertical: p.vertical.trim(),
    ciudad: limpio(p.ciudad),
    descripcion: limpio(p.descripcion),
    telefono: limpio(p.telefono),
    email_contacto: limpio(p.emailContacto),
    web: limpio(p.web),
    horario: limpio(p.horario),
    redes: Object.fromEntries(
      Object.entries(p.redes).map(([k, v]) => [k, String(v ?? "").trim()])
        .filter(([, v]) => v),
    ),
    ...(opciones.cerrarBienvenida ? { configurado_en: new Date().toISOString() } : {}),
  }).eq("id", p.id);
  if (falloTenant) return { ok: false, error: falloTenant.message };

  const fallo = await guardarDireccionPostal(p.direccionPostal);
  if (fallo) return { ok: false, error: fallo };

  return { ok: true };
}

/**
 * El domicilio postal va a `config_correo`, que puede no existir todavía.
 *
 * No se usa `upsert`: la fila lleva `tenant_id` con DEFAULT, así que un
 * upsert sin conflicto declarado insertaría una segunda fila para el mismo
 * tenant en vez de actualizar la que hay.
 */
async function guardarDireccionPostal(direccion: string): Promise<string | null> {
  const valor = direccion.trim() || null;
  const { data: fila } = await supabase
    .from("config_correo").select("id").maybeSingle();

  const { error } = fila
    ? await supabase.from("config_correo")
        .update({ direccion_postal: valor })
        .eq("id", (fila as { id: string }).id)
    : await supabase.from("config_correo").insert({ direccion_postal: valor });

  return error?.message ?? null;
}

// ------------------------------------------------------------
// El logo
// ------------------------------------------------------------

/** El bucket de logos topa en 2 MB, y un logo que pese más está mal exportado. */
export const MAX_BYTES_LOGO = 2 * 1024 * 1024;
/** Sin SVG: es un documento con scripts dentro, y este bucket es público. */
export const MIMES_LOGO = ["image/png", "image/jpeg", "image/webp"];

/**
 * La dirección del logo. Es pública y estable a propósito (044): un correo
 * se abre semanas después, y una URL firmada sería una imagen rota con
 * retardo — el peor fallo, porque en la prueba se ve bien.
 */
export function urlDelLogo(ruta: string | null): string {
  if (!ruta) return "";
  return supabase.storage.from("logos").getPublicUrl(ruta).data.publicUrl;
}

/** Sube el logo del negocio y retira el anterior. Devuelve la ruta nueva. */
export async function subirLogoDelNegocio(
  archivo: File,
  tenantId: string,
): Promise<{ ruta: string } | { error: string }> {
  if (!MIMES_LOGO.includes(archivo.type))
    return { error: "El logo tiene que ser PNG, JPG o WebP." };
  if (archivo.size > MAX_BYTES_LOGO)
    return { error: "El logo pasa de 2 MB. Expórtalo más ligero." };

  const ext = archivo.type.split("/")[1].replace("jpeg", "jpg");
  const ruta = `${tenantId}/negocio/${crypto.randomUUID()}.${ext}`;

  const { error: falloSubida } = await supabase.storage
    .from("logos").upload(ruta, archivo, { contentType: archivo.type });
  if (falloSubida) return { error: falloSubida.message };

  // Solo hay un logo de negocio: el nuevo sustituye al anterior. Se retira
  // después de subir el nuevo, para no quedarse sin ninguno si algo falla.
  await quitarLogoDelNegocio();

  const { error: falloFila } = await supabase.from("recursos").insert({
    campaign_id: null,          // del negocio, no de una campaña
    tipo: "logo",
    nombre: archivo.name.slice(0, 200),
    ruta,
    bucket: "logos",
    mime: archivo.type,
    tamano: archivo.size,
  });

  if (falloFila) {
    // La fila es la que manda: sin ella el archivo es basura invisible.
    await supabase.storage.from("logos").remove([ruta]);
    return { error: falloFila.message };
  }
  return { ruta };
}

/** Quita el logo del negocio, archivo y fila. */
export async function quitarLogoDelNegocio(): Promise<void> {
  const { data } = await supabase.from("recursos")
    .select("id, ruta, bucket").eq("tipo", "logo").is("campaign_id", null);

  for (const r of (data ?? []) as Array<{ id: string; ruta: string; bucket: string }>) {
    await supabase.storage.from(r.bucket || "logos").remove([r.ruta]);
    await supabase.from("recursos").delete().eq("id", r.id);
  }
}
