// ============================================================
// Logo y documentos de una campaña.
//
// Dos destinos distintos, y la diferencia importa (migración 044):
//
//   documentos → bucket PRIVADO. Son la oferta comercial del cliente y no
//                tienen por qué poder leerse adivinando una ruta. La
//                landing los sirve con URLs firmadas que caducan.
//   logo       → bucket PÚBLICO. Un correo se abre semanas después y
//                muchas veces a través del proxy de imágenes de Gmail: una
//                URL firmada sería una imagen rota con retardo, que es el
//                peor fallo porque en la prueba se ve bien. Y un logo ya
//                está publicado en la web del cliente.
//
// Escribir sigue siendo privado en los dos: la ruta empieza por el uuid del
// tenant y la política de storage lo compara con auth_tenant_id().
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { invocar } from "../lib/edge";

type Recurso = {
  id: string;
  campaign_id: string | null;
  tipo: "logo" | "documento";
  nombre: string;
  ruta: string;
  /** Dónde está el archivo. Los logos antiguos siguen en 'recursos'. */
  bucket: string;
  mime: string | null;
  tamano: number | null;
  texto: string | null;
  texto_estado: string;
};

const MAX_BYTES = 10 * 1024 * 1024;
/** El bucket de logos topa en 2 MB, y un logo que pese más está mal exportado. */
const MAX_BYTES_LOGO = 2 * 1024 * 1024;
/** Sin SVG: es un documento con scripts dentro, y este bucket es público. */
const MIMES_LOGO = ["image/png", "image/jpeg", "image/webp"];

export function Recursos({ campanaId }: { campanaId: string }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [lista, setLista] = useState<Recurso[]>([]);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refLogo = useRef<HTMLInputElement>(null);
  const refDoc = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("tenant_id").single(),
      supabase.from("recursos")
        .select("id, campaign_id, tipo, nombre, ruta, bucket, mime, tamano, texto, texto_estado")
        // Los de esta campaña, más el logo del negocio (campaign_id null).
        .or(`campaign_id.eq.${campanaId},campaign_id.is.null`)
        .order("creado_en"),
    ]);
    setTenantId((p.data as { tenant_id: string } | null)?.tenant_id ?? null);
    setLista((r.data ?? []) as Recurso[]);
  }, [campanaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function subir(archivo: File, tipo: "logo" | "documento") {
    setError(null);

    // El logo va al bucket público, que tiene sus propios límites. Se
    // comprueban aquí para poder decir por qué en vez de dejar que storage
    // devuelva un "mime type not supported" a secas.
    const bucket = tipo === "logo" ? "logos" : "recursos";

    if (tipo === "logo" && !MIMES_LOGO.includes(archivo.type)) {
      setError(
        "El logo tiene que ser PNG, JPG o WEBP. El SVG no se admite: es un " +
        "documento con scripts dentro y este archivo se sirve en abierto.",
      );
      return;
    }
    if (archivo.size > (tipo === "logo" ? MAX_BYTES_LOGO : MAX_BYTES)) {
      setError(
        tipo === "logo"
          ? `"${archivo.name}" pesa demasiado para un logo. El máximo son 2 MB.`
          : `"${archivo.name}" pesa demasiado. El máximo son 10 MB.`,
      );
      return;
    }
    if (!tenantId) { setError("No se ha podido identificar tu negocio."); return; }

    setSubiendo(tipo);

    // Nombre saneado + uuid: dos archivos con el mismo nombre no se pisan, y
    // el nombre original se guarda aparte para poder enseñarlo.
    const limpio = archivo.name
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9.-]+/g, "-").slice(-60);
    const ruta = `${tenantId}/${campanaId}/${crypto.randomUUID()}-${limpio}`;

    const { error: falloSubida } = await supabase.storage
      .from(bucket).upload(ruta, archivo, { contentType: archivo.type });

    if (falloSubida) {
      setSubiendo(null);
      setError(`No se pudo subir: ${falloSubida.message}`);
      return;
    }

    // Solo hay un logo por campaña: el nuevo sustituye al anterior.
    if (tipo === "logo") {
      const viejo = lista.find((r) => r.tipo === "logo" && r.campaign_id === campanaId);
      if (viejo) await borrar(viejo, false);
    }

    const { error: falloFila } = await supabase.from("recursos").insert({
      campaign_id: campanaId,
      tipo,
      nombre: archivo.name,
      ruta,
      bucket,
      mime: archivo.type || null,
      tamano: archivo.size,
    });

    setSubiendo(null);

    if (falloFila) {
      // La fila es la que manda: sin ella el archivo es basura invisible.
      await supabase.storage.from(bucket).remove([ruta]);
      setError(falloFila.message);
      return;
    }
    if (tipo === "documento") await leer(ruta);
    await cargar();
  }

  // Lee el texto del PDF para que el redactor sepa qué se ofrece. Si falla,
  // no es un error del usuario: puede escribirlo a mano.
  async function leer(ruta: string) {
    const { data: r } = await supabase.from("recursos").select("id").eq("ruta", ruta).single();
    if (!r) return;
    // Se ignora el resultado a propósito —la lectura del documento es
    // opcional— pero ahora, si falla, queda registrado en Incidencias.
    await invocar("leer-documento", { recurso_id: r.id }, "Leer documento adjunto");
  }

  async function guardarTexto(id: string, texto: string) {
    await supabase.from("recursos")
      .update({ texto, texto_estado: "manual" }).eq("id", id);
    await cargar();
  }

  async function borrar(r: Recurso, recargar = true) {
    setError(null);
    // Del bucket donde esté de verdad: los logos subidos antes de la 044
    // siguen en el privado, y borrarlos del público no haría nada.
    await supabase.storage.from(r.bucket ?? "recursos").remove([r.ruta]);
    const { error: fallo } = await supabase.from("recursos").delete().eq("id", r.id);
    if (fallo) setError(fallo.message);
    if (recargar) await cargar();
  }

  const logo = lista.find((r) => r.tipo === "logo" && r.campaign_id === campanaId)
            ?? lista.find((r) => r.tipo === "logo");
  const documentos = lista.filter((r) => r.tipo === "documento");

  return (
    <div className="tarjeta">
      <div>
        <h2>Logo y documentos</h2>
        <p className="sutil">
          Cada uno hace una cosa distinta, y conviene saber cuál:
        </p>
        <ul className="menudo" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>
            El <strong>logo</strong> va en la cabecera del correo y en la
            landing.
          </li>
          <li>
            Los <strong>documentos</strong> <strong>no se adjuntan</strong>.
            Lo que hacen es dar al redactor las condiciones reales de tu
            oferta, para que el correo pueda mencionarlas sin inventárselas.
          </li>
        </ul>
      </div>

      {error && <p className="caja-error">{error}</p>}

      {logo && logo.bucket !== "logos" && (
        <p className="caja-aviso">
          Este logo se subió antes de que los correos pudieran enseñarlo, y
          está guardado donde un cliente de correo no puede leerlo. Sale en la
          landing pero no en los correos. Vuelve a subirlo y ya aparecerá en
          los dos.
        </p>
      )}

      <div className="fila-cabeza">
        <div>
          <h3>Logo</h3>
          <p className="menudo">
            {logo
              ? logo.campaign_id === campanaId
                ? logo.nombre
                : `${logo.nombre} · del negocio, común a todas las campañas`
              : "Sin logo. PNG, JPG o WebP, hasta 2 MB."}
          </p>
        </div>
        <div className="acciones">
          <button className="secundario" disabled={subiendo === "logo"}
                  onClick={() => refLogo.current?.click()}>
            {subiendo === "logo" ? "Subiendo…" : logo ? "Cambiar" : "Subir logo"}
          </button>
          {logo && logo.campaign_id === campanaId && (
            <button className="fantasma" onClick={() => borrar(logo)}>Quitar</button>
          )}
        </div>
      </div>
      <input ref={refLogo} type="file" hidden accept="image/png,image/jpeg,image/webp"
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, "logo"); e.target.value = ""; }} />

      <hr />

      <div className="fila-cabeza">
        <div>
          <h3>Documentos</h3>
          <p className="menudo">
            Ofertas, catálogos, tarifas. PDF o Word, hasta 10 MB cada uno.
          </p>
        </div>
        <button className="secundario" disabled={subiendo === "documento"}
                onClick={() => refDoc.current?.click()}>
          {subiendo === "documento" ? "Subiendo…" : "Añadir documento"}
        </button>
      </div>
      <input ref={refDoc} type="file" hidden
             accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, "documento"); e.target.value = ""; }} />

      {documentos.length === 0 && (
        <p className="menudo">Todavía no hay ninguno.</p>
      )}

      {documentos.map((d) => (
        <Documento key={d.id} d={d} alBorrar={() => borrar(d)} alGuardar={guardarTexto} />
      ))}
    </div>
  );
}

