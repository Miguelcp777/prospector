// ============================================================
// Pantalla de campañas.
//
// Es la única que escribe en la base, y lo hace sin mandar tenant_id: desde
// la migración 006 lo pone el DEFAULT auth_tenant_id(). La RLS lo sigue
// comprobando igual.
//
// Encolar un descubrimiento gasta dinero en Google Places, así que el botón
// dice cuánto puede costar como mucho antes de pulsarlo, no después.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Campana = {
  id: string;
  nombre: string;
  ciudad: string;
  radio_km: number;
  estado: string;
  max_consultas: number;
  creado_en: string;
};

type Job = {
  campaign_id: string;
  estado: string;
  progreso: number;
  consultas: number;
  detalle: string | null;
  creado_en: string;
};

type Resumen = { campaign_id: string; leads: number; segmentos: number };

export function Campanas({ verLeads }: { verLeads: () => void }) {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [resumen, setResumen] = useState<Record<string, Resumen>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const [c, j, r] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, ciudad, radio_km, estado, max_consultas, creado_en")
        .order("creado_en", { ascending: false }),
      supabase.from("jobs")
        .select("campaign_id, estado, progreso, consultas, detalle, creado_en")
        .eq("tipo", "descubrir")
        .order("creado_en", { ascending: false }),
      supabase.from("v_resumen_campana").select("campaign_id, leads, segmentos"),
    ]);

    if (c.error) { setError(c.error.message); setCargando(false); return; }

    setCampanas((c.data ?? []) as Campana[]);

    // Solo interesa el último job de cada campaña; vienen ordenados por
    // fecha descendente, así que el primero que se ve de cada una gana.
    const ultimos: Record<string, Job> = {};
    for (const job of (j.data ?? []) as Job[]) {
      if (!ultimos[job.campaign_id]) ultimos[job.campaign_id] = job;
    }
    setJobs(ultimos);

    const porCampana: Record<string, Resumen> = {};
    for (const fila of (r.data ?? []) as Resumen[]) porCampana[fila.campaign_id] = fila;
    setResumen(porCampana);

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras algo esté buscando, refrescamos: el worker avanza por su cuenta
  // y una pantalla congelada parece una campaña atascada.
  useEffect(() => {
    const buscando = campanas.some((c) => c.estado === "buscando");
    if (!buscando) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [campanas, cargar]);

  async function encolar(c: Campana) {
    setError(null);
    const { error: fallo } = await supabase.rpc("encolar_descubrimiento", {
      p_campaign: c.id,
    });
    if (fallo) setError(fallo.message);
    await cargar();
  }

  if (cargando) return <section className="panel"><p className="sutil">Cargando campañas…</p></section>;

  return (
    <section className="panel">
      <header className="cabecera">
        <h1>Campañas</h1>
        <button className="pestana activa" onClick={() => setCreando(!creando)}>
          {creando ? "Cancelar" : "Nueva campaña"}
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {creando && (
        <FormularioCampana
          alCrear={async () => { setCreando(false); await cargar(); }}
          alFallar={setError}
        />
      )}

      {campanas.length === 0 && (
        <p className="sutil">
          Todavía no hay campañas. Crea una para empezar a descubrir leads.
        </p>
      )}

      <div className="lista">
        {campanas.map((c) => {
          const job = jobs[c.id];
          const res = resumen[c.id];
          const segmentos = res?.segmentos ?? 0;
          const buscando = c.estado === "buscando";

          return (
            <article key={c.id} className="fila">
              <div className="fila-cabeza">
                <div>
                  <strong>{c.nombre}</strong>
                  <div className="sutil">
                    {c.ciudad} · {c.radio_km} km · techo de {c.max_consultas} consultas
                  </div>
                </div>
                <Estado valor={c.estado} />
              </div>

              <div className="fila-cifras">
                <span><strong>{res?.leads ?? 0}</strong> leads</span>
                <span><strong>{segmentos}</strong> segmentos</span>
                {job && <span><strong>{job.consultas}</strong> consultas gastadas</span>}
              </div>

              {buscando && job && (
                <div className="progreso">
                  <div className="barra-progreso">
                    <div style={{ width: `${job.progreso}%` }} />
                  </div>
                  <span className="sutil">{job.progreso}% · {job.detalle}</span>
                </div>
              )}

              {!buscando && job && job.detalle && (
                <p className="sutil">Último descubrimiento: {job.detalle}</p>
              )}

              <div className="acciones">
                <button
                  className="pestana activa"
                  disabled={buscando || segmentos === 0}
                  onClick={() => encolar(c)}
                >
                  {buscando ? "Buscando…" : "Buscar leads"}
                </button>
                {(res?.leads ?? 0) > 0 && (
                  <button className="pestana" onClick={verLeads}>Ver leads</button>
                )}
              </div>

              {segmentos === 0 && (
                <p className="sutil">
                  Esta campaña no tiene segmentos aceptados, así que no hay nada
                  que buscar. Los segmentos salen de la inferencia — esa pantalla
                  todavía no existe.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FormularioCampana({
  alCrear,
  alFallar,
}: {
  alCrear: () => void;
  alFallar: (m: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [radio, setRadio] = useState(25);
  const [tope, setTope] = useState(120);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !ciudad.trim()) {
      alFallar("La campaña necesita nombre y ciudad.");
      return;
    }
    setEnviando(true);
    // Sin tenant_id: lo pone el DEFAULT y lo comprueba la RLS.
    const { error } = await supabase.from("campaigns").insert({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      ciudad: ciudad.trim(),
      radio_km: radio,
      max_consultas: tope,
    });
    setEnviando(false);
    if (error) alFallar(error.message);
    else alCrear();
  }

  return (
    <form className="fila" onSubmit={enviar}>
      <label className="campo">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Fisios Valencia" />
      </label>
      <label className="campo">
        <span>Tu negocio, en una frase</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
               placeholder="Clínica de fisioterapia y readaptación deportiva" />
      </label>
      <div className="filtros">
        <label className="campo">
          <span>Ciudad</span>
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Valencia" />
        </label>
        <label className="campo">
          <span>Radio (km)</span>
          <input type="number" min={1} max={200} value={radio}
                 onChange={(e) => setRadio(Number(e.target.value))} />
        </label>
        <label className="campo">
          <span>Techo de consultas</span>
          <input type="number" min={1} max={2000} value={tope}
                 onChange={(e) => setTope(Number(e.target.value))} />
        </label>
      </div>
      <p className="sutil">
        Cada consulta a Google Places se paga. El techo es el gasto máximo de
        esta campaña, y el worker deja de buscar al alcanzarlo.
      </p>
      <button type="submit" disabled={enviando}>
        {enviando ? "Creando…" : "Crear campaña"}
      </button>
    </form>
  );
}

function Estado({ valor }: { valor: string }) {
  return <span className={`etiqueta ${valor}`}>{valor}</span>;
}
