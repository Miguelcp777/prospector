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
};

type Dia = {
  dia: string; altas: number; campanas: number; leads: number;
  enviados: number; tokens: number; demo: number; incidencias: number;
};

type FilaIncidencia = {
  id: string; tenant: string; origen: string; operacion: string | null;
  mensaje: string; estado: string; veces: number; ultima_en: string;
};

const num = (n: number) => n.toLocaleString("es-ES");

export function Panel() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [tenants, setTenants] = useState<FilaTenant[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);
  const [incidencias, setIncidencias] = useState<FilaIncidencia[]>([]);
  const [ventana, setVentana] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [r, t, a, i] = await Promise.all([
      supabase.rpc("panel_resumen"),
      supabase.rpc("panel_tenants"),
      supabase.rpc("panel_actividad", { p_dias: ventana }),
      supabase.rpc("panel_incidencias", { p_limite: 25 }),
    ]);
    if (r.error) setError(r.error.message);
    setResumen((r.data?.[0] ?? null) as Resumen | null);
    setTenants((t.data ?? []) as FilaTenant[]);
    setDias((a.data ?? []) as Dia[]);
    setIncidencias((i.data ?? []) as FilaIncidencia[]);
    setCargando(false);
  }, [ventana]);

  useEffect(() => { cargar(); }, [cargar]);

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

      {/* ---------------- clientes ---------------- */}
      <h2 className="titulo-seccion">Por cliente</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Plan</th><th>Usuarios</th><th>Campañas</th>
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
