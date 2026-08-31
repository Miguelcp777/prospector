// ============================================================
// Onboarding de una campaña: describir el negocio, inferir sus segmentos
// y decidir cuáles valen.
//
// La inferencia la hace la Edge Function `infer-segments`, no el navegador:
// la clave de Anthropic vive en el servidor. La función persiste los
// segmentos con el JWT del usuario, así que la RLS sigue aplicando.
//
// Todos nacen aceptados y se descartan a mano. Es la opción honesta: el
// modelo propone, la persona decide, y descartar cuesta un clic mientras
// que revisar ocho casillas vacías cuesta ocho.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Campana = {
  id: string;
  nombre: string;
  descripcion: string | null;
  ciudad: string;
  estado: string;
};

type Segmento = {
  id: string;
  slug: string;
  nombre: string;
  motivo: string | null;
  prioridad: string;
  queries: string[];
  aceptado: boolean;
};

export function Segmentos({
  campanaId,
  volver,
}: {
  campanaId: string;
  volver: () => void;
}) {
  const [campana, setCampana] = useState<Campana | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [vertical, setVertical] = useState("");
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [infiriendo, setInfiriendo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, s, p] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, descripcion, ciudad, estado")
        .eq("id", campanaId).single(),
      supabase.from("segments")
        .select("id, slug, nombre, motivo, prioridad, queries, aceptado")
        .eq("campaign_id", campanaId)
        .order("prioridad")
        .order("nombre"),
      // La vertical vive en el tenant y el prompt la usa para anclarse a la
      // taxonomía curada. Sin ella la inferencia funciona, pero peor.
      supabase.from("profiles").select("tenants(vertical)").single(),
    ]);

    if (c.error) { setError(c.error.message); setCargando(false); return; }

    const camp = c.data as Campana;
    setCampana(camp);
    setDescripcion(camp.descripcion ?? "");
    setSegmentos((s.data ?? []) as Segmento[]);

    const perfil = p.data as unknown as { tenants: { vertical: string } | null } | null;
    setVertical(perfil?.tenants?.vertical ?? "");

    setCargando(false);
  }, [campanaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function inferir() {
    setError(null);

    if (descripcion.trim().length < 20) {
      setError("Describe el negocio con algo más de detalle: el modelo infiere a partir de esto.");
      return;
    }

    setInfiriendo(true);

    // Guardamos la descripción antes de inferir: si el usuario la ha
    // reescrito, la campaña debe quedarse con la que produjo estos segmentos.
    await supabase.from("campaigns")
      .update({ descripcion: descripcion.trim() })
      .eq("id", campanaId);

    const { data, error: fallo } = await supabase.functions.invoke("infer-segments", {
      body: {
        campaign_id: campanaId,
        descripcion: descripcion.trim(),
        vertical,
        ciudad: campana?.ciudad,
      },
    });

    setInfiriendo(false);

    if (fallo) {
      setError(`La inferencia falló: ${fallo.message}`);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }

    await cargar();
  }

  async function alternar(s: Segmento) {
    // Optimista: el clic tiene que responder al momento. Si falla, cargar()
    // devuelve el estado real.
    setSegmentos((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, aceptado: !x.aceptado } : x)),
    );
    const { error: fallo } = await supabase
      .from("segments")
      .update({ aceptado: !s.aceptado })
      .eq("id", s.id);
    if (fallo) { setError(fallo.message); await cargar(); }
  }

  if (cargando) return <section className="panel"><p className="sutil">Cargando…</p></section>;

  const aceptados = segmentos.filter((s) => s.aceptado).length;
  const consultas = segmentos
    .filter((s) => s.aceptado)
    .reduce((n, s) => n + s.queries.length, 0);

  return (
    <section className="panel">
      <header className="cabecera">
        <button className="pestana" onClick={volver}>← Campañas</button>
        <h1>{campana?.nombre}</h1>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="fila">
        <label className="campo">
          <span>Tu negocio, con detalle</span>
          <textarea
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Clínica de fisioterapia y readaptación deportiva, cuatro fisios, mucha lesión deportiva y recuperación postoperatoria"
          />
        </label>
        <p className="sutil">
          Cuanto más concreto, mejores segmentos. El modelo se apoya además en
          la taxonomía de {vertical || "tu vertical"} y en {campana?.ciudad}.
        </p>
        <button onClick={inferir} disabled={infiriendo}>
          {infiriendo
            ? "Pensando… (unos 15 segundos)"
            : segmentos.length > 0 ? "Volver a inferir" : "Inferir segmentos"}
        </button>
        {segmentos.length > 0 && (
          <p className="sutil">
            Volver a inferir reescribe los segmentos que compartan identificador
            y añade los nuevos. Lo que hayas descartado a mano puede reaparecer.
          </p>
        )}
      </div>

      {segmentos.length === 0 && !infiriendo && (
        <p className="sutil">
          Todavía no hay segmentos. Describe el negocio y pulsa Inferir.
        </p>
      )}

      {segmentos.length > 0 && (
        <>
          <div className="cifras">
            <Cifra valor={segmentos.length} etiqueta="propuestos" />
            <Cifra valor={aceptados} etiqueta="aceptados" />
            <Cifra valor={consultas} etiqueta="consultas que costarán" />
          </div>
          <p className="sutil">
            Cada query de un segmento aceptado es al menos una consulta de pago
            a Google Places, y más si hay varias páginas de resultados.
            Descartar lo que no encaje es lo que abarata la campaña.
          </p>

          <div className="lista">
            {segmentos.map((s) => (
              <article key={s.id} className={s.aceptado ? "fila" : "fila descartada"}>
                <div className="fila-cabeza">
                  <div>
                    <strong>{s.nombre}</strong>
                    {s.motivo && <div className="sutil">{s.motivo}</div>}
                  </div>
                  <span className={`etiqueta ${s.prioridad}`}>{s.prioridad}</span>
                </div>

                <div className="queries">
                  {s.queries.map((q) => <code key={q}>{q}</code>)}
                </div>

                <div className="acciones">
                  <button
                    className={s.aceptado ? "pestana" : "pestana activa"}
                    onClick={() => alternar(s)}
                  >
                    {s.aceptado ? "Descartar" : "Recuperar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="cifra">
      <strong>{valor}</strong>
      <span>{etiqueta}</span>
    </div>
  );
}
