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
import { Recursos } from "./Recursos";
import { Configuracion } from "./Configuracion";
import { estadoDe, PASOS, useRecorrido } from "../lib/recorrido";

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

export function Campana({ id, volver }: { id: string; volver: () => void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [sub, setSub] = useState<"segmentos" | "landing" | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [frenada, setFrenada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [topeMensajes, setTopeMensajes] = useState<number | null>(null);
  // Techo total de mensajes del modo demo, o null si está apagado. Es otro
  // límite distinto del de arriba: aquel es por tanda, este por campaña.
  const [topeDemo, setTopeDemo] = useState<number | null>(null);
  const { publicar } = useRecorrido();

  const cargar = useCallback(async () => {
    const [c, s, l, m, j, a] = await Promise.all([
      supabase.from("campaigns")
        .select("id, nombre, descripcion, ciudad, radio_km, estado, max_consultas, ultima_busqueda_en")
        .eq("id", id).single(),
      supabase.from("segments").select("id").eq("campaign_id", id).eq("aceptado", true),
      supabase.from("v_resumen_campana").select("leads, con_email").eq("campaign_id", id).maybeSingle(),
      supabase.from("messages").select("id, leads!inner(campaign_id)").eq("leads.campaign_id", id),
      supabase.from("jobs").select("tipo, estado, progreso, detalle")
        .eq("campaign_id", id).order("creado_en", { ascending: false }),
      supabase.from("ajustes")
        .select("max_mensajes_por_campana, modo_demo, max_mensajes_demo").limit(1),
    ]);

    if (c.error) { setError(c.error.message); setCargando(false); return; }

    // El último job de cada tipo: vienen ordenados por fecha descendente.
    const jobs: Record<string, Job> = {};
    for (const job of (j.data ?? []) as Job[]) if (!jobs[job.tipo]) jobs[job.tipo] = job;

    const ajustes = a.data?.[0] as {
      max_mensajes_por_campana: number;
      modo_demo: boolean;
      max_mensajes_demo: number;
    } | undefined;
    setTopeMensajes(ajustes?.max_mensajes_por_campana ?? null);
    setTopeDemo(ajustes?.modo_demo ? ajustes.max_mensajes_demo : null);

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
    setAviso(null);
    setOcupado(nombre);
    const { error: fallo } = await supabase.rpc(rpc, args);
    setOcupado(null);
    if (fallo) {
      setError(fallo.message);
      if (fallo.message.includes("en pausa")) setFrenada(true);
    }
    await cargar();
  }

  /**
   * Parar la búsqueda en marcha.
   *
   * Los leads encontrados hasta aquí no se tocan: están en la base desde que
   * se guardaron. Lo que hace `cancelar_job` (040) es cerrar el trabajo y
   * devolver la campaña a 'lista', que es lo que hace que esta pantalla pase
   * de la barra de progreso a la lista de lo conseguido.
   */
  async function cancelar() {
    setError(null);
    setAviso(null);
    setOcupado("cancelar");
    const { data, error: fallo } = await supabase.rpc("cancelar_job", {
      p_campaign: id,
      p_tipo: "descubrir",
    });
    setOcupado(null);
    if (fallo) setError(fallo.message);
    else {
      const paradas = typeof data === "number" ? data : 0;
      setAviso(
        `Búsqueda cancelada. Se quedaron ${paradas} búsquedas sin hacer; los leads encontrados hasta ahora se conservan.`,
      );
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

  return (
    <div className="panel">
      <Publicador nombre={campana.nombre} hechos={hechos} publicar={publicar} />

      <div className="cabecera">
        <div className="cabecera-texto">
          <button className="fantasma"
                  onClick={() => { publicar(null); volver(); }}
                  style={{ alignSelf: "flex-start", marginLeft: -10 }}>
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
      {aviso && <p className="caja-aviso">{aviso}</p>}

      <div className="campana-marco">
      <CarrilDePasos hechos={hechos} />

      <div className="pasos">
        <Paso n={1} estado={estadoDe(hechos, 0)} titulo={PASOS[0].nombre}
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

        <Paso n={2} estado={estadoDe(hechos, 1)} titulo={PASOS[1].nombre}
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

        <Paso n={3} estado={estadoDe(hechos, 2)} titulo={PASOS[2].nombre}
              resumen="Google Places, por segmento y zona."
              insignia={leads > 0 ? `${leads} leads` : undefined}>
          {buscando && jobs.descubrir ? (
            <>
              <Progreso job={jobs.descubrir} espera="Arrancando la búsqueda…" />
              <p className="sutil">
                {leads > 0
                  ? `${leads} leads encontrados hasta ahora.`
                  : "Todavía no ha llegado ningún lead."}
              </p>
              <div className="acciones">
                <button className="peligro" disabled={ocupado === "cancelar"}
                        onClick={cancelar}>
                  {ocupado === "cancelar" ? "Cancelando…" : "Cancelar la búsqueda"}
                </button>
              </div>
              <p className="menudo">
                Se para donde esté y te quedas con los leads encontrados hasta
                ese momento. La búsqueda que esté en vuelo termina y las que
                queden en cola no se hacen.
              </p>
            </>
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

        <Paso n={4} estado={estadoDe(hechos, 3)} titulo={PASOS[3].nombre}
              resumen="Entramos en la web de cada lead a buscar su buzón de contacto."
              insignia={conEmail > 0 ? `${conEmail} con email` : undefined}>
          {enriqueciendo && jobs.enriquecer ? (
            <Progreso job={jobs.enriquecer} espera="Arrancando…" enCurso="buscando correos…" />
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

        <Paso n={5} estado={estadoDe(hechos, 4)} titulo={PASOS[4].nombre}
              resumen="Un correo por lead, personalizado. Se guardan como borrador para que los leas antes."
              insignia={mensajes > 0 ? `${mensajes} escritos` : undefined}>
          {redactando && jobs.redactar ? (
            <Progreso job={jobs.redactar} espera="Arrancando…" enCurso="escribiendo…" />
          ) : (
            <>
              <p className="sutil">
                Se saltan los leads que están en la lista de supresión.
              </p>
              {/* El techo del modo demo manda sobre el de tanda, así que si
                  está puesto se enseña ese: decir "vuelve a pulsar" cuando
                  no va a escribir más es peor que no decir nada. */}
              {topeDemo !== null ? (
                <p className="caja-aviso">
                  Versión de prueba: {topeDemo} mensajes por campaña, en
                  total. Llevas {mensajes}.
                </p>
              ) : (
                topeMensajes !== null && conEmail > topeMensajes && (
                  <p className="caja-aviso">
                    Tope de {topeMensajes} mensajes por tanda mientras se está
                    probando. Se escriben los de mayor score primero; para el
                    resto, vuelve a pulsar.
                  </p>
                )
              )}
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

        <Paso n={6} estado="futuro" titulo={PASOS[5].nombre}
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

      <Configuracion campanaId={id} />

      <Recursos campanaId={id} />

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
    </div>
  );
}

/**
 * El recorrido de la campaña, pegado al lado.
 *
 * Los seis pasos están en la pantalla, uno debajo de otro, pero en cuanto se
 * despliega el segundo —los segmentos— el primero queda fuera de vista y no
 * hay forma de saber por dónde va uno sin subir a mirar. Este carril se
 * queda fijo y lo dice siempre.
 *
 * Cada paso lleva al suyo, pero **no se salta ninguno**: desplazar la
 * pantalla no es lo mismo que dar un atajo. El orden lo siguen imponiendo
 * los datos —sin segmentos no hay búsqueda, sin leads no hay correos— y
 * este carril solo mueve la mirada.
 */
function CarrilDePasos({ hechos }: { hechos: boolean[] }) {
  const hechosTotal = hechos.filter(Boolean).length;
  const actual = hechos.findIndex((h) => !h);

  return (
    <aside className="campana-carril" aria-label="Pasos de la campaña">
      <div className="campana-carril-cabeza">
        <span className="rotulo">El recorrido</span>
        <span className="menudo">{hechosTotal} de {PASOS.length} pasos</span>
        <div className="barra-progreso">
          <div style={{ width: `${(hechosTotal * 100) / PASOS.length}%` }} />
        </div>
      </div>

      <ol>
        {PASOS.map((p, i) => {
          const e = estadoDe(hechos, i);
          return (
            <li key={p.corto}>
              <button
                className={`campana-carril-paso ${e}`}
                aria-current={i === actual ? "step" : undefined}
                onClick={() => {
                  document.getElementById(`paso-${i + 1}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="campana-carril-marca">
                  {e === "hecho" ? "✓" : i + 1}
                </span>
                <span className="campana-carril-nombre">{p.nombre}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/**
 * La barra de un trabajo en marcha.
 *
 * Mientras el job está `pendiente` no hay nada que medir: las tareas existen
 * y todavía no las ha tocado nadie, así que un «0 %» quieto es lo único que
 * se puede pintar — y se lee como una campaña atascada. Hasta la 052 esa
 * espera podía durar un minuto entero, porque el trabajo no arrancaba hasta
 * que pasaba el cron; ahora son un par de segundos, pero siguen existiendo y
 * conviene decir lo que son.
 *
 * Por eso el estado en cola tiene su propia barra, que se mueve sola y no
 * promete un porcentaje. Una barra indeterminada dice «estoy en ello»; un
 * 0 % dice «no avanza».
 */
function Progreso({
  job, espera, enCurso,
}: {
  job: Job;
  espera: string;
  enCurso?: string;
}) {
  if (job.estado === "pendiente") {
    return (
      <div className="progreso">
        <div className="barra-progreso indeterminada"><div /></div>
        <span className="sutil">{espera}</span>
      </div>
    );
  }
  return (
    <div className="progreso">
      <div className="barra-progreso"><div style={{ width: `${job.progreso}%` }} /></div>
      <span className="sutil">{job.progreso}% · {enCurso ?? job.detalle}</span>
    </div>
  );
}

function Paso({
  n, estado, titulo, resumen, insignia, children,
}: {
  n: number;
  estado: "hecho" | "actual" | "futuro";
  titulo: string;
  resumen: string;
  insignia?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`paso ${estado}`} id={`paso-${n}`}>
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


/**
 * Publica el estado del recorrido al lateral.
 *
 * Va en su propio componente con una clave derivada de los datos: así el
 * efecto solo corre cuando el estado cambia de verdad, y no en cada
 * refresco del sondeo de los workers.
 */
function Publicador({
  nombre, hechos, publicar,
}: {
  nombre: string;
  hechos: boolean[];
  publicar: (r: { campana: string; hechos: boolean[] } | null) => void;
}) {
  const clave = nombre + "|" + hechos.map((h) => (h ? 1 : 0)).join("");
  useEffect(() => {
    publicar({ campana: nombre, hechos });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return null;
}
