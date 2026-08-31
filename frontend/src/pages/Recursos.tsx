// ============================================================
// Logo y documentos de una campaña.
//
// Los archivos van a un bucket PRIVADO. Uno público sería más simple, pero
// significaría que la oferta comercial de un cliente la puede leer
// cualquiera que adivine la ruta. La landing los sirve con URLs firmadas
// que caducan, generadas en el servidor.
//
// El aislamiento vive en la ruta: todo empieza por el uuid del tenant, y la
// política de storage compara ese tramo con auth_tenant_id().
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Recurso = {
  id: string;
  campaign_id: string | null;
  tipo: "logo" | "documento";
  nombre: string;
  ruta: string;
  mime: string | null;
  tamano: number | null;
};

const MAX_BYTES = 10 * 1024 * 1024;

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
        .select("id, campaign_id, tipo, nombre, ruta, mime, tamano")
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

    if (archivo.size > MAX_BYTES) {
      setError(`"${archivo.name}" pesa demasiado. El máximo son 10 MB.`);
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
      .from("recursos").upload(ruta, archivo, { contentType: archivo.type });

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
      mime: archivo.type || null,
      tamano: archivo.size,
    });

    setSubiendo(null);

    if (falloFila) {
      // La fila es la que manda: sin ella el archivo es basura invisible.
      await supabase.storage.from("recursos").remove([ruta]);
      setError(falloFila.message);
      return;
    }
    await cargar();
  }

  async function borrar(r: Recurso, recargar = true) {
    setError(null);
    await supabase.storage.from("recursos").remove([r.ruta]);
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
          Aparecen en la landing de la campaña. Los archivos son privados: la
          página los sirve con enlaces que caducan, no quedan sueltos en
          internet.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <div className="fila-cabeza">
        <div>
          <h3>Logo</h3>
          <p className="menudo">
            {logo
              ? logo.campaign_id === campanaId
                ? logo.nombre
                : `${logo.nombre} · del negocio, común a todas las campañas`
              : "Sin logo. PNG, JPG, WebP o SVG."}
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
      <input ref={refLogo} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml"
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
        <div key={d.id} className="fila-cabeza">
          <div>
            <strong style={{ fontSize: "0.9375rem" }}>{d.nombre}</strong>
            <div className="menudo">{peso(d.tamano)}</div>
          </div>
          <button className="fantasma" onClick={() => borrar(d)}>Quitar</button>
        </div>
      ))}
    </div>
  );
}

function peso(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
