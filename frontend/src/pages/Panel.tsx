// ============================================================
// Panel de administración.
//
// Lo que protege esto NO es que la sección esté escondida en el menú. La
// clave publicable viaja en el bundle y cualquiera puede llamar a las
// funciones desde la consola: quien decide es `es_admin()` dentro de cada
// `panel_*`, en la base. Esconder el menú es cortesía, no seguridad.
//
// Y lo que se enseña son agregados. Ni un nombre de lead, ni un correo de
// nadie: para controlar uso y gasto hacen falta números, y somos encargados
// del tratamiento de datos que no son nuestros. Ver docs/compliance.md.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ClavesDeModelo } from "./ClavesDeModelo";
import { ModoDemo } from "./ModoDemo";
import { PanelClientes } from "./PanelClientes";
import { PanelSalud } from "./PanelSalud";
import { PanelUsuarios } from "./PanelUsuarios";
import { CorreoDelServicio } from "./CorreoDelServicio";

type Resumen = {
  tenants: number; usuarios: number; admins: number;
  campanas: number; campanas_activas: number;
  leads: number; leads_con_email: number;
  mensajes_borrador: number; mensajes_enviados: number;
  respondidos: number; supresiones: number;
  incidencias_abiertas: number;
  places_mes: number; places_techo: number;
  tokens_entrada_mes: number; tokens_salida_mes: number;
  llamadas_modelo_mes: number;
  demo_usos_hoy: number; demo_usos_mes: number;
  coste_places: number; coste_modelo: number;
  moneda: string; tarifa_modelo_configurada: boolean;
};

type FilaTenant = {
  tenant_id: string; nombre: string; vertical: string; ciudad: string | null;
  plan: string; alta: string; usuarios: number; campanas: number; leads: number;
  enviados: number; places_mes: number; places_techo: number;
  tokens_mes: number; incidencias: number; ultimo_uso: string;
  modo_demo: boolean;
};

type Dia = {
  dia: string; altas: number; campanas: number; leads: number;
  enviados: number; tokens: number; demo: number; incidencias: number;
};

type Coste = {
  campaign_id: string; campana: string; cliente: string; estado: string; creada: string;
  leads: number; leads_email: number; mensajes: number; enviados: number;
  places_consultas: number; coste_places: number;
  tokens: number; llamadas_modelo: number; coste_modelo: number;
  coste_total: number; coste_por_lead: number | null;
  coste_por_lead_email: number | null; coste_por_mensaje: number | null;
  falta_tarifa: boolean; moneda: string;
};

type Economia = {
  campanas_con_gasto: number;
  coste_medio: number; coste_mediano: number; coste_maximo: number;
  leads_medios: number; leads_email_medios: number;
  coste_por_lead: number | null; coste_por_lead_email: number | null;
  coste_por_mensaje: number | null;
  gasto_places: number; gasto_modelo: number; pct_places: number; moneda: string;
};

type FilaIncidencia = {
  id: string; tenant: string; origen: string; operacion: string | null;
  mensaje: string; estado: string; veces: number; ultima_en: string;
};

const num = (n: number) => n.toLocaleString("es-ES");

/**
 * Importes con los decimales que hagan falta.
 *
 * Un coste por lead de 0,0026 redondeado a dos decimales es 0,00, y ahí se
 * pierde justo lo que se venía a mirar. Por debajo de un céntimo, cuatro
 * decimales.
 */
const din = (n: number | null | undefined, moneda: string) =>
  n === null || n === undefined
    ? "—"
    : `${n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2)} ${moneda}`;

type Seccion =
  | "resumen" | "salud" | "usuarios" | "clientes" | "costes"
  | "incidencias" | "ajustes";

/** El orden importa: primero si algo está roto, luego quién lo usa, luego
 *  cuánto cuesta. Lo de configurar va al final porque casi nunca se toca. */
const SECCIONES: { id: Seccion; nombre: string; icono: string }[] = [
  { id: "resumen",     nombre: "Resumen",     icono: "◉" },
  { id: "salud",       nombre: "Salud",       icono: "♥" },
  { id: "usuarios",    nombre: "Usuarios",    icono: "◐" },
  { id: "clientes",    nombre: "Clientes",    icono: "◈" },
  { id: "costes",      nombre: "Costes",      icono: "€" },
  { id: "incidencias", nombre: "Incidencias", icono: "⚠" },
  { id: "ajustes",     nombre: "Ajustes",     icono: "▤" },
];

