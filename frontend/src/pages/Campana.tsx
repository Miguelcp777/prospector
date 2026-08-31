// ============================================================
// El recorrido de una campaña, paso a paso.
//
// La aplicación tenía las piezas sueltas y el cliente tenía que saber en
// qué orden pulsarlas. Aquí el orden es la pantalla: cada paso dice si está
// hecho, cuál toca ahora y qué falta para el siguiente.
//
// El estado no se guarda en ningún sitio nuevo — se deduce de los datos que
// ya existen (hay descripción, hay segmentos aceptados, hay leads, hay
// emails, hay mensajes). Un campo "paso_actual" en la base se desincroniza
// el primer día que alguien haga algo por otra vía.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Segmentos } from "./Segmentos";
import { Landing } from "./Landing";

type Campana = {
  id: string;
  nombre: string;
  descripcion: string | null;
  ciudad: string;
  radio_km: number;
  estado: string;
  max_consultas: number;
  ultima_busqueda_en: string | null;
};

type Job = { tipo: string; estado: string; progreso: number; detalle: string | null };

type Datos = {
  campana: Campana;
  segmentos: number;
  leads: number;
  conEmail: number;
  mensajes: number;
  jobs: Record<string, Job>;
};

type Estado = "hecho" | "actual" | "futuro";

