// ============================================================
// Lista de campañas.
//
// Solo dos cosas: ver en qué punto está cada campaña y crear una nueva. El
// trabajo de verdad pasa dentro de cada una, en su recorrido por pasos.
//
// Escribe en la base sin mandar tenant_id: desde la 006 lo pone el DEFAULT
// auth_tenant_id(). La RLS lo sigue comprobando igual.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Campana } from "./Campana";

type Fila = {
  id: string;
  nombre: string;
  ciudad: string;
  radio_km: number;
  estado: string;
  max_consultas: number;
};

type Resumen = { campaign_id: string; leads: number; con_email: number };

export function Campanas() {
  const [campanas, setCampanas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Record<string, Resumen>>({});
  const [segmentos, setSegmentos] = useState<Record<string, number>>({});
  const [gasto, setGasto] = useState<
    { tenant: number; techoT: number; proyecto: number; techoP: number } | null
  >(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, r, s, cp, tn, aj] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, ciudad, radio_km, estado, max_consultas")
        .order("creado_en", { ascending: false }),
      supabase.from("v_resumen_campana").select("campaign_id, leads, con_email"),
      // Los segmentos NO salen de v_resumen_campana: esa vista cuenta los
      // que ya tienen leads, y una campaña recién inferida daría 0.
      supabase.from("segments").select("campaign_id").eq("aceptado", true),
      supabase.from("consumo_places").select("consultas").limit(1),
      supabase.from("tenants").select("max_consultas_mes").limit(1),
      supabase.from("ajustes").select("max_consultas_mes_proyecto").limit(1),
    ]);

    if (c.error) { setError(c.error.message); setCargando(false); return; }
    setCampanas((c.data ?? []) as Fila[]);

    const porCampana: Record<string, Resumen> = {};
    for (const f of (r.data ?? []) as Resumen[]) porCampana[f.campaign_id] = f;
    setResumen(porCampana);

    const segs: Record<string, number> = {};
    for (const f of (s.data ?? []) as { campaign_id: string }[]) {
      segs[f.campaign_id] = (segs[f.campaign_id] ?? 0) + 1;
    }
    setSegmentos(segs);

    const { data: totalP } = await supabase.rpc("consultas_del_proyecto");
    const techoT = (tn.data?.[0] as { max_consultas_mes: number } | undefined)?.max_consultas_mes;
    const techoP = (aj.data?.[0] as { max_consultas_mes_proyecto: number } | undefined)?.max_consultas_mes_proyecto;
    if (techoT !== undefined && techoP !== undefined) {
      setGasto({
        tenant: (cp.data?.[0] as { consultas: number } | undefined)?.consultas ?? 0,
        techoT,
        proyecto: Number(totalP ?? 0),
        techoP,
      });
    }

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (abierta) {
    return <Campana id={abierta} volver={() => { setAbierta(null); cargar(); }} />;
  }

  if (cargando) return <div className="panel"><p className="sutil">Cargando…</p></div>;

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <h1>Campañas</h1>
          <p className="sutil">Cada campaña es un recorrido: describir, segmentar, buscar, escribir.</p>
        </div>
        <button className="primario" onClick={() => setCreando(!creando)}>
          {creando ? "Cancelar" : "Nueva campaña"}
        </button>
      </div>

      {error && <p className="caja-error">{error}</p>}

      {gasto && (
        <div className="cifras">
          <div className="cifra">
            <strong>
              {gasto.tenant}
              <span style={{ fontSize: "1rem", color: "var(--texto-3)" }}> / {gasto.techoT}</span>
            </strong>
            <span>búsquedas tuyas este mes</span>
          </div>
          <div className="cifra">
            <strong>
              {gasto.proyecto}
              <span style={{ fontSize: "1rem", color: "var(--texto-3)" }}> / {gasto.techoP}</span>
            </strong>
            <span>del servicio · cupo gratuito de Google</span>
          </div>
        </div>
      )}

      {creando && (
        <Formulario alCrear={async () => { setCreando(false); await cargar(); }} alFallar={setError} />
      )}

      {campanas.length === 0 && !creando && (
        <div className="tarjeta">
          <h2>Todavía no hay campañas</h2>
          <p className="sutil">
            Una campaña es un negocio, una ciudad y un tipo de cliente al que
            quieres llegar. Crea la primera y te guío paso a paso.
          </p>
        </div>
      )}

      <div className="lista">
        {campanas.map((c) => {
          const res = resumen[c.id];
          const segs = segmentos[c.id] ?? 0;
          return (
            <button key={c.id} className="tarjeta tarjeta-enlace" onClick={() => setAbierta(c.id)}>
              <div className="fila-cabeza">
                <div>
                  <strong style={{ fontSize: "1.0625rem" }}>{c.nombre}</strong>
                  <div className="sutil">{c.ciudad} · {c.radio_km} km</div>
                </div>
                <span className={`etiqueta ${c.estado}`}>{c.estado}</span>
              </div>
              <div className="fila-cifras">
                <span><strong>{segs}</strong> segmentos</span>
                <span><strong>{res?.leads ?? 0}</strong> leads</span>
                <span><strong>{res?.con_email ?? 0}</strong> con email</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Formulario({
  alCrear, alFallar,
}: { alCrear: () => void; alFallar: (m: string) => void }) {
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
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Nueva campaña</h2>
      <label className="campo">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Fisios Valencia" />
      </label>
      <label className="campo">
        <span>Tu negocio, en una frase</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
               placeholder="Clínica de fisioterapia y readaptación deportiva" />
      </label>
      <div className="rejilla">
        <label className="campo">
          <span>Ciudad</span>
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Valencia" />
        </label>
        <label className="campo">
          <span>Radio (km)</span>
          <input type="number" min={1} max={200} value={radio} onChange={(e) => setRadio(Number(e.target.value))} />
        </label>
        <label className="campo">
          <span>Techo de búsquedas</span>
          <input type="number" min={1} max={2000} value={tope} onChange={(e) => setTope(Number(e.target.value))} />
        </label>
      </div>
      <p className="menudo">
        Cada búsqueda en Google Places se paga a partir del cupo gratuito. El
        techo es el gasto máximo de esta campaña.
      </p>
      <div className="acciones">
        <button className="primario" type="submit" disabled={enviando}>
          {enviando ? "Creando…" : "Crear campaña"}
        </button>
      </div>
    </form>
  );
}
