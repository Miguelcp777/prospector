// ============================================================
// Panel · Salud del servicio y clientes en riesgo
//
// Va lo primero del panel a propósito. El resto del tablero cuenta cuánto
// se ha hecho y cuánto ha costado; esto cuenta si algo está roto. Un número
// de gasto bonito con el worker caído es una foto que engaña.
//
// Los umbrales están en el SQL (migración 030), no aquí: si los decide la
// pantalla, cambiarlos obliga a desplegar frontend y a buscarlos entre
// componentes.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Indicador = {
  orden: number; indicador: string; valor: string;
  estado: "ok" | "aviso" | "mal"; detalle: string;
};

type Riesgo = {
  tenant_id: string; nombre: string; dias_alta: number;
  gravedad: number; motivo: string; que_hacer: string;
};

const SEMAFORO: Record<Indicador["estado"], string> = {
  ok: "lista", aviso: "inferido", mal: "error",
};

const GRAVEDAD: Record<number, string> = { 1: "alto", 2: "medio", 3: "bajo" };

export function PanelSalud() {
  const [salud, setSalud] = useState<Indicador[]>([]);
  const [riesgo, setRiesgo] = useState<Riesgo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [s, r] = await Promise.all([
      supabase.rpc("panel_salud"),
      supabase.rpc("panel_clientes_riesgo"),
    ]);
    setCargando(false);
    if (s.error) { setError(s.error.message); return; }
    setSalud((s.data ?? []) as Indicador[]);
    setRiesgo((r.data ?? []) as Riesgo[]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const malos = salud.filter((i) => i.estado === "mal").length;

  return (
    <>
      <div className="tarjeta">
        <div className="fila-cabeza">
          <div>
            <h2>Salud del servicio</h2>
            <p className="sutil">
              Si algo de aquí está en rojo, el resto del panel cuenta una
              historia que no es.
            </p>
          </div>
          <button className="fantasma" onClick={cargar} disabled={cargando}>
            {cargando ? "…" : "Actualizar"}
          </button>
        </div>

        {error && <p className="caja-error">{error}</p>}

        {malos > 0 && (
          <p className="caja-error">
            {malos} indicador{malos === 1 ? "" : "es"} en rojo.
          </p>
        )}

        {salud.map((i) => (
          <div key={i.orden} className="fila-cabeza">
            <div>
              <strong style={{ fontSize: "0.875rem" }}>{i.indicador}</strong>
              <div className="menudo">{i.detalle}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="menudo" style={{ textAlign: "right" }}>{i.valor}</span>
              <span className={`etiqueta ${SEMAFORO[i.estado]}`}>{i.estado}</span>
            </div>
          </div>
        ))}

        {!cargando && salud.length === 0 && !error && (
          <p className="sutil">Sin datos de salud todavía.</p>
        )}
      </div>

      <div className="tarjeta">
        <div>
          <h2>Clientes en riesgo</h2>
          <p className="sutil">
            No es una lista de malos clientes: es a quién llamar esta semana.
            Ordenada por urgencia, no por nombre.
          </p>
        </div>

        {riesgo.length === 0 && !cargando && (
          <p className="sutil">Ninguno. Todos tienen campañas, leads y correos.</p>
        )}

        {riesgo.map((r) => (
          <div key={r.tenant_id} className="tarjeta-interior">
            <div className="fila-cabeza">
              <strong style={{ fontSize: "0.9375rem" }}>{r.nombre}</strong>
              <span className={`etiqueta ${r.gravedad === 1 ? "error" : r.gravedad === 2 ? "inferido" : "media"}`}>
                {GRAVEDAD[r.gravedad]}
              </span>
            </div>
            <p className="menudo" style={{ margin: "4px 0 0" }}>{r.motivo}</p>
            <p className="sutil" style={{ margin: "6px 0 0" }}>{r.que_hacer}</p>
          </div>
        ))}
      </div>
    </>
  );
}
