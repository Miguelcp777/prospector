// ============================================================
// Modo demo, desde el panel.
//
// Una campaña de verdad devuelve cientos de leads y escribe cientos de
// correos: «Woody tatoo» dio 920 leads en 59 consultas a Places, y otra
// campaña se dejó 516 llamadas al modelo redactando. Para enseñar el
// producto sobran los tres números.
//
// Son DOS facturas distintas y por eso hay dos techos:
//
//   · Places cobra por consulta  → el techo de leads para las búsquedas
//   · El modelo cobra por correo → el techo de mensajes para la redacción
//
// Un solo número no sirve: 50 leads con correo son 50 llamadas al modelo si
// nadie las acota aparte.
//
// Los límites viven en la base (039 y 042), no aquí. Un tope de interfaz lo
// esquiva cualquiera llamando a la RPC con la clave publicable, que viaja
// en el bundle.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Ajuste = {
  modo_demo: boolean;
  max_leads_demo: number;
  max_mensajes_demo: number;
};

export function ModoDemo() {
  const [activo, setActivo] = useState(false);
  const [topeLeads, setTopeLeads] = useState(50);
  const [topeMensajes, setTopeMensajes] = useState(20);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase
      .from("ajustes")
      .select("modo_demo, max_leads_demo, max_mensajes_demo")
      .limit(1);
    if (fallo) { setError(fallo.message); return; }
    const a = (data?.[0] ?? null) as Ajuste | null;
    if (!a) return;
    setActivo(a.modo_demo);
    setTopeLeads(a.max_leads_demo);
    setTopeMensajes(a.max_mensajes_demo);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_modo_demo", {
      p_activo: activo,
      p_max_leads: topeLeads,
      p_max_mensajes: topeMensajes,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    setMensaje(
      activo
        ? `Modo demo puesto. Cada campaña para en ${topeLeads} leads y ${topeMensajes} mensajes.`
        : "Modo demo quitado. Vuelven a mandar los techos normales de cada campaña.",
    );
    await cargar();
  }

  return (
    <div className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <h2>Modo demo</h2>
          <p className="sutil">
            Para enseñar el producto sin pagar una campaña entera. Afecta a
            todos los clientes del servicio.
          </p>
        </div>
        {activo && <span className="etiqueta buscando">puesto</span>}
      </div>

      {error && <p className="caja-error">{error}</p>}
      {mensaje && <p className="caja-aviso">{mensaje}</p>}

      <label className="toggle">
        <input type="checkbox" checked={activo}
               onChange={(e) => setActivo(e.target.checked)} />
        <span>
          <strong>Limitar cada campaña</strong>
          <small>
            El descubrimiento y la redacción paran al llegar a su techo, y la
            campaña se queda con lo que haya conseguido.
          </small>
        </span>
      </label>

      <label className="campo">
        <span>Leads como mucho por campaña</span>
        <input type="number" min={1} max={100000} value={topeLeads}
               disabled={!activo}
               onChange={(e) => setTopeLeads(Number(e.target.value))} />
      </label>
      <p className="menudo">
        Frena las búsquedas de Google Places, que se pagan por consulta. Una
        campaña de 920 leads costó 59 consultas; con el techo en 50 son tres o
        cuatro.
      </p>

      <label className="campo">
        <span>Mensajes como mucho por campaña</span>
        <input type="number" min={1} max={100000} value={topeMensajes}
               disabled={!activo}
               onChange={(e) => setTopeMensajes(Number(e.target.value))} />
      </label>
      <p className="menudo">
        Frena la redacción, que es la otra factura: <strong>cada correo
        personalizado es una llamada al modelo</strong>. Este techo es total
        por campaña, no por tanda — al llegar, «Escribir los que faltan» deja
        de escribir en vez de empezar otra ronda.
      </p>

      <p className="menudo">
        Lo que ya existe <strong>no se toca</strong>: las campañas con más
        leads o más mensajes que el techo los conservan. El límite frena el
        trabajo nuevo, no borra nada.
      </p>

      <div className="acciones">
        <button className="primario" onClick={guardar}
                disabled={guardando || topeLeads < 1 || topeMensajes < 1}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
