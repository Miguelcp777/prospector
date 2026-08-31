// ============================================================
// Pantalla de leads.
//
// Solo lectura. Todo lo que llega aquí lo filtra la RLS por tenant: la
// consulta no lleva ni un `where tenant_id`, y no debe llevarlo — si algún
// día hiciera falta, sería señal de que la política está mal.
//
// El orden por score descendente no es decorativo: es la promesa del
// producto. Lo primero de la tabla tiene que ser a quién llamar primero.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const TOPE = 200;

type Campana = {
  id: string;
  nombre: string;
  ciudad: string;
  estado: string;
};

type Resumen = {
  leads: number;
  con_email: number;
  score_alto: number;
  segmentos: number;
};

type Lead = {
  id: string;
  nombre: string;
  direccion: string | null;
  web: string | null;
  email: string | null;
  telefono: string | null;
  resenas: number | null;
  puntuacion_ext: string | null;
  score: number | null;
  estado: string;
  segments: { nombre: string } | null;
};

export function Leads() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [elegida, setElegida] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [suprimidos, setSuprimidos] = useState<Set<string>>(new Set());
  const [segmento, setSegmento] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("campaigns")
      .select("id, nombre, ciudad, estado")
      .order("creado_en", { ascending: false })
      .then(({ data, error: fallo }) => {
        if (fallo) {
          setError(fallo.message);
          setCargando(false);
          return;
        }
        const lista = (data ?? []) as Campana[];
        setCampanas(lista);
        if (lista.length > 0) setElegida(lista[0].id);
        else setCargando(false);
      });
  }, []);

  useEffect(() => {
    if (!elegida) return;
    setCargando(true);
    setError(null);

    Promise.all([
      supabase
        .from("v_resumen_campana")
        .select("leads, con_email, score_alto, segmentos")
        .eq("campaign_id", elegida)
        .single(),
      supabase
        .from("leads")
        .select(
          "id, nombre, direccion, web, email, telefono, resenas, puntuacion_ext, score, estado, segments(nombre)",
        )
        .eq("campaign_id", elegida)
        .order("score", { ascending: false, nullsFirst: false })
        .order("resenas", { ascending: false, nullsFirst: false })
        .limit(TOPE),
      // Enseñar un email que no se puede usar es peor que no enseñarlo:
      // invita a copiarlo y escribir a mano, que es justo lo que la lista
      // de supresión existe para impedir.
      supabase
        .from("v_leads_contactables")
        .select("id, suprimido")
        .eq("campaign_id", elegida)
        .eq("suprimido", true),
    ]).then(([r, l, s]) => {
      if (r.error) setResumen(null);
      else setResumen(r.data as unknown as Resumen);

      if (l.error) setError(l.error.message);
      else setLeads((l.data ?? []) as unknown as Lead[]);

      setSuprimidos(new Set(((s.data ?? []) as { id: string }[]).map((x) => x.id)));

      setCargando(false);
    });
  }, [elegida]);

  const segmentos = [...new Set(leads.map((l) => l.segments?.nombre).filter(Boolean))] as string[];

  const visibles = leads.filter((l) => {
    if (segmento && l.segments?.nombre !== segmento) return false;
    if (busqueda) {
      const t = busqueda.toLowerCase();
      return (
        l.nombre.toLowerCase().includes(t) ||
        (l.direccion ?? "").toLowerCase().includes(t)
      );
    }
    return true;
  });

  if (campanas.length === 0 && !cargando) {
    return (
      <section className="panel">
        <h1>Leads</h1>
        <p className="sutil">
          Todavía no tienes campañas. Los leads aparecen aquí cuando una
          campaña termina su descubrimiento.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Clientes potenciales</span>
          <h1>Leads</h1>
        </div>
        <select value={elegida} onChange={(e) => setElegida(e.target.value)}>
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.ciudad} · {c.estado}
            </option>
          ))}
        </select>
      </header>

      {error && <p className="error">{error}</p>}

      {resumen && (
        <div className="cifras">
          <Cifra valor={resumen.leads} etiqueta="leads" />
          <Cifra valor={resumen.con_email} etiqueta="con email" />
          <Cifra valor={resumen.score_alto} etiqueta="score ≥ 75" />
          <Cifra valor={resumen.segmentos} etiqueta="segmentos" />
        </div>
      )}

      <div className="rejilla">
        <input
          placeholder="Buscar por nombre o dirección"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
          <option value="">Todos los segmentos</option>
          {segmentos.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {cargando && <p className="sutil">Cargando leads…</p>}

      {!cargando && (
        <>
          <p className="sutil">
            {visibles.length} de {leads.length} mostrados
            {leads.length === TOPE && ` · tope de ${TOPE} por carga`}
          </p>

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Nombre</th>
                  <th>Segmento</th>
                  <th>Reseñas</th>
                  <th>Puntuación</th>
                  <th>Email</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id}>
                    <td><Score valor={l.score} /></td>
                    <td>
                      <strong>{l.nombre}</strong>
                      {l.direccion && <div className="sutil">{l.direccion}</div>}
                    </td>
                    <td>{l.segments?.nombre ?? "—"}</td>
                    <td className="num">{l.resenas ?? "—"}</td>
                    <td className="num">{l.puntuacion_ext ?? "—"}</td>
                    {/* El email tiene columna propia: es el dato con el que se
                        trabaja después, y mezclado con la web y el teléfono
                        no se encontraba. */}
                    <td>
                      {!l.email && <span className="menudo">—</span>}
                      {l.email && (suprimidos.has(l.id)
                        ? <span className="tachado" title="En la lista de supresión: no se le puede escribir">
                            {l.email} · baja
                          </span>
                        : <a href={"mailto:" + l.email}>{l.email}</a>)}
                    </td>
                    <td>
                      {l.web && (
                        <a href={l.web} target="_blank" rel="noopener noreferrer">web</a>
                      )}
                      {l.telefono && <div className="menudo">{l.telefono}</div>}
                      {!l.web && !l.telefono && <span className="menudo">—</span>}
                    </td>
                    <td>{l.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibles.length === 0 && (
            <p className="sutil">Ningún lead coincide con el filtro.</p>
          )}
        </>
      )}
    </section>
  );
}

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="cifra">
      <strong>{valor}</strong>
      <span>{etiqueta}</span>
    </div>
  );
}

/** El color es una ayuda de lectura, no un dato: el número va siempre visible. */
function Score({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="sutil">—</span>;
  const nivel = valor >= 75 ? "alto" : valor >= 50 ? "medio" : "bajo";
  return <span className={`score ${nivel}`}>{valor}</span>;
}
