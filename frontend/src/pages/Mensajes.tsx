// ============================================================
// Mensajes redactados.
//
// Todos nacen en 'borrador' y aquí se leen y se corrigen antes de que
// exista ningún envío. Esa revisión no es un trámite: el modelo escribe
// bien casi siempre, y el "casi" es lo que llega al buzón de un desconocido
// con el nombre de tu cliente encima.
//
// EL PIE NO SE EDITA. Lleva la identificación del remitente y el enlace de
// baja con el token de ESTE mensaje, que son los dos requisitos legales de
// compliance.md. Se separa del cuerpo al abrir y se vuelve a pegar al
// guardar, así que no hay forma de romperlo escribiendo — igual que no la
// hay de saltarse la lista de supresión, que lo impide un trigger.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { aplicarPlantilla, type Resultado } from "../lib/aplicar-plantilla";
import {
  ID_PLANTILLA_POR_DEFECTO,
  NOMBRE_PLANTILLA_POR_DEFECTO,
} from "../lib/plantilla-por-defecto";
import { invocar } from "../lib/edge";

const TOPE = 200;
const SEPARADOR = "\n—\n";

type Campana = { id: string; nombre: string; ciudad: string };

type Mensaje = {
  id: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  creado_en: string;
  /** El diseño aplicado, si lo hay. Es lo que verá el destinatario. */
  html: string | null;
  plantillas: { nombre: string } | null;
  leads: { nombre: string; email: string | null; fuente: string } | null;
};

/**
 * De dónde salió el destinatario. Son dos grupos con marco legal distinto
 * —correo en frío frente a cartera que aporta el propio cliente— y desde el
 * volcado de listas una misma campaña puede tener los dos mezclados, así que
 * el filtro de campaña ya no los separa.
 *
 * `'lista'` es el único valor que escribe la importación; todo lo demás
 * —hoy `'places'`— es prospección. Se compara así, y no con `= 'places'`,
 * para que una fuente nueva no se caiga de los dos filtros sin avisar.
 */
type Procedencia = "" | "lista" | "prospeccion";

/**
 * `alIrA` lleva a Plantillas desde el estado vacío. Se tipa solo con
 * "studio" en vez de importar `Vista` de App: es el único destino que
 * necesita esta pantalla y evita el import circular.
 */