/**
 * Cada documento enseña su texto, y ese texto es editable.
 *
 * Lo que llega al redactor es esta caja, no el archivo: una extracción con
 * cabeceras y números de página da malos mensajes, y corregirla aquí los
 * arregla sin volver a subir nada.
 */
function Documento({
  d, alBorrar, alGuardar,
}: {
  d: Recurso;
  alBorrar: () => void;
  alGuardar: (id: string, texto: string) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(d.texto ?? "");
  const [guardando, setGuardando] = useState(false);

  const sinTexto = !d.texto?.trim();

  return (
    <div className="fila" style={{ padding: "var(--e4)" }}>
      <div className="fila-cabeza">
        <div>
          <strong style={{ fontSize: "0.9375rem" }}>{d.nombre}</strong>
          <div className="menudo">
            {peso(d.tamano)}
            {d.texto_estado === "extraido" && " · texto leído del PDF"}
            {d.texto_estado === "manual"   && " · texto escrito a mano"}
            {d.texto_estado === "fallido"  && " · no se ha podido leer"}
            {d.texto_estado === "no_soportado" && " · solo se leen PDF"}
          </div>
        </div>
        <div className="acciones">
          <button className="fantasma" onClick={() => setAbierto(!abierto)}>
            {abierto ? "Cerrar" : sinTexto ? "Escribir la oferta" : "Ver la oferta"}
          </button>
          <button className="fantasma" onClick={alBorrar}>Quitar</button>
        </div>
      </div>

      {sinTexto && !abierto && (
        <p className="caja-aviso">
          Este documento se adjuntará al correo, pero el redactor no sabe qué
          dice. Escribe de qué va la oferta para que los mensajes la
          mencionen.
        </p>
      )}

      {abierto && (
        <>
          <label className="campo">
            <span>Qué se ofrece — es lo que lee el redactor</span>
            <textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Convenio para gimnasios: primera valoración gratuita para sus socios, descuento en bonos…" />
          </label>
          <p className="menudo">
            El modelo puede mencionar estas condiciones y ninguna otra. Lo que
            escribas aquí es un compromiso comercial: si dice «15 % de
            descuento», eso llega a los correos.
          </p>
          <div className="acciones">
            <button className="primario" disabled={guardando}
                    onClick={async () => {
                      setGuardando(true);
                      await alGuardar(d.id, texto.trim());
                      setGuardando(false);
                      setAbierto(false);
                    }}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function peso(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
