// ============================================================
// Historial de contacto.
//
// A qué lead se le escribió, cuándo, en qué campaña, de qué tipo y a qué
// dirección exacta. Es lo que hay que poder responder ante una reclamación
// —compliance.md pide registro de origen y de contacto— y también lo que
// evita escribir dos veces a la misma puerta.
//
// La dirección que se guarda es la del momento del envío, no la actual del
// lead: si el lead cambia de correo después, la reclamación va sobre la que
// se usó.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Fila = {
  mensaje_id: string;
  lead: string;
  email_actual: string | null;
  email_destino: string | null;
  campana: string;
  tipo_campana: string;
  asunto: string | null;
  estado: string;
  enviado_en: string | null;
  creado_en: string;
};

const TIPOS: Record<string, string> = {
  prospeccion: "Prospección",
  colaboracion: "Colaboración",
  seguimiento: "Seguimiento",
  reactivacion: "Reactivación",
};

export function Historial() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [soloEnviados, setSoloEnviados] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase.from("v_historial_contacto")
      .select("mensaje_id, lead, email_actual, email_destino, campana, tipo_campana, asunto, estado, enviado_en, creado_en")
      .order("enviado_en", { ascending: false, nullsFirst: false })
      .order("creado_en", { ascending: false })
      .limit(300);
    if (soloEnviados) q = q.eq("estado", "enviado");
    const { data } = await q;
    setFilas((data ?? []) as Fila[]);
    setCargando(false);
  }, [soloEnviados]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = filas.filter((f) => {
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    return f.lead.toLowerCase().includes(t)
        || (f.email_destino ?? f.email_actual ?? "").toLowerCase().includes(t)
        || f.campana.toLowerCase().includes(t);
  });

  const enviados = filas.filter((f) => f.estado === "enviado").length;

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Registro</span>
          <h1>Historial de contacto</h1>
          <p className="sutil">
            A quién se ha escrito, cuándo y desde qué campaña. Es el registro
            que hay que poder enseñar ante una reclamación.
          </p>
        </div>
      </div>

      <div className="rejilla">
        <select value={soloEnviados ? "enviados" : "todos"}
                onChange={(e) => setSoloEnviados(e.target.value === "enviados")}>
          <option value="enviados">Solo enviados</option>
          <option value="todos">Enviados y borradores</option>
        </select>
        <input placeholder="Buscar por negocio, correo o campaña"
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {cargando && <p className="sutil">Cargando…</p>}

      {!cargando && filas.length === 0 && (
        <div className="tarjeta">
          <h2>Todavía no has contactado a nadie</h2>
          <p className="sutil">
            Cuando marques un mensaje como enviado, en la sección Mensajes,
            aparecerá aquí con su fecha y la dirección exacta a la que fue.
          </p>
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <>
          <p className="sutil">
            {visibles.length} de {filas.length}
            {!soloEnviados && ` · ${enviados} enviados`}
          </p>

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Enviado a</th>
                  <th>Campaña</th>
                  <th>Tipo</th>
                  <th>Asunto</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.mensaje_id}>
                    <td><strong>{f.lead}</strong></td>
                    <td>
                      {/* La del envío, no la actual: si el lead cambió de
                          correo, la reclamación va sobre la que se usó. */}
                      {f.email_destino ?? <span className="menudo">—</span>}
                    </td>
                    <td>{f.campana}</td>
                    <td>
                      <span className="etiqueta">{TIPOS[f.tipo_campana] ?? f.tipo_campana}</span>
                    </td>
                    <td className="sutil">{f.asunto ?? "—"}</td>
                    <td>
                      {f.enviado_en
                        ? new Date(f.enviado_en).toLocaleDateString("es-ES", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                          })
                        : <span className="etiqueta">borrador</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
