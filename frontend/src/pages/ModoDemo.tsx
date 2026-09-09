// ============================================================
// Modo demo, desde el panel.
//
// Una campaña de verdad devuelve cientos de leads: «Woody tatoo» dio 920 en
// 59 consultas a Places. Para enseñar el producto sobran los dos números.
//
// Lo que este interruptor apaga NO es la lista de leads: es el gasto. Al
// llegar al techo, el worker deja de reclamar tareas y el descubrimiento se
// cierra ahí. Con 50 leads son tres o cuatro consultas en vez de 59.
//
// El límite vive en la base (039), no aquí. Un tope de interfaz lo esquiva
// cualquiera llamando a la RPC con la clave publicable, que viaja en el
// bundle.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Ajuste = { modo_demo: boolean; max_leads_demo: number };

export function ModoDemo() {
  const [activo, setActivo] = useState(false);
  const [tope, setTope] = useState(50);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase
      .from("ajustes").select("modo_demo, max_leads_demo").limit(1);
    if (fallo) { setError(fallo.message); return; }
    const a = (data?.[0] ?? null) as Ajuste | null;
    if (!a) return;
    setActivo(a.modo_demo);
    setTope(a.max_leads_demo);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_modo_demo", {
      p_activo: activo,
      p_max: tope,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    setMensaje(
      activo
        ? `Modo demo puesto. Las búsquedas paran a los ${tope} leads por campaña.`
        : "Modo demo quitado. Las búsquedas vuelven a ir hasta el techo de consultas de cada campaña.",
    );
    await cargar();
  }

  return (
    <div className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <h2>Modo demo</h2>
          <p className="sutil">
            Para enseñar el producto sin pagar una campaña entera de Google
            Places. Afecta a todos los clientes del servicio.
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
          <strong>Limitar los leads por campaña</strong>
          <small>
            El descubrimiento se para al llegar al techo y la campaña queda
            lista con lo que haya encontrado.
          </small>
        </span>
      </label>

      <label className="campo">
        <span>Leads como mucho por campaña</span>
        <input type="number" min={1} max={100000} value={tope}
               disabled={!activo}
               onChange={(e) => setTope(Number(e.target.value))} />
      </label>

      <p className="menudo">
        El ahorro no está en guardar menos leads —esos ya están pagados—, sino
        en dejar de buscar. Una campaña de 920 leads costó 59 consultas; con el
        techo en 50 son tres o cuatro.
      </p>

      <p className="menudo">
        Las campañas que ya tienen más leads que el techo <strong>no pierden
        ninguno</strong>: el límite frena las búsquedas nuevas, no borra nada.
        Lo que sí hace es rechazar un «Buscar más» hasta que lo quites.
      </p>

      <div className="acciones">
        <button className="primario" onClick={guardar}
                disabled={guardando || tope < 1}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
