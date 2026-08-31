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
import { Segmentos } from "./Segmentos";

type Campana = {
  id: string;
  nombre: string;
  ciudad: string;
  radio_km: number;
  estado: string;
  max_consultas: number;
  creado_en: string;
  ultima_busqueda_en: string | null;
};

/** Lo mismo que frena encolar_descubrimiento en la base. Aquí solo se enseña. */
const DIAS_ENFRIADO = 30;

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type Job = {
  campaign_id: string;
  estado: string;
  progreso: number;
  consultas: number;
  detalle: string | null;
  creado_en: string;
};

type Resumen = { campaign_id: string; leads: number; con_email: number; segmentos: number };

export function Campanas({ verLeads }: { verLeads: () => void }) {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [resumen, setResumen] = useState<Record<string, Resumen>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [gasto, setGasto] = useState<{ gastado: number; techo: number } | null>(null);
  // Campaña cuya repetición la base ha frenado y el usuario puede forzar.
  const [frenada, setFrenada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, j, r, s] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, ciudad, radio_km, estado, max_consultas, creado_en, ultima_busqueda_en")
        .order("creado_en", { ascending: false }),
      supabase.from("jobs")
        .select("campaign_id, estado, progreso, consultas, detalle, creado_en")
        .eq("tipo", "descubrir")
        .order("creado_en", { ascending: false }),
      supabase.from("v_resumen_campana").select("campaign_id, leads, con_email"),
      // Los segmentos se cuentan aquí y no en v_resumen_campana: la vista
      // hace count(distinct l.segment_id), que son los segmentos QUE YA
      // TIENEN LEADS. Una campaña recién inferida da 0 por ahí, y con 0 el
      // botón de buscar se queda deshabilitado para siempre.
      supabase.from("segments").select("campaign_id").eq("aceptado", true),
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
    for (const fila of (r.data ?? []) as { campaign_id: string; leads: number; con_email: number }[]) {
      porCampana[fila.campaign_id] = { ...fila, segmentos: 0 };
    }
    for (const fila of (s.data ?? []) as { campaign_id: string }[]) {
      const actual = porCampana[fila.campaign_id] ??
        { campaign_id: fila.campaign_id, leads: 0, con_email: 0, segmentos: 0 };
      porCampana[fila.campaign_id] = { ...actual, segmentos: actual.segmentos + 1 };
    }
    setResumen(porCampana);

    // Gasto del mes contra el techo del tenant. Las dos filas las filtra la
    // RLS, así que esto es lo tuyo aunque no lleve ningún where.
    const [cp, tn] = await Promise.all([
      supabase.from("consumo_places").select("consultas").limit(1),
      supabase.from("tenants").select("max_consultas_mes").limit(1),
    ]);
    const techo = (tn.data?.[0] as { max_consultas_mes: number } | undefined)?.max_consultas_mes;
    if (techo !== undefined) {
      setGasto({
        gastado: (cp.data?.[0] as { consultas: number } | undefined)?.consultas ?? 0,
        techo,
      });
    }

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

  // El enriquecimiento no paga API: son peticiones a webs públicas. Por eso
  // no tiene enfriado ni techo, y el botón no avisa de ningún coste.
  async function enriquecer(c: Campana) {
    setError(null);
    const { error: fallo } = await supabase.rpc("encolar_enriquecimiento", {
      p_campaign: c.id,
    });
    if (fallo) setError(fallo.message);
    await cargar();
  }

  // Redactar cuesta una llamada a Claude por lead, así que el botón dice
  // cuántos van a redactarse antes de pulsarlo.
  async function redactar(c: Campana) {
    setError(null);
    const { error: fallo } = await supabase.rpc("encolar_redaccion", { p_campaign: c.id });
    if (fallo) setError(fallo.message);
    await cargar();
  }

  async function encolar(c: Campana, forzar = false) {
    setError(null);
    setFrenada(null);
    const { error: fallo } = await supabase.rpc("encolar_descubrimiento", {
      p_campaign: c.id,
      p_forzar: forzar,
    });
    if (fallo) {
      setError(fallo.message);
      // El enfriado se puede saltar; el techo mensual no. Distinguimos por el
      // texto porque es lo único que devuelve PostgREST de un raise exception.
      if (!forzar && fallo.message.includes("en pausa")) setFrenada(c.id);
    }
    await cargar();
  }

  // El onboarding es de una campaña concreta, así que vive dentro de esta
  // pantalla en vez de en una pestaña suelta que no sabría de cuál habla.
  if (abierta) {
    return (
      <Segmentos
        campanaId={abierta}
        volver={() => { setAbierta(null); cargar(); }}
      />
    );
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

      {gasto && (
        <p className="sutil">
          Consultas a Places este mes: <strong>{gasto.gastado}</strong> de{" "}
          <strong>{gasto.techo}</strong>. Al alcanzar el techo se para todo hasta
          el día 1, y eso no se puede forzar.
        </p>
      )}

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
                <span><strong>{res?.con_email ?? 0}</strong> con email</span>
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
                <button className="pestana" onClick={() => setAbierta(c.id)}>
                  {segmentos === 0 ? "Definir segmentos" : `Segmentos (${segmentos})`}
                </button>
                <button
                  className="pestana activa"
                  disabled={buscando || segmentos === 0}
                  onClick={() => encolar(c)}
                >
                  {buscando ? "Buscando…" : "Buscar leads"}
                </button>
                {(res?.leads ?? 0) > 0 && (
                  <button className="pestana" onClick={() => enriquecer(c)}>
                    Buscar emails
                  </button>
                )}
                {(res?.con_email ?? 0) > 0 && (
                  <button className="pestana" onClick={() => redactar(c)}>
                    Redactar mensajes ({res?.con_email})
                  </button>
                )}
                {(res?.leads ?? 0) > 0 && (
                  <button className="pestana" onClick={verLeads}>Ver leads</button>
                )}
                {frenada === c.id && (
                  <button className="pestana peligro" onClick={() => encolar(c, true)}>
                    Buscar igualmente (hasta {c.max_consultas} consultas)
                  </button>
                )}
              </div>

              {c.ultima_busqueda_en && !buscando && (
                <p className="sutil">
                  {(() => {
                    const d = diasDesde(c.ultima_busqueda_en);
                    return d < DIAS_ENFRIADO
                      ? `Buscada hace ${d} ${d === 1 ? "día" : "días"}. Places apenas cambia en semanas, así que repetir ahora sería pagar dos veces por lo mismo: en pausa ${DIAS_ENFRIADO - d} días más.`
                      : `Buscada hace ${d} días. Ya compensa volver a mirar.`;
                  })()}
                </p>
              )}

              {segmentos === 0 && (
                <p className="sutil">
                  Sin segmentos aceptados no hay nada que buscar. Define primero
                  a quién te diriges.
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