export function Panel() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [tenants, setTenants] = useState<FilaTenant[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);
  const [incidencias, setIncidencias] = useState<FilaIncidencia[]>([]);
  const [costes, setCostes] = useState<Coste[]>([]);
  const [economia, setEconomia] = useState<Economia | null>(null);
  const [ventana, setVentana] = useState(30);
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [r, t, a, i, c, e] = await Promise.all([
      supabase.rpc("panel_resumen"),
      supabase.rpc("panel_tenants"),
      supabase.rpc("panel_actividad", { p_dias: ventana }),
      supabase.rpc("panel_incidencias", { p_limite: 25 }),
      supabase.rpc("panel_costes_campana", { p_limite: 100 }),
      supabase.rpc("panel_economia"),
    ]);
    if (r.error) setError(r.error.message);
    setResumen((r.data?.[0] ?? null) as Resumen | null);
    setTenants((t.data ?? []) as FilaTenant[]);
    setDias((a.data ?? []) as Dia[]);
    setIncidencias((i.data ?? []) as FilaIncidencia[]);
    setCostes((c.data ?? []) as Coste[]);
    setEconomia((e.data?.[0] ?? null) as Economia | null);
    setCargando(false);

  }, [ventana]);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Quitar o poner la versión de prueba a un cliente, desde la propia lista.
   *
   * También se puede en la ficha de abajo, pero ahí hay que elegir antes al
   * cliente en un desplegable, y eso convierte «quítale el límite a este»
   * en tres pasos y una búsqueda. Aquí es un clic en la fila que ya estás
   * mirando.
   *
   * Los demás parámetros van sin pasar a propósito: `panel_guardar_cliente`
   * deja como estaba todo lo que reciba nulo, así que esto no puede pisar
   * un plan ni un módulo que alguien esté cambiando a la vez.
   */
  async function cambiarPrueba(tenantId: string, enPrueba: boolean) {
    // Optimista: la tabla responde al clic y se corrige sola si falla.
    setTenants((ts) =>
      ts.map((t) => (t.tenant_id === tenantId ? { ...t, modo_demo: enPrueba } : t)));
    const { error: fallo } = await supabase.rpc("panel_guardar_cliente", {
      p_tenant: tenantId,
      p_modo_demo: enPrueba,
    });
    if (fallo) {
      setError(fallo.message);
      await cargar();
    }
  }

  if (cargando) return <div className="panel"><p className="sutil">Cargando…</p></div>;

  if (error) {
    return (
      <div className="panel">
        <p className="caja-error">{error}</p>
        <p className="sutil">
          Si dice «No autorizado», esta cuenta no está en la tabla de
          administradores. Se da de alta por SQL, a propósito.
        </p>
      </div>
    );
  }

  if (!resumen) return null;

  const placesPct = resumen.places_techo
    ? Math.round((resumen.places_mes / resumen.places_techo) * 100) : 0;
  const tokensTotal = resumen.tokens_entrada_mes + resumen.tokens_salida_mes;

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Administración</span>
          <h1>Panel de control</h1>
          <p className="sutil">
            Uso y gasto de todo el servicio. Son agregados: ni un lead ni un
            correo de ningún cliente aparece aquí.
          </p>
        </div>
      </div>

      {/* Secciones. Antes esto era una sola columna de dos mil píxeles y
          llegar a Incidencias eran seis rodadas de rueda. Cada sección se
          pinta sola: lo que no se mira, no se monta ni se consulta. */}
      <nav className="panel-secciones">
        {SECCIONES.map((s) => (
          <button key={s.id}
                  className={seccion === s.id ? "activa" : ""}
                  onClick={() => setSeccion(s.id)}>
            <span aria-hidden="true">{s.icono}</span>
            {s.nombre}
          </button>
        ))}
      </nav>

      {seccion === "resumen" && (<>
      {/* ---------------- gasto ---------------- */}
      <h2 className="titulo-seccion">Gasto del mes en curso</h2>
      <div className="rejilla-metricas">
        <Metrica
          rotulo="Google Places"
          valor={`${resumen.coste_places} ${resumen.moneda}`}
          pie={`${num(resumen.places_mes)} de ${num(resumen.places_techo)} consultas · ${placesPct}% del techo`}
          alerta={placesPct >= 80}
        />
        <Metrica
          rotulo="Modelo (Anthropic)"
          valor={resumen.tarifa_modelo_configurada
            ? `${resumen.coste_modelo} ${resumen.moneda}`
            : "sin tarifa"}
          pie={resumen.tarifa_modelo_configurada
            ? `${num(tokensTotal)} tokens · ${num(resumen.llamadas_modelo_mes)} llamadas`
            : `${num(tokensTotal)} tokens medidos · falta poner el precio`}
          alerta={!resumen.tarifa_modelo_configurada && tokensTotal > 0}
        />
        <Metrica
          rotulo="Demo pública"
          valor={num(resumen.demo_usos_mes)}
          pie={`${num(resumen.demo_usos_hoy)} hoy · cada uso es una llamada que pagas tú`}
        />
      </div>

      {!resumen.tarifa_modelo_configurada && (
        <p className="caja-aviso">
          El consumo de tokens está medido, pero no hay tarifa configurada, así
          que no se puede convertir a dinero. Ponla en <code>ajustes</code>
          (<code>precio_tokens_entrada_millon</code> y{" "}
          <code>precio_tokens_salida_millon</code>) con lo que diga tu factura.
          Preferimos no enseñar un importe inventado.
        </p>
      )}

      {/* ---------------- uso ---------------- */}
      <h2 className="titulo-seccion">Uso</h2>
      <div className="rejilla-metricas">
        <Metrica rotulo="Clientes" valor={num(resumen.tenants)}
                 pie={`${num(resumen.usuarios)} usuarios · ${num(resumen.admins)} admin`} />
        <Metrica rotulo="Campañas" valor={num(resumen.campanas)}
                 pie={`${num(resumen.campanas_activas)} en marcha`} />
        <Metrica rotulo="Leads" valor={num(resumen.leads)}
                 pie={`${num(resumen.leads_con_email)} con correo`} />
        <Metrica rotulo="Mensajes" valor={num(resumen.mensajes_enviados)}
                 pie={`enviados · ${num(resumen.mensajes_borrador)} en borrador`} />
        <Metrica rotulo="Respuestas" valor={num(resumen.respondidos)}
                 pie={resumen.mensajes_enviados
                   ? `${Math.round((resumen.respondidos / resumen.mensajes_enviados) * 100)}% de los enviados`
                   : "sin envíos todavía"} />
        <Metrica rotulo="Incidencias" valor={num(resumen.incidencias_abiertas)}
                 pie={`abiertas · ${num(resumen.supresiones)} bajas registradas`}
                 alerta={resumen.incidencias_abiertas > 0} />
      </div>

      {/* ---------------- actividad ---------------- */}
      <div className="fila-cabeza">
        <h2 className="titulo-seccion">Actividad diaria</h2>
        <select value={ventana} onChange={(e) => setVentana(Number(e.target.value))}>
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
        </select>
      </div>
      <Serie dias={dias} />
      <p className="menudo">
        Places no sale aquí: su consumo se agrega por mes y no hay dato diario.
        Repartirlo entre los días sería inventarlo.
      </p>

      </>)}

      {seccion === "salud" && <PanelSalud />}

      {seccion === "usuarios" && <PanelUsuarios />}

      {seccion === "clientes" && <PanelClientes />}

      {seccion === "ajustes" && (<>
        <h2 className="titulo-seccion">Uso del servicio</h2>
        <ModoDemo />
        <h2 className="titulo-seccion">Proveedores</h2>
        <CorreoDelServicio />
        <ClavesDeModelo />
      </>)}

      {seccion === "costes" && (<>
      {/* ---------------- unidad económica ---------------- */}
      <h2 className="titulo-seccion">Cuánto cuesta una campaña</h2>
      {economia && economia.campanas_con_gasto > 0 ? (
        <>
          <div className="rejilla-metricas">
            <Metrica
              rotulo="Coste mediano por campaña"
              valor={din(economia.coste_mediano, economia.moneda)}
              pie={`media ${din(economia.coste_medio, economia.moneda)} · máximo ${din(economia.coste_maximo, economia.moneda)} · ${economia.campanas_con_gasto} campañas con gasto`}
            />
            <Metrica
              rotulo="Coste por lead"
              valor={din(economia.coste_por_lead, economia.moneda)}
              pie={`${num(economia.leads_medios)} leads de media por campaña`}
            />
            <Metrica
              rotulo="Coste por lead con correo"
              valor={din(economia.coste_por_lead_email, economia.moneda)}
              pie={`${num(economia.leads_email_medios)} de media · son los contactables`}
            />
            <Metrica
              rotulo="Coste por mensaje redactado"
              valor={din(economia.coste_por_mensaje, economia.moneda)}
              pie="solo modelo: redactar no consulta Places"
            />
          </div>
          <p className="menudo">
            El gasto se reparte {economia.pct_places}% Places /{" "}
            {(100 - economia.pct_places).toFixed(1)}% modelo —{" "}
            {din(economia.gasto_places, economia.moneda)} y{" "}
            {din(economia.gasto_modelo, economia.moneda)}. Los «por unidad» son
            agregados, no medias de medias: una campaña de tres leads no debe
            pesar lo mismo que una de novecientos.
          </p>
        </>
      ) : (
        <p className="sutil">
          Todavía no hay campañas con gasto imputado. El de Places se calcula
          desde el primer descubrimiento; el del modelo, desde que se desplegó
          la medición por campaña.
        </p>
      )}

      <h2 className="titulo-seccion">Coste campaña a campaña</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Campaña</th><th>Cliente</th><th>Leads</th><th>Con correo</th>
              <th>Mensajes</th><th>Places</th><th>Modelo</th><th>Total</th>
              <th>Por lead</th><th>Por lead útil</th>
            </tr>
          </thead>
          <tbody>
            {costes.map((c) => (
              <tr key={c.campaign_id}>
                <td>
                  <strong>{c.campana}</strong>
                  <div className="menudo">{c.estado} · {c.creada}</div>
                </td>
                <td className="sutil">{c.cliente}</td>
                <td>{num(c.leads)}</td>
                <td>{num(c.leads_email)}</td>
                <td>{num(c.mensajes)}</td>
                <td>
                  {din(c.coste_places, c.moneda)}
                  <div className="menudo">{num(c.places_consultas)} consultas</div>
                </td>
                <td>
                  {din(c.coste_modelo, c.moneda)}
                  <div className="menudo">{num(c.tokens)} tokens</div>
                  {c.falta_tarifa && (
                    <div className="cifra-alerta menudo">falta tarifa del modelo</div>
                  )}
                </td>
                <td><strong>{din(c.coste_total, c.moneda)}</strong></td>
                <td>{din(c.coste_por_lead, c.moneda)}</td>
                <td>{din(c.coste_por_lead_email, c.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="menudo">
        Places se cuenta por consulta pedida, no por lead obtenido: cobra igual
        aunque vuelva vacía. El modelo solo cuenta desde que existe la medición
        por campaña, así que las campañas anteriores enseñan su gasto de Places
        completo y el de modelo a cero.
      </p>

      </>)}

      {seccion === "clientes" && (<>
      {/* ---------------- clientes ---------------- */}
      <h2 className="titulo-seccion">Por cliente</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Versión de prueba</th><th>Plan</th>
              <th>Usuarios</th><th>Campañas</th>
              <th>Leads</th><th>Enviados</th><th>Places (mes)</th>
              <th>Tokens (mes)</th><th>Inc.</th><th>Último uso</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.tenant_id}>
                <td>
                  <strong>{t.nombre}</strong>
                  <div className="menudo">{t.vertical}{t.ciudad ? ` · ${t.ciudad}` : ""}</div>
                </td>
                <td>
                  {/* Marcado = limitado. Quitar la marca es lo que se hace
                      el día que el cliente empieza a pagar. */}
                  <label className="celda-interruptor" title={
                    t.modo_demo
                      ? "Limitado. Quita la marca para que use la app entera."
                      : "Sin límites."
                  }>
                    <input type="checkbox" checked={t.modo_demo}
                           onChange={(e) => void cambiarPrueba(t.tenant_id, e.target.checked)} />
                    <span className={t.modo_demo ? "etiqueta buscando" : "etiqueta lista"}>
                      {t.modo_demo ? "limitado" : "completo"}
                    </span>
                  </label>
                </td>
                <td><span className="etiqueta">{t.plan}</span></td>
                <td>{num(t.usuarios)}</td>
                <td>{num(t.campanas)}</td>
                <td>{num(t.leads)}</td>
                <td>{num(t.enviados)}</td>
                <td className={t.places_techo && t.places_mes / t.places_techo >= 0.8 ? "cifra-alerta" : ""}>
                  {num(t.places_mes)} / {num(t.places_techo)}
                </td>
                <td>{num(t.tokens_mes)}</td>
                <td className={t.incidencias ? "cifra-alerta" : ""}>{t.incidencias}</td>
                <td className="sutil">
                  {new Date(t.ultimo_uso).toLocaleDateString("es-ES")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>)}

      {seccion === "incidencias" && (<>
      {/* ---------------- incidencias de todos ---------------- */}
      <h2 className="titulo-seccion">Incidencias de todos los clientes</h2>
      {incidencias.length === 0 ? (
        <p className="sutil">Ninguna registrada.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Dónde</th><th>Qué</th>
                <th>Veces</th><th>Estado</th><th>Última</th>
              </tr>
            </thead>
            <tbody>
              {incidencias.map((i) => (
                <tr key={i.id}>
                  <td>{i.tenant}</td>
                  <td className="menudo">{i.operacion ?? i.origen}</td>
                  <td className="sutil">{i.mensaje.slice(0, 90)}</td>
                  <td>{i.veces}</td>
                  <td>
                    <span className={`etiqueta ${i.estado === "abierta" ? "" : "lista"}`}>
                      {i.estado}
                    </span>
                  </td>
                  <td className="sutil">
                    {new Date(i.ultima_en).toLocaleDateString("es-ES")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}
    </div>
  );
}

function Metrica({
  rotulo, valor, pie, alerta,
}: { rotulo: string; valor: string; pie: string; alerta?: boolean }) {
  return (
    <div className={`metrica${alerta ? " metrica-alerta" : ""}`}>
      <span className="metrica-rotulo">{rotulo}</span>
      <strong className="metrica-valor">{valor}</strong>
      <span className="menudo">{pie}</span>
    </div>
  );
}

/**
 * Barras en CSS, sin librería de gráficos.
 *
 * Son cuatro series y treinta días: una dependencia de 100 KB para esto es
 * peso que paga cada visita de todo el mundo, admin o no.
 */
/** Todo lo de un día menos la propia fecha: es lo que se puede graficar. */
type Medible = keyof Omit<Dia, "dia">;

function Serie({ dias }: { dias: Dia[] }) {
  const [metrica, setMetrica] = useState<Medible>("leads");
  const ETIQUETAS: Record<Medible, string> = {
    altas: "Altas de usuario", campanas: "Campañas creadas", leads: "Leads capturados",
    enviados: "Mensajes enviados", tokens: "Tokens del modelo",
    demo: "Usos de la demo", incidencias: "Incidencias",
  };

  const tope = Math.max(...dias.map((d) => Number(d[metrica]) || 0), 1);
  const total = dias.reduce((s, d) => s + (Number(d[metrica]) || 0), 0);

  return (
    <div className="tarjeta">
      <div className="rejilla">
        <select value={metrica} onChange={(e) => setMetrica(e.target.value as Medible)}>
          {(Object.keys(ETIQUETAS) as Medible[]).map((k) => (
            <option key={k} value={k}>{ETIQUETAS[k]}</option>
          ))}
        </select>
      </div>
      <p className="menudo">{num(total)} en total · máximo diario {num(tope)}</p>
      <div className="barras">
        {dias.map((d) => {
          const v = Number(d[metrica]) || 0;
          return (
            <div key={d.dia} className="barra-hueco"
                 title={`${new Date(d.dia).toLocaleDateString("es-ES")}: ${num(v)}`}>
              <div className="barra" style={{ height: `${Math.max((v / tope) * 100, v ? 3 : 0)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="barras-pie menudo">
        <span>{dias[0] && new Date(dias[0].dia).toLocaleDateString("es-ES")}</span>
        <span>hoy</span>
      </div>
    </div>
  );
}
