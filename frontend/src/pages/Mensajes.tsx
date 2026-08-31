// ============================================================
// Mensajes redactados.
//
// Todos nacen en 'borrador' y aquí se leen antes de que exista ningún
// envío. Esa revisión no es un trámite: el modelo escribe bien casi
// siempre, y el "casi" es lo que llega al buzón de un desconocido con el
// nombre de tu cliente encima.
//
// El envío (Fase 4) no existe todavía, así que esta pantalla no tiene botón
// de enviar. Cuando lo tenga, la base seguirá exigiendo lo suyo: dirección
// no suprimida y enlace de baja dentro del cuerpo.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Mensaje = {
  id: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  creado_en: string;
  leads: { nombre: string; email: string | null } | null;
};

const TOPE = 100;

export function Mensajes() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("messages")
      .select("id, asunto, cuerpo, estado, creado_en, leads(nombre, email)")
      .order("creado_en", { ascending: false })
      .limit(TOPE)
      .then(({ data, error: fallo }) => {
        if (fallo) setError(fallo.message);
        else setMensajes((data ?? []) as unknown as Mensaje[]);
        setCargando(false);
      });
  }, []);

  if (cargando) return <section className="panel"><p className="sutil">Cargando…</p></section>;

  return (
    <section className="panel">
      <h1>Mensajes</h1>

      {error && <p className="error">{error}</p>}

      {mensajes.length === 0 && (
        <p className="sutil">
          Todavía no hay mensajes. Se generan desde la ficha de una campaña,
          con «Redactar mensajes», y solo para leads con email que no estén
          en la lista de supresión.
        </p>
      )}

      {mensajes.length > 0 && (
        <>
          <p className="sutil">
            {mensajes.length} mensajes, todos en borrador. Léelos antes de que
            exista el envío: lo que salga de aquí lleva el nombre de tu
            negocio.
          </p>

          <div className="lista">
            {mensajes.map((m) => (
              <article key={m.id} className="fila">
                <div className="fila-cabeza">
                  <div>
                    <strong>{m.asunto ?? "(sin asunto)"}</strong>
                    <div className="sutil">
                      Para {m.leads?.nombre ?? "—"}
                      {m.leads?.email && ` · ${m.leads.email}`}
                    </div>
                  </div>
                  <span className={`etiqueta ${m.estado}`}>{m.estado}</span>
                </div>

                {abierto === m.id
                  ? <pre className="cuerpo">{m.cuerpo}</pre>
                  : <p className="sutil">{m.cuerpo.split("\n")[0].slice(0, 110)}…</p>}

                <div className="acciones">
                  <button
                    className="secundario"
                    onClick={() => setAbierto(abierto === m.id ? null : m.id)}
                  >
                    {abierto === m.id ? "Plegar" : "Leer entero"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
