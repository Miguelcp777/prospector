// ============================================================
// Panel · Usuarios
//
// La lista de todos los usuarios con sus permisos, módulos y fechas, y al
// pinchar en uno, el cuadro de su cliente: actividad día a día y sus
// registros de fallo.
//
// Lo que NO hay, y conviene decirlo en vez de enseñar un cero: tráfico de
// datos. No se miden bytes en ninguna parte, y ponerlo a cero sería peor
// que no ponerlo. Lo más parecido que sí se mide son las operaciones que
// cuestan dinero —tokens del modelo, consultas a Places— y los objetos
// creados, que es lo que hay en la serie.
//
// Los días de conexión salen de `auth.sessions`, que Supabase va limpiando:
// es "cuándo se ha conectado últimamente", no un histórico completo. El
// registro de auditoría de auth está vacío en este proyecto.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Usuario = {
  usuario_id: string; email: string; rol: string; es_admin: boolean;
  tenant_id: string; cliente: string; vertical: string; plan: string;
  modulo_prospeccion: boolean; modulo_email: boolean;
  alta: string; ultima_conexion: string | null; correo_confirmado: boolean;
  dias_sin_entrar: number | null; sesiones_abiertas: number;
};

type Dia = {
  dia: string; campanas: number; leads: number; mensajes: number;
  enviados: number; tokens: number; incidencias: number; conexiones: number;
};

type Log = {
  cuando: string; origen: string; componente: string;
  mensaje: string; veces: number;
};

const METRICAS: { k: keyof Omit<Dia, "dia">; n: string }[] = [
  { k: "conexiones", n: "Días con conexión" },
  { k: "campanas",   n: "Campañas creadas" },
  { k: "leads",      n: "Leads capturados" },
  { k: "mensajes",   n: "Mensajes redactados" },
  { k: "enviados",   n: "Mensajes enviados" },
  { k: "tokens",     n: "Tokens del modelo" },
  { k: "incidencias", n: "Incidencias" },
];

const num = (n: number) => new Intl.NumberFormat("es-ES").format(n ?? 0);
const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-ES") : "—";

