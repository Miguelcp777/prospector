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

const TOPE = 200;
const SEPARADOR = "\n—\n";

type Campana = { id: string; nombre: string; ciudad: string };

type Mensaje = {
  id: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  creado_en: string;
  leads: { nombre: string; email: string | null } | null;
};

export function Mensajes() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [elegida, setElegida] = useState("");     // "" = todas
  const [busqueda, setBusqueda] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, nombre, ciudad")
      .order("creado_en", { ascending: false })
      .then(({ data }) => setCampanas((data ?? []) as Campana[]));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    let q = supabase
      .from("messages")
      .select("id, asunto, cuerpo, estado, creado_en, leads!inner(nombre, email, campaign_id)")
      .order("creado_en", { ascending: false })
      .limit(TOPE);

    if (elegida) q = q.eq("leads.campaign_id", elegida);

    const { data, error: fallo } = await q;
    if (fallo) setError(fallo.message);
    else setMensajes((data ?? []) as unknown as Mensaje[]);
    setCargando(false);
  }, [elegida]);

  useEffect(() => { cargar(); }, [cargar]);

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
            Todos en borrador. Léelos y corrígelos antes de que exista el
            envío: lo que salga de aquí lleva el nombre de tu negocio.
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
        <input placeholder="Buscar por asunto, negocio o correo"
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {cargando && <p className="sutil">Cargando…</p>}

      {!cargando && mensajes.length === 0 && (
        <div className="tarjeta">
          <h2>No hay mensajes</h2>
          <p className="sutil">
            Se generan en el paso 5 del recorrido de una campaña, y solo para
            leads con correo que no estén en la lista de supresión.
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
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({
  m, abierto, alAbrir, alGuardar,
}: {
  m: Mensaje;
  abierto: boolean;
  alAbrir: () => void;
  alGuardar: (id: string, asunto: string, cuerpo: string, pie: string) => Promise<boolean>;
}) {
  // El pie se separa aquí: lo que se edita es solo lo de arriba.
  const corte = m.cuerpo.indexOf(SEPARADOR);
  const cuerpoOriginal = corte === -1 ? m.cuerpo : m.cuerpo.slice(0, corte);
  const pie = corte === -1 ? "" : m.cuerpo.slice(corte + SEPARADOR.length);

  const [asunto, setAsunto] = useState(m.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(cuerpoOriginal);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cambiado = asunto !== (m.asunto ?? "") || cuerpo !== cuerpoOriginal;

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
        <span className={`etiqueta ${m.estado}`}>{m.estado}</span>
      </div>

      {!abierto && (
        <p className="sutil">{cuerpoOriginal.split("\n")[0].slice(0, 130)}…</p>
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
            {guardado && <span className="etiqueta lista">guardado</span>}
          </div>
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
