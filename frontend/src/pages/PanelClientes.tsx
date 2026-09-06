// ============================================================
// Panel · Clientes
//
// Ver y editar los AJUSTES de cualquier cliente: plan, módulos
// contratados, topes de gasto y estado de su correo.
//
// El límite, que es lo que hace que esto sea admisible: aquí se editan sus
// ajustes, no sus datos. Ni un lead, ni un correo, ni el cuerpo de un
// mensaje. De sus cosas solo salen recuentos. Somos encargados del
// tratamiento de datos que son de nuestros clientes, no nuestros — ver
// docs/compliance.md.
//
// Lo que protege esto no es que la sección esté escondida: la clave
// publicable viaja en el bundle. Lo que decide es `es_admin()` dentro de
// `panel_cliente` y `panel_guardar_cliente`.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Fila = { tenant_id: string; nombre: string; vertical: string };

type Detalle = {
  id: string; nombre: string; vertical: string; ciudad: string | null;
  plan: string; creado_en: string;
  modulo_prospeccion: boolean; modulo_email: boolean;
  max_consultas_mes: number; dias_cache_places: number;
  usuarios: number; campanas: number; leads: number;
  plantillas: number; mensajes: number; enviados: number;
  correo_remitente: string | null;
  correo_estado: string | null;
  correo_modo: string | null;
};

export function PanelClientes() {
  const [clientes, setClientes] = useState<Fila[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [d, setD] = useState<Detalle | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("panel_tenants").then(({ data, error: fallo }) => {
      if (fallo) { setError(fallo.message); return; }
      setClientes((data ?? []) as Fila[]);
    });
  }, []);

  const abrir = useCallback(async (id: string) => {
    setElegido(id);
    setGuardado(false);
    setError(null);
    setD(null);
    const { data, error: fallo } = await supabase.rpc("panel_cliente", { p_tenant: id });
    if (fallo) { setError(fallo.message); return; }
    setD((data?.[0] ?? null) as Detalle | null);
  }, []);

  function campo<K extends keyof Detalle>(k: K, v: Detalle[K]) {
    setD((x) => (x ? { ...x, [k]: v } : x));
    setGuardado(false);
  }

  async function guardar() {
    if (!d) return;
    setError(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("panel_guardar_cliente", {
      p_tenant: d.id,
      p_plan: d.plan,
      p_modulo_prospeccion: d.modulo_prospeccion,
      p_modulo_email: d.modulo_email,
      p_max_consultas_mes: d.max_consultas_mes,
      p_dias_cache_places: d.dias_cache_places,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    setGuardado(true);
    await abrir(d.id);
  }

  const ESTADO_CORREO: Record<string, string> = {
    sin_verificar: "sin verificar",
    pendiente_dns: "esperando DNS",
    verificado: "verificado",
    fallo: "falló la comprobación",
  };

  return (
    <div className="tarjeta">
      <div>
        <h2>Clientes</h2>
        <p className="sutil">
          Plan, módulos contratados y topes de gasto de cada cuenta. De sus
          datos solo salen recuentos: ni un lead, ni un correo, ni el cuerpo
          de un mensaje.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <label className="campo">
        <span>Cliente</span>
        <select value={elegido ?? ""} onChange={(e) => e.target.value && abrir(e.target.value)}>
          <option value="">Elige un cliente…</option>
          {clientes.map((c) => (
            <option key={c.tenant_id} value={c.tenant_id}>
              {c.nombre} · {c.vertical}
            </option>
          ))}
        </select>
      </label>

      {elegido && !d && !error && <p className="sutil">Cargando…</p>}

      {d && (
        <>
          <dl className="datos">
            <dt>Alta</dt>
            <dd>{new Date(d.creado_en).toLocaleDateString("es-ES")}</dd>
            <dt>Usuarios</dt><dd>{d.usuarios}</dd>
            <dt>Campañas</dt><dd>{d.campanas}</dd>
            <dt>Leads</dt><dd>{d.leads}</dd>
            <dt>Plantillas</dt><dd>{d.plantillas}</dd>
            <dt>Mensajes</dt>
            <dd>{d.mensajes} · {d.enviados} enviados</dd>
            <dt>Remitente</dt>
            <dd>
              {d.correo_remitente ?? "sin configurar"}
              {d.correo_estado && ` · ${ESTADO_CORREO[d.correo_estado] ?? d.correo_estado}`}
              {d.correo_modo === "propio" && " · proveedor propio"}
            </dd>
          </dl>

          {/* Los módulos. Apagar uno no esconde una sección: los triggers
              de la 029 rechazan el trabajo en la base. */}
          <div className="rejilla">
            <label className="toggle">
              <input type="checkbox" checked={d.modulo_prospeccion}
                     onChange={(e) => campo("modulo_prospeccion", e.target.checked)} />
              <span>
                <strong>Prospección</strong>
                <small>Campañas y leads</small>
              </span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={d.modulo_email}
                     onChange={(e) => campo("modulo_email", e.target.checked)} />
              <span>
                <strong>Email marketing</strong>
                <small>Plantillas, mensajes, historial y supresiones</small>
              </span>
            </label>
          </div>

          <div className="rejilla">
            <label className="campo">
              <span>Plan</span>
              <input value={d.plan} onChange={(e) => campo("plan", e.target.value)} />
            </label>
            <label className="campo">
              <span>Consultas a Places por mes</span>
              <input type="number" min={0} value={d.max_consultas_mes}
                     onChange={(e) => campo("max_consultas_mes", Number(e.target.value))} />
            </label>
            <label className="campo">
              <span>Caché de Places (días)</span>
              <input type="number" min={0} value={d.dias_cache_places}
                     onChange={(e) => campo("dias_cache_places", Number(e.target.value))} />
            </label>
          </div>

          <div className="acciones">
            <button className="primario" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardado && <span className="etiqueta lista">guardado</span>}
          </div>

          <p className="menudo">
            El nombre, la actividad y la ciudad los edita el cliente en su
            Cuenta. No se tocan desde aquí: que dos sitios escriban lo mismo
            es como se pierden los cambios de alguien.
          </p>
        </>
      )}
    </div>
  );
}