export function PanelUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [abierto, setAbierto] = useState<Usuario | null>(null);
  const [dias, setDias] = useState<Dia[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [ventana, setVentana] = useState(30);
  const [metrica, setMetrica] = useState<keyof Omit<Dia, "dia">>("conexiones");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("panel_usuarios").then(({ data, error: fallo }) => {
      if (fallo) { setError(fallo.message); return; }
      setUsuarios((data ?? []) as Usuario[]);
    });
  }, []);

  const cargarCliente = useCallback(async (u: Usuario, d: number) => {
    const [a, l] = await Promise.all([
      supabase.rpc("panel_actividad_cliente", { p_tenant: u.tenant_id, p_dias: d }),
      supabase.rpc("panel_logs_cliente", { p_tenant: u.tenant_id, p_limite: 40 }),
    ]);
    if (a.error) { setError(a.error.message); return; }
    setDias((a.data ?? []) as Dia[]);
    setLogs((l.data ?? []) as Log[]);
  }, []);

  function abrir(u: Usuario) {
    setAbierto(u);
    setDias([]); setLogs([]); setError(null);
    void cargarCliente(u, ventana);
  }

  function cambiarVentana(d: number) {
    setVentana(d);
    if (abierto) void cargarCliente(abierto, d);
  }

  // ---------------- detalle de un usuario ----------------
  if (abierto) {
    const tope = Math.max(...dias.map((d) => Number(d[metrica]) || 0), 1);
    const total = dias.reduce((s, d) => s + (Number(d[metrica]) || 0), 0);

    return (
      <>
        <div className="tarjeta">
          <div className="fila-cabeza">
            <div>
              <span className="rotulo">{abierto.cliente}</span>
              <h2>{abierto.email}</h2>
            </div>
            <button className="secundario" onClick={() => setAbierto(null)}>
              ← Volver a la lista
            </button>
          </div>

          <dl className="datos">
            <dt>Rol</dt>
            <dd>
              {abierto.rol}
              {abierto.es_admin && <span className="etiqueta media"> admin</span>}
            </dd>
            <dt>Plan</dt><dd>{abierto.plan}</dd>
            <dt>Módulos</dt>
            <dd>
              {[abierto.modulo_prospeccion && "Prospección",
                abierto.modulo_email && "Email marketing"]
                .filter(Boolean).join(" · ") || "ninguno"}
            </dd>
            <dt>Alta</dt><dd>{fecha(abierto.alta)}</dd>
            <dt>Última conexión</dt>
            <dd>
              {fecha(abierto.ultima_conexion)}
              {abierto.dias_sin_entrar !== null &&
                ` · hace ${abierto.dias_sin_entrar} día(s)`}
            </dd>
            <dt>Sesiones abiertas</dt><dd>{abierto.sesiones_abiertas}</dd>
            <dt>Correo confirmado</dt>
            <dd>{abierto.correo_confirmado ? "sí" : "no"}</dd>
          </dl>
        </div>

        <div className="tarjeta">
          <div className="fila-cabeza">
            <h2>Uso día a día</h2>
            <select value={ventana} onChange={(e) => cambiarVentana(Number(e.target.value))}>
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>

          <div className="rejilla">
            <select value={metrica}
                    onChange={(e) => setMetrica(e.target.value as keyof Omit<Dia, "dia">)}>
              {METRICAS.map((m) => <option key={m.k} value={m.k}>{m.n}</option>)}
            </select>
          </div>

          <p className="menudo">
            {num(total)} en total · máximo diario {num(tope)}
          </p>

          {/* Barras en CSS, como el resto del panel: una librería de
              gráficos son 100 KB que paga cada visita, admin o no. */}
          <div className="barras">
            {dias.map((d) => {
              const v = Number(d[metrica]) || 0;
              return (
                <div key={d.dia} className="barra-hueco"
                     title={`${new Date(d.dia).toLocaleDateString("es-ES")}: ${num(v)}`}>
                  <div className="barra"
                       style={{ height: `${Math.max((v / tope) * 100, v ? 3 : 0)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="barras-pie menudo">
            <span>{dias[0] && new Date(dias[0].dia).toLocaleDateString("es-ES")}</span>
            <span>hoy</span>
          </div>

          <p className="menudo">
            No hay tráfico de datos porque no se miden bytes en ninguna parte.
            Lo que sí se mide es lo que cuesta dinero —tokens y consultas— y lo
            que se crea. Un cero inventado sería peor que esta frase.
          </p>
        </div>

        <div className="tarjeta">
          <h2>Registros</h2>
          {logs.length === 0 && <p className="sutil">Nada que contar. Ningún fallo registrado.</p>}
          {logs.map((l, i) => (
            <div key={i} className="tarjeta-interior">
              <div className="fila-cabeza">
                <strong style={{ fontSize: "0.8125rem" }}>{l.componente}</strong>
                <span className="menudo">
                  {new Date(l.cuando).toLocaleString("es-ES")}
                  {l.veces > 1 && ` · ${l.veces} veces`}
                </span>
              </div>
              <p className="menudo" style={{ margin: "4px 0 0" }}>{l.mensaje}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ---------------- la lista ----------------
  return (
    <div className="tarjeta">
      <div>
        <h2>Usuarios</h2>
        <p className="sutil">
          Todos los registrados, con su cliente, permisos y módulos. Ordenados
          por última conexión: los de arriba son los que están usando la app.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Usuario</th><th>Cliente</th><th>Rol</th>
              <th>Módulos</th><th>Alta</th><th>Última conexión</th><th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.usuario_id}>
                <td>
                  {u.email}
                  {u.es_admin && <span className="etiqueta media"> admin</span>}
                  {!u.correo_confirmado && (
                    <span className="etiqueta inferido"> sin confirmar</span>
                  )}
                </td>
                <td>{u.cliente}<div className="menudo">{u.vertical} · {u.plan}</div></td>
                <td>{u.rol}</td>
                <td>
                  {/* Una letra sin leyenda no dice nada: el title la explica
                      al pasar por encima, y el orden es siempre el mismo. */}
                  {u.modulo_prospeccion && (
                    <span className="etiqueta lista" title="Prospección">P</span>
                  )}
                  {u.modulo_email && (
                    <span className="etiqueta lista" title="Email marketing">E</span>
                  )}
                  {!u.modulo_prospeccion && !u.modulo_email && (
                    <span className="etiqueta error">ninguno</span>
                  )}
                </td>
                <td>{fecha(u.alta)}</td>
                <td>
                  {fecha(u.ultima_conexion)}
                  {u.dias_sin_entrar !== null && u.dias_sin_entrar > 14 && (
                    <div className="menudo">hace {u.dias_sin_entrar} días</div>
                  )}
                </td>
                <td>
                  <button className="fantasma" onClick={() => abrir(u)}>Ver →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usuarios.length === 0 && !error && <p className="sutil">Cargando…</p>}
    </div>
  );
}