export function Campana({ id, volver }: { id: string; volver: () => void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [sub, setSub] = useState<"segmentos" | "landing" | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [frenada, setFrenada] = useState(false);
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [desc, setDesc] = useState("");

  const cargar = useCallback(async () => {
    const [c, s, l, m, j] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, descripcion, ciudad, radio_km, estado, max_consultas, ultima_busqueda_en")
        .eq("id", id).single(),
      supabase.from("segments").select("id").eq("campaign_id", id).eq("aceptado", true),
      supabase.from("v_resumen_campana").select("leads, con_email").eq("campaign_id", id).maybeSingle(),
      supabase.from("messages").select("id, leads!inner(campaign_id)").eq("leads.campaign_id", id),
      supabase.from("jobs").select("tipo, estado, progreso, detalle")
        .eq("campaign_id", id).order("creado_en", { ascending: false }),
    ]);

    if (c.error) { setError(c.error.message); setCargando(false); return; }

    // El último job de cada tipo: vienen ordenados por fecha descendente.
    const jobs: Record<string, Job> = {};
    for (const job of (j.data ?? []) as Job[]) if (!jobs[job.tipo]) jobs[job.tipo] = job;

    const campana = c.data as Campana;
    setDesc(campana.descripcion ?? "");
    setD({
      campana,
      segmentos: (s.data ?? []).length,
      leads: (l.data as { leads: number } | null)?.leads ?? 0,
      conEmail: (l.data as { con_email: number } | null)?.con_email ?? 0,
      mensajes: (m.data ?? []).length,
      jobs,
    });
    setCargando(false);
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras haya algo corriendo, refrescamos: los workers avanzan solos y
  // una pantalla congelada parece una campaña atascada.
  useEffect(() => {
    if (!d) return;
    const activo = Object.values(d.jobs).some((j) => j.estado === "pendiente" || j.estado === "en_curso");
    if (!activo) return;
    const t = setInterval(cargar, 4000);
    return () => clearInterval(t);
  }, [d, cargar]);

  async function llamar(nombre: string, rpc: string, args: Record<string, unknown>) {
    setError(null);
    setOcupado(nombre);
    const { error: fallo } = await supabase.rpc(rpc, args);
    setOcupado(null);
    if (fallo) {
      setError(fallo.message);
      if (fallo.message.includes("en pausa")) setFrenada(true);
    }
    await cargar();
  }

  async function guardarDescripcion() {
    setError(null);
    const { error: fallo } = await supabase
      .from("campaigns").update({ descripcion: desc.trim() || null }).eq("id", id);
    if (fallo) setError(fallo.message);
    setEditandoDesc(false);
    await cargar();
  }

  if (cargando) return <div className="panel"><p className="sutil">Cargando…</p></div>;
  if (!d) return <div className="panel"><p className="caja-error">{error}</p></div>;

  if (sub === "segmentos") {
    return <Segmentos campanaId={id} volver={() => { setSub(null); cargar(); }} />;
  }
  if (sub === "landing") {
    return <Landing campanaId={id} volver={() => { setSub(null); cargar(); }} />;
  }

  const { campana, segmentos, leads, conEmail, mensajes, jobs } = d;
  const buscando = campana.estado === "buscando";
  const enriqueciendo = jobs.enriquecer?.estado === "en_curso" || jobs.enriquecer?.estado === "pendiente";
  const redactando = jobs.redactar?.estado === "en_curso" || jobs.redactar?.estado === "pendiente";

  const hechos = [
    !!campana.descripcion?.trim(),
    segmentos > 0,
    leads > 0,
    conEmail > 0,
    mensajes > 0,
    false,               // el envío no existe todavía
  ];
  const actual = hechos.findIndex((h) => !h);
  const estadoDe = (i: number): Estado =>
    hechos[i] ? "hecho" : i === actual ? "actual" : "futuro";

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <button className="fantasma" onClick={volver} style={{ alignSelf: "flex-start", marginLeft: -10 }}>
            ← Todas las campañas
          </button>
          <h1>{campana.nombre}</h1>
          <p className="sutil">
            {campana.ciudad} · {campana.radio_km} km · techo de {campana.max_consultas} búsquedas
          </p>
        </div>
        <span className={`etiqueta ${campana.estado}`}>{campana.estado}</span>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <div className="pasos">
        <Paso n={1} estado={estadoDe(0)} titulo="Describe tu negocio"
              resumen="Es de donde sale todo lo demás: cuanto más concreto, mejores clientes potenciales.">
          {editandoDesc || !campana.descripcion ? (
            <>
              <label className="campo">
                <span>Tu negocio, con detalle</span>
                <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)}
                  placeholder="Clínica de fisioterapia y readaptación deportiva, cuatro fisios, mucha lesión deportiva" />
              </label>
              <div className="acciones">
                <button className="primario" onClick={guardarDescripcion}>Guardar</button>
                {campana.descripcion && (
                  <button className="secundario" onClick={() => { setDesc(campana.descripcion ?? ""); setEditandoDesc(false); }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p>{campana.descripcion}</p>
              <div className="acciones">
                <button className="fantasma" onClick={() => setEditandoDesc(true)}>Editar</button>
              </div>
            </>
          )}
        </Paso>

        <Paso n={2} estado={estadoDe(1)} titulo="Elige a quién te diriges"
              resumen="El modelo propone tipos de negocio a partir de tu descripción. Tú decides cuáles valen."
              insignia={segmentos > 0 ? `${segmentos} segmentos` : undefined}>
          <p className="sutil">
            {segmentos > 0
              ? "Puedes revisarlos, descartar los que no encajen o volver a generarlos."
              : "Todavía no hay ninguno. Sin segmentos no hay nada que buscar."}
          </p>
          <div className="acciones">
            <button className={segmentos > 0 ? "secundario" : "primario"}
                    disabled={!campana.descripcion?.trim()}
                    onClick={() => setSub("segmentos")}>
              {segmentos > 0 ? "Revisar segmentos" : "Definir segmentos"}
            </button>
          </div>
          {!campana.descripcion?.trim() && (
            <p className="menudo">Antes hace falta la descripción del paso 1.</p>
          )}
        </Paso>

        <Paso n={3} estado={estadoDe(2)} titulo="Busca clientes potenciales"
              resumen="Google Places, por segmento y zona. Es el único paso que cuesta dinero."
              insignia={leads > 0 ? `${leads} leads` : undefined}>
          {buscando && jobs.descubrir ? (
            <div className="progreso">
              <div className="barra-progreso"><div style={{ width: `${jobs.descubrir.progreso}%` }} /></div>
              <span className="sutil">{jobs.descubrir.progreso}% · {jobs.descubrir.detalle}</span>
            </div>
          ) : (
            <>
              {jobs.descubrir?.detalle && <p className="sutil">Última búsqueda: {jobs.descubrir.detalle}</p>}
              <div className="acciones">
                <button className={leads > 0 ? "secundario" : "primario"}
                        disabled={segmentos === 0 || ocupado === "buscar"}
                        onClick={() => llamar("buscar", "encolar_descubrimiento", { p_campaign: id, p_forzar: false })}>
                  {ocupado === "buscar" ? "Encolando…" : leads > 0 ? "Buscar más" : "Buscar clientes"}
                </button>
                {frenada && (
                  <button className="peligro"
                          onClick={() => { setFrenada(false); llamar("buscar", "encolar_descubrimiento", { p_campaign: id, p_forzar: true }); }}>
                    Buscar igualmente (hasta {campana.max_consultas} búsquedas)
                  </button>
                )}
              </div>
              {segmentos === 0 && <p className="menudo">Antes hay que aceptar algún segmento.</p>}
            </>
          )}
        </Paso>

        <Paso n={4} estado={estadoDe(3)} titulo="Encuentra sus correos"
              resumen="Entramos en la web de cada lead a buscar su buzón de contacto. Esto no cuesta nada."
              insignia={conEmail > 0 ? `${conEmail} con email` : undefined}>
          {enriqueciendo && jobs.enriquecer ? (
            <div className="progreso">
              <div className="barra-progreso"><div style={{ width: `${jobs.enriquecer.progreso}%` }} /></div>
              <span className="sutil">{jobs.enriquecer.progreso}% · buscando correos…</span>
            </div>
          ) : (
            <>
              <p className="sutil">
                {conEmail > 0
                  ? `${conEmail} de ${leads} leads tienen correo. El resto no lo publica en su web.`
                  : "Google Places no da correos: hay que ir a buscarlos."}
              </p>
              <div className="acciones">
                <button className={conEmail > 0 ? "secundario" : "primario"}
                        disabled={leads === 0 || ocupado === "emails"}
                        onClick={() => llamar("emails", "encolar_enriquecimiento", { p_campaign: id })}>
                  {ocupado === "emails" ? "Encolando…" : conEmail > 0 ? "Buscar los que faltan" : "Buscar correos"}
                </button>
              </div>
              {leads === 0 && <p className="menudo">Antes hay que tener leads.</p>}
            </>
          )}
        </Paso>

        <Paso n={5} estado={estadoDe(4)} titulo="Escribe los mensajes"
              resumen="Un correo por lead, personalizado. Se guardan como borrador para que los leas antes."
              insignia={mensajes > 0 ? `${mensajes} escritos` : undefined}>
          {redactando && jobs.redactar ? (
            <div className="progreso">
              <div className="barra-progreso"><div style={{ width: `${jobs.redactar.progreso}%` }} /></div>
              <span className="sutil">{jobs.redactar.progreso}% · escribiendo…</span>
            </div>
          ) : (
            <>
              <p className="sutil">
                Cuesta una llamada al modelo por lead. Se saltan los que están en la lista de supresión.
              </p>
              <div className="acciones">
                <button className={mensajes > 0 ? "secundario" : "primario"}
                        disabled={conEmail === 0 || ocupado === "redactar"}
                        onClick={() => llamar("redactar", "encolar_redaccion", { p_campaign: id })}>
                  {ocupado === "redactar" ? "Encolando…" : mensajes > 0 ? "Escribir los que faltan" : "Escribir mensajes"}
                </button>
              </div>
              {conEmail === 0 && <p className="menudo">Antes hacen falta correos.</p>}
            </>
          )}
        </Paso>

        <Paso n={6} estado="futuro" titulo="Envía los correos"
              resumen="Todavía no está disponible.">
          <div className="caja-aviso">
            El envío automatizado no existe aún. Antes hace falta un dominio de
            correo configurado y una consulta legal — ver <code>docs/compliance.md</code>.
            <br />
            Lo que sí está listo: la lista de supresión y el enlace de baja que
            lleva cada mensaje.
          </div>
        </Paso>
      </div>

      <div className="tarjeta">
        <div className="fila-cabeza">
          <div>
            <h2>Landing de la campaña</h2>
            <p className="sutil">Opcional, y en paralelo: una página a la que llevar a quien reciba el correo.</p>
          </div>
          <button className="secundario" onClick={() => setSub("landing")}>Abrir</button>
        </div>
      </div>
    </div>
  );
}

function Paso({
  n, estado, titulo, resumen, insignia, children,
}: {
  n: number;
  estado: Estado;
  titulo: string;
  resumen: string;
  insignia?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`paso ${estado}`}>
      <div className="paso-carril">
        <div className="paso-numero">{estado === "hecho" ? "✓" : n}</div>
        <div className="paso-linea" />
      </div>
      <div className="paso-cuerpo">
        <div className="paso-titulo">
          <h3>{titulo}</h3>
          {insignia && <span className="etiqueta lista">{insignia}</span>}
          {estado === "actual" && <span className="etiqueta buscando">te toca</span>}
        </div>
        <p className="sutil">{resumen}</p>
        {estado !== "futuro" || n === 6 ? <div className="paso-detalle">{children}</div> : null}
      </div>
    </div>
  );
}