export function Mensajes({ alIrA }: { alIrA?: (vista: "studio") => void }) {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [elegida, setElegida] = useState("");     // "" = todas
  const [procedencia, setProcedencia] = useState<Procedencia>(""); // "" = ambas
  const [busqueda, setBusqueda] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type PlantillaFila = { id: string; nombre: string; respetar_diseno: boolean };
  const [plantillas, setPlantillas] = useState<PlantillaFila[]>([]);
  // Preseleccionada la de por defecto: vestir un correo es lo normal, y
  // hasta ahora el caso normal exigía diseñar algo antes en el studio.
  const [plantillaElegida, setPlantillaElegida] = useState(ID_PLANTILLA_POR_DEFECTO);
  const [falloPlantillas, setFalloPlantillas] = useState<string | null>(null);
  const [vistiendo, setVistiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, nombre, ciudad")
      .order("creado_en", { ascending: false })
      .then(({ data }) => setCampanas((data ?? []) as Campana[]));

    // El fallo se guarda aparte: sin esto, no poder leer las plantillas se
    // ve exactamente igual que no tener ninguna, y son dos problemas
    // distintos con dos arreglos distintos.
    supabase.from("plantillas").select("id, nombre, respetar_diseno")
      .neq("estado", "archivada")
      .order("actualizado_en", { ascending: false })
      .then(({ data, error: fallo }) => {
        if (fallo) setFalloPlantillas(fallo.message);
        setPlantillas((data ?? []) as PlantillaFila[]);
      });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    let q = supabase
      .from("messages")
      .select("id, asunto, cuerpo, estado, creado_en, html, plantillas(nombre), leads!inner(nombre, email, fuente, campaign_id)")
      .order("creado_en", { ascending: false })
      .limit(TOPE);

    if (elegida) q = q.eq("leads.campaign_id", elegida);

    // El filtro va en la consulta y no sobre lo ya cargado: con el tope de
    // 200 por carga, filtrar en el navegador enseñaría "los de tu lista que
    // había entre los 200 últimos", que es una cifra que no significa nada.
    if (procedencia === "lista") q = q.eq("leads.fuente", "lista");
    if (procedencia === "prospeccion") q = q.neq("leads.fuente", "lista");

    const { data, error: fallo } = await q;
    if (fallo) setError(fallo.message);
    else setMensajes((data ?? []) as unknown as Mensaje[]);
    setCargando(false);
  }, [elegida, procedencia]);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Marcar a mano lo que ya se ha mandado por fuera.
   *
   * El envío automático no existe todavía, así que hoy los correos se mandan
   * desde el buzón propio. Sin esta acción el historial nace vacío y no hay
   * forma de saber a quién se ha escrito.
   *
   * La base sigue mandando: si la dirección está suprimida o el cuerpo perdió
   * su enlace de baja, el UPDATE falla y aquí se ve el porqué.
   */
  async function marcarEnviado(id: string) {
    setError(null);
    const { error: fallo } = await supabase
      .from("messages")
      .update({ estado: "enviado", enviado_en: new Date().toISOString() })
      .eq("id", id);
    if (fallo) { setError(fallo.message); return; }
    await cargar();
  }

  /**
   * Vestir los borradores de la campaña con una plantilla del studio.
   *
   * Solo con una campaña elegida: aplicar un diseño a "todas" mezclaría
   * clientes distintos y estilos que no tienen nada que ver entre sí.
   */
  /**
   * Declara que el copy de una plantilla es propio y no relleno de catálogo.
   *
   * Va en la plantilla y no en la campaña: lo que se afirma es sobre el
   * diseño —"esto lo he leído y es mío"—, y aplicarlo a diez campañas no lo
   * vuelve menos cierto. Ver migración 037.
   */
  async function cambiarRespetar(valor: boolean) {
    if (!plantillaElegida) return;
    setError(null);
    const { error: fallo } = await supabase
      .from("plantillas")
      .update({ respetar_diseno: valor })
      .eq("id", plantillaElegida);
    if (fallo) { setError(fallo.message); return; }
    setPlantillas((ps) =>
      ps.map((p) => (p.id === plantillaElegida ? { ...p, respetar_diseno: valor } : p)));
  }

  async function vestir() {
    if (!elegida || !plantillaElegida) return;
    setError(null);
    setResultado(null);
    setVistiendo(true);
    try {
      setResultado(await aplicarPlantilla(elegida, plantillaElegida));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar la plantilla");
    } finally {
      setVistiendo(false);
    }
  }

  async function guardar(id: string, asunto: string, cuerpo: string, pie: string) {
    setError(null);
    // El pie vuelve tal cual salió. Si el mensaje no tenía separador,
    // guardamos lo que haya y el trigger avisará al intentar enviarlo.
    const { error: fallo } = await supabase
      .from("messages")
      .update({ asunto: asunto.trim(), cuerpo: cuerpo.trim() + (pie ? SEPARADOR + pie : "") })
      .eq("id", id);
    if (fallo) { setError(fallo.message); return false; }
    await cargar();
    return true;
  }

  const visibles = mensajes.filter((m) => {
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    return (m.asunto ?? "").toLowerCase().includes(t)
        || (m.leads?.nombre ?? "").toLowerCase().includes(t)
        || (m.leads?.email ?? "").toLowerCase().includes(t);
  });

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Borradores</span>
          <h1>Mensajes</h1>
          <p className="sutil">
            Léelos y corrígelos antes de mandarlos: lo que salga de aquí lleva
            el nombre de tu negocio. El envío automático no existe todavía, así
            que mándalos desde tu buzón y márcalos aquí — es lo que alimenta el
            historial de contacto.
          </p>
        </div>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <div className="rejilla">
        <select value={elegida} onChange={(e) => setElegida(e.target.value)}>
          <option value="">Todas las campañas</option>
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre} · {c.ciudad}</option>
          ))}
        </select>
        <select value={procedencia}
                onChange={(e) => setProcedencia(e.target.value as Procedencia)}>
          <option value="">Prospección y mis listas</option>
          <option value="prospeccion">Solo leads de prospección</option>
          <option value="lista">Solo mis listas de clientes</option>
        </select>
        <input placeholder="Buscar por asunto, negocio o correo"
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {/* Que quede dicho aquí y no solo en la spec: esto acota lo que ves.
          Mientras el envío sea manual eso ES elegir a quién escribes, pero
          no autoriza ni frena nada, y prometerlo sería peor que no tenerlo. */}
      <p className="menudo">
        Acota lo que ves y sobre lo que actúas. No autoriza ni frena ningún
        envío: hoy los correos salen de tu buzón, uno a uno.
      </p>

      {/* Aparece solo con una campaña elegida: el diseño se aplica a una
          campaña, no a mensajes sueltos de varias. */}
      {/* Sin plantillas la sección no se dibujaba, y una función que no
          existe no se puede pedir: el usuario no ve un botón desactivado ni
          un aviso, ve que la opción no está. Cada cliente empieza con cero
          plantillas, así que esto le pasa a todo el mundo el primer día. */}
      {elegida && (
        <div className="tarjeta">
          <div>
            <h2>Aplicar un diseño</h2>
            <p className="sutil">
              El texto de cada mensaje —el que escribió el modelo para ese
              lead— entra dentro de la plantilla que elijas. Solo se visten
              los borradores: lo ya enviado no se toca.
            </p>
          </div>

          {falloPlantillas && (
            <p className="caja-error">
              No se han podido leer tus plantillas: {falloPlantillas}. La de
              por defecto sigue disponible, porque no sale de la base.
            </p>
          )}

          <div className="rejilla">
            <select value={plantillaElegida}
                    onChange={(e) => setPlantillaElegida(e.target.value)}>
              <option value={ID_PLANTILLA_POR_DEFECTO}>
                {NOMBRE_PLANTILLA_POR_DEFECTO}
              </option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button className="primario" onClick={vestir}
                    disabled={!plantillaElegida || vistiendo}>
              {vistiendo ? "Aplicando…" : "Aplicar a esta campaña"}
            </button>
          </div>

          {plantillaElegida === ID_PLANTILLA_POR_DEFECTO && (
            <p className="menudo">
              Cabecera con el logo de la campaña —si lo has subido en
              Recursos—, el texto del correo, el botón a la landing cuando
              esté publicada, y el pie con la identificación y el enlace de
              baja. Sin copy de catálogo, así que no hay nada que revisar
              antes de aplicarla.
            </p>
          )}

          {/* Por defecto se asume catálogo, y el catálogo trae copy de
              muestra que no va dirigido a nadie. Encender esto es afirmar
              lo contrario, así que el aviso dice qué se está afirmando.
              No aplica a la de por defecto: ahí no hay relleno que filtrar. */}
          {plantillaElegida && plantillaElegida !== ID_PLANTILLA_POR_DEFECTO && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={
                  plantillas.find((p) => p.id === plantillaElegida)
                    ?.respetar_diseno ?? false
                }
                onChange={(e) => void cambiarRespetar(e.target.checked)}
              />
              <span>
                <strong>Respetar el diseño tal cual</strong>
                <small>
                  Conserva todos los bloques y el titular como los guardaste.
                  Enciéndelo solo si has revisado el texto: las plantillas
                  del catálogo traen copy de muestra —«Hola María», el pie de
                  otra empresa— y con esto activado sale tal cual al lead.
                </small>
              </span>
            </label>
          )}

          {resultado && (
            <>
              <p className="caja-aviso">
                {resultado.vestidos} mensaje{resultado.vestidos === 1 ? "" : "s"} con
                diseño
                {resultado.saltados > 0 && ` · ${resultado.saltados} sin tocar`}
              </p>
              {resultado.bloquesQuitados.length > 0 && (
                <p className="menudo">
                  Se han quitado del diseño estos bloques por traer texto que
                  no es de este lead: <strong>
                    {resultado.bloquesQuitados.join(", ")}
                  </strong>. Si ese texto lo escribiste tú, marca «Respetar
                  el diseño tal cual» y vuelve a aplicar.
                </p>
              )}
              {resultado.motivos.length > 0 && (
                <ul className="pasos-arreglo">
                  {resultado.motivos.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {cargando && <p className="sutil">Cargando…</p>}

      {!cargando && mensajes.length === 0 && (
        <div className="tarjeta">
          {/* «No hay de este grupo» no es «no hay mensajes». Decir lo segundo
              con un filtro puesto manda a buscar un problema que no existe. */}
          <h2>
            {procedencia === "lista" ? "No hay mensajes a tus listas"
              : procedencia === "prospeccion" ? "No hay mensajes a leads de prospección"
              : "No hay mensajes"}
          </h2>
          <p className="sutil">
            {procedencia === ""
              ? "Se generan en el paso 5 del recorrido de una campaña, y solo para leads con correo que no estén en la lista de supresión."
              : procedencia === "lista"
              ? "Los contactos que subes en Listas se escriben cuando los añades a una campaña y generas sus mensajes en el paso 5."
              : "Se generan en el paso 5 del recorrido de una campaña, para los leads que encuentra la búsqueda."}
          </p>
        </div>
      )}

      {!cargando && mensajes.length > 0 && (
        <>
          <p className="sutil">
            {visibles.length} de {mensajes.length}
            {mensajes.length === TOPE && ` · tope de ${TOPE} por carga`}
          </p>

          <div className="lista">
            {visibles.map((m) => (
              <Tarjeta
                key={m.id}
                m={m}
                abierto={abierto === m.id}
                alAbrir={() => setAbierto(abierto === m.id ? null : m.id)}
                alGuardar={guardar}
                alEnviar={marcarEnviado}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({
  m, abierto, alAbrir, alGuardar, alEnviar,
}: {
  m: Mensaje;
  abierto: boolean;
  alAbrir: () => void;
  alGuardar: (id: string, asunto: string, cuerpo: string, pie: string) => Promise<boolean>;
  alEnviar: (id: string) => Promise<void>;
}) {
  // El pie se separa aquí: lo que se edita es solo lo de arriba.
  const corte = m.cuerpo.indexOf(SEPARADOR);
  const cuerpoOriginal = corte === -1 ? m.cuerpo : m.cuerpo.slice(0, corte);
  const pie = corte === -1 ? "" : m.cuerpo.slice(corte + SEPARADOR.length);

  const [asunto, setAsunto] = useState(m.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(cuerpoOriginal);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  // Con diseño aplicado se abre en él: es lo que verá el destinatario.
  const [pestana, setPestana] = useState<"diseno" | "texto">(m.html ? "diseno" : "texto");
  const [ancho, setAncho] = useState<"escritorio" | "movil">("escritorio");

  const cambiado = asunto !== (m.asunto ?? "") || cuerpo !== cuerpoOriginal;

  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [falloPrueba, setFalloPrueba] = useState<string | null>(null);

  /**
   * Manda este mensaje a tu propia dirección, para verlo en una bandeja de
   * verdad. La dirección la pone la función a partir del token: aquí no se
   * envía ningún destinatario, ni se puede.
   */
  async function enviarPrueba() {
    setFalloPrueba(null);
    setPrueba(null);
    setProbando(true);
    const { datos, error: fallo } = await invocar<{
      enviado_a: string;
      con_diseno: boolean;
    }>("enviar-prueba", { message_id: m.id }, "envio de prueba");
    setProbando(false);
    if (fallo || !datos) {
      setFalloPrueba(fallo ?? "No se pudo enviar la prueba");
      return;
    }
    setPrueba(
      `Enviado a ${datos.enviado_a}` +
        (datos.con_diseno ? " con el diseño aplicado." : ", en texto plano."),
    );
  }

  return (
    <article className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <strong style={{ fontSize: "0.9375rem" }}>{m.asunto ?? "(sin asunto)"}</strong>
          <div className="menudo">
            Para {m.leads?.nombre ?? "—"}
            {m.leads?.email && ` · ${m.leads.email}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* De dónde salió el destinatario. Se enseña siempre, también con
              el filtro en «ambas»: es ahí donde hace falta distinguirlos. */}
          <span className={`etiqueta ${m.leads?.fuente === "lista" ? "alta" : ""}`}>
            {m.leads?.fuente === "lista" ? "de tu lista" : "prospección"}
          </span>
          {m.html && <span className="etiqueta lista">con diseño</span>}
          <span className={`etiqueta ${m.estado}`}>{m.estado}</span>
        </div>
      </div>

      {!abierto && (
        <p className="sutil">{cuerpoOriginal.split("\n")[0].slice(0, 130)}…</p>
      )}

      {abierto && m.html && (
        <div className="previo">
          <div className="previo-barra">
            <div className="previo-pestanas">
              <button className={pestana === "diseno" ? "activa" : ""}
                      onClick={() => setPestana("diseno")}>
                Diseño{m.plantillas?.nombre ? ` · ${m.plantillas.nombre}` : ""}
              </button>
              <button className={pestana === "texto" ? "activa" : ""}
                      onClick={() => setPestana("texto")}>
                Texto plano
              </button>
            </div>
            {pestana === "diseno" && (
              <div className="previo-pestanas">
                <button className={ancho === "escritorio" ? "activa" : ""}
                        onClick={() => setAncho("escritorio")}>Escritorio</button>
                <button className={ancho === "movil" ? "activa" : ""}
                        onClick={() => setAncho("movil")}>Móvil</button>
              </div>
            )}
          </div>

          {pestana === "diseno" ? (
            /* En un iframe con sandbox, nunca inyectado en el DOM de la app.
               Este HTML lo compone un modelo y lleva dentro nombres de
               negocios traídos de Google Places: es contenido que no
               controlamos. Metido en la página sería una vía de inyección;
               aquí no puede ejecutar scripts, ni leer la sesión, ni navegar
               a ningún sitio. */
            <iframe
              className="previo-marco"
              style={{ width: ancho === "movil" ? 380 : "100%" }}
              srcDoc={m.html}
              sandbox=""
              title={`Vista previa del correo a ${m.leads?.nombre ?? ""}`}
            />
          ) : (
            <pre className="cuerpo">{m.cuerpo}</pre>
          )}

          <p className="menudo">
            Así lo verá quien lo reciba. El texto plano se manda igualmente
            como alternativa, para quien tenga el HTML desactivado.
          </p>
        </div>
      )}

      {abierto && (
        <>
          <label className="campo">
            <span>Asunto</span>
            <input value={asunto} onChange={(e) => { setAsunto(e.target.value); setGuardado(false); }} />
          </label>

          <label className="campo">
            <span>Cuerpo</span>
            <textarea rows={8} value={cuerpo}
                      onChange={(e) => { setCuerpo(e.target.value); setGuardado(false); }} />
          </label>

          {pie && (
            <div>
              <p className="menudo" style={{ marginBottom: 6 }}>
                Pie fijo — no se edita. Lleva la identificación del remitente y
                el enlace de baja de este mensaje, que son obligatorios en todo
                envío comercial.
              </p>
              <pre className="cuerpo" style={{ fontSize: "0.8125rem" }}>{pie}</pre>
            </div>
          )}

          {!pie && (
            <p className="caja-aviso">
              Este mensaje no tiene pie con enlace de baja. Tal cual está, la
              base de datos rechazará enviarlo.
            </p>
          )}

          <div className="acciones">
            <button className="primario" disabled={!cambiado || guardando}
                    onClick={async () => {
                      setGuardando(true);
                      const ok = await alGuardar(m.id, asunto, cuerpo, pie);
                      setGuardando(false);
                      setGuardado(ok);
                    }}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            {cambiado && (
              <button className="secundario"
                      onClick={() => { setAsunto(m.asunto ?? ""); setCuerpo(cuerpoOriginal); setGuardado(false); }}>
                Descartar
              </button>
            )}
            <button className="fantasma" onClick={alAbrir}>Plegar</button>
            {/* A tu propio correo, nunca al lead: el destinatario lo pone la
                Edge Function desde el token. Sirve para ver el diseño en una
                bandeja real antes de que exista el envío de verdad. */}
            <button className="secundario" onClick={enviarPrueba} disabled={probando}
                    title="Envía este mensaje a tu dirección para verlo en tu bandeja">
              {probando ? "Enviando…" : "Enviar prueba a mi correo"}
            </button>
            {guardado && <span className="etiqueta lista">guardado</span>}
            {m.estado === "borrador" && (
              <button className="secundario" style={{ marginLeft: "auto" }}
                      onClick={() => alEnviar(m.id)}>
                Ya lo he enviado
              </button>
            )}
          </div>

          {prueba && <p className="caja-aviso">{prueba}</p>}
          {falloPrueba && <p className="caja-error">{falloPrueba}</p>}
        </>
      )}

      {!abierto && (
        <div className="acciones">
          <button className="secundario" onClick={alAbrir}>Leer y editar</button>
        </div>
      )}
    </article>
  );
}
