// ============================================================
// La landing de una campaña.
//
// Generar y publicar son dos actos distintos a propósito. El texto lo
// escribe un modelo: entre que existe y que lo ve un cliente tiene que
// haber una persona que lo lea. Por eso regenerar vuelve a despublicarla.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { invocar } from "../lib/edge";

type Bloque = { titulo: string; texto: string };
type Contenido = {
  titulo: string;
  subtitulo: string;
  propuesta: string;
  bloques: Bloque[];
  cta: string;
};

type LandingFila = {
  id: string;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  contenido: Contenido;
  publicada: boolean;
  actualizado_en: string;
};

type Contacto = {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  mensaje: string | null;
  creado_en: string;
};


export function Landing({
  campanaId,
  volver,
}: {
  campanaId: string;
  volver: () => void;
}) {
  const [landing, setLanding] = useState<LandingFila | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [generando, setGenerando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase
      .from("landings")
      .select("id, slug, titulo, subtitulo, contenido, publicada, actualizado_en")
      .eq("campaign_id", campanaId)
      .maybeSingle();

    if (fallo) setError(fallo.message);
    const l = (data ?? null) as LandingFila | null;
    setLanding(l);

    if (l) {
      const { data: c } = await supabase
        .from("landing_contactos")
        .select("id, nombre, email, telefono, mensaje, creado_en")
        .eq("landing_id", l.id)
        .order("creado_en", { ascending: false });
      setContactos((c ?? []) as Contacto[]);
    }
    setCargando(false);
  }, [campanaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function generar() {
    setError(null);
    setGenerando(true);
    const { error: fallo } = await invocar(
      "generar-landing", { campaign_id: campanaId }, "Generar landing",
    );
    setGenerando(false);

    if (fallo) { setError(fallo); return; }
    await cargar();
  }

  async function alternarPublicada() {
    if (!landing) return;
    const { error: fallo } = await supabase
      .from("landings")
      .update({ publicada: !landing.publicada })
      .eq("id", landing.id);
    if (fallo) setError(fallo.message);
    await cargar();
  }

  if (cargando) return <section className="panel"><p className="sutil">Cargando…</p></section>;

  const url = landing ? `${location.origin}/landing.html?s=${landing.slug}` : "";

  return (
    <section className="panel">
      <header className="cabecera">
        <button className="fantasma" onClick={volver}>← Volver</button>
        <h1>Landing</h1>
      </header>

      {error && <p className="error">{error}</p>}

      {!landing && (
        <div className="fila">
          <p className="sutil">
            Esta campaña no tiene landing. Se escribe a partir de los
            segmentos que aceptaste, así que conviene tenerlos definidos
            antes.
          </p>
          <button className="primario" onClick={generar} disabled={generando}>
            {generando ? "Escribiendo… (unos 15 segundos)" : "Generar landing"}
          </button>
        </div>
      )}

      {landing && (
        <>
          <div className="fila">
            <div className="fila-cabeza">
              <div>
                <strong>{landing.titulo}</strong>
                {landing.subtitulo && <div className="sutil">{landing.subtitulo}</div>}
              </div>
              <span className={`etiqueta ${landing.publicada ? "lista" : "borrador"}`}>
                {landing.publicada ? "publicada" : "sin publicar"}
              </span>
            </div>

            {landing.publicada ? (
              <p className="sutil">
                En vivo:{" "}
                <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
              </p>
            ) : (
              <p className="sutil">
                Todavía no se sirve a nadie. Léela entera y publícala cuando
                estés conforme — lleva el nombre de tu negocio.
              </p>
            )}

            <div className="acciones">
              <button
                className={landing.publicada ? "secundario" : "primario"}
                onClick={alternarPublicada}
              >
                {landing.publicada ? "Despublicar" : "Publicar"}
              </button>
              <button className="secundario" onClick={generar} disabled={generando}>
                {generando ? "Escribiendo…" : "Volver a escribirla"}
              </button>
              {landing.publicada && (
                <a className="secundario" href={url} target="_blank" rel="noopener noreferrer">
                  Verla
                </a>
              )}
            </div>

            {landing.publicada && (
              <p className="sutil">
                Volver a escribirla la despublica: el texto cambia y hay que
                releerlo. El enlace se conserva, por si ya está en un correo.
              </p>
            )}
          </div>

          <h2>Lo que dice</h2>
          <div className="fila">
            <p>{landing.contenido.propuesta}</p>
            {(landing.contenido.bloques ?? []).map((b, i) => (
              <div key={i} className="bloque-landing">
                <strong>{b.titulo}</strong>
                <p className="sutil">{b.texto}</p>
              </div>
            ))}
            <p className="sutil">Botón del formulario: «{landing.contenido.cta}»</p>
          </div>

          <h2>Contactos recibidos ({contactos.length})</h2>
          {contactos.length === 0 && (
            <p className="sutil">
              Nadie ha rellenado el formulario todavía. Quien lo haga llega
              con su consentimiento marcado: a esos sí se les puede escribir.
            </p>
          )}

          {contactos.length > 0 && (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Mensaje</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {contactos.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.nombre ?? "—"}</strong></td>
                      <td>{c.email}</td>
                      <td>{c.telefono ?? "—"}</td>
                      <td>{c.mensaje ?? "—"}</td>
                      <td className="sutil">
                        {new Date(c.creado_en).toLocaleDateString("es-ES")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
