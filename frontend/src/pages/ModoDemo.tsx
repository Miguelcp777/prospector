// ============================================================
// Los topes del modo demo.
//
// Aquí solo están los NÚMEROS, que son del servicio entero. El interruptor
// —quién está en modo demo y quién no— es de cada cliente y vive en
// Panel → Clientes desde la migración 045.
//
// El reparto no es caprichoso: un interruptor global está mal en cuanto hay
// un cliente de pago y otro de prueba a la vez, mientras que los topes son
// la misma cifra razonable para todos los que estén en demo.
//
// Son DOS facturas distintas y por eso son dos números:
//
//   · Places cobra por consulta  → el techo de leads para las búsquedas
//   · El modelo cobra por correo → el techo de mensajes para la redacción
//
// Un solo número no sirve: 50 leads con correo son 50 llamadas al modelo si
// nadie las acota aparte.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Ajuste = {
  max_leads_demo: number;
  max_mensajes_demo: number;
  contacto_soporte: string | null;
};

export function ModoDemo() {
  const [topeLeads, setTopeLeads] = useState(50);
  const [topeMensajes, setTopeMensajes] = useState(20);
  const [contacto, setContacto] = useState("");
  const [enDemo, setEnDemo] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [a, c] = await Promise.all([
      supabase.from("ajustes")
        .select("max_leads_demo, max_mensajes_demo, contacto_soporte").limit(1),
      // Cuántos clientes están en demo ahora mismo. Sin esta cifra, la
      // pantalla enseña dos números sin decir a cuántos afectan.
      supabase.rpc("panel_tenants"),
    ]);
    if (a.error) { setError(a.error.message); return; }
    const ajuste = (a.data?.[0] ?? null) as Ajuste | null;
    if (ajuste) {
      setTopeLeads(ajuste.max_leads_demo);
      setTopeMensajes(ajuste.max_mensajes_demo);
      setContacto(ajuste.contacto_soporte ?? "");
    }
    const clientes = (c.data ?? []) as { modo_demo: boolean }[];
    if (!c.error) setEnDemo(clientes.filter((x) => x.modo_demo).length);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_topes_demo", {
      p_max_leads: topeLeads,
      p_max_mensajes: topeMensajes,
      p_contacto: contacto,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    setMensaje(
      `Guardado. Cada campaña de un cliente en demo para en ${topeLeads} leads y ${topeMensajes} mensajes.`,
    );
    await cargar();
  }

  return (
    <div className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <h2>Topes del modo demo</h2>
          <p className="sutil">
            Para que un cliente pueda probar el producto sin pagar una campaña
            entera. Estos números valen para todos los que estén en demo.
          </p>
        </div>
        {enDemo !== null && (
          <span className={enDemo > 0 ? "etiqueta buscando" : "etiqueta lista"}>
            {enDemo} en demo
          </span>
        )}
      </div>

      {error && <p className="caja-error">{error}</p>}
      {mensaje && <p className="caja-aviso">{mensaje}</p>}

      <p className="caja-aviso">
        El interruptor de cada cliente está en <strong>Panel → Clientes</strong>.
        Las cuentas nuevas nacen en modo demo; quitarlo es lo que hace que el
        cliente pueda usar la app entera.
      </p>

      <label className="campo">
        <span>Leads como mucho por campaña</span>
        <input type="number" min={1} max={100000} value={topeLeads}
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

      <label className="campo">
        <span>A quién escribir para ampliarlos</span>
        <input value={contacto} onChange={(e) => setContacto(e.target.value)}
               placeholder="comercial@tuempresa.com" />
      </label>
      <p className="menudo">
        Un correo o una dirección web. Sale dentro del aviso que ve el
        cliente, como enlace. Sin esto, el aviso solo puede decir «contacta
        con el administrador del servicio», que es la forma educada de no
        decir nada.
      </p>

      {/* Lo que el cliente lee, tal cual. Redactar un aviso a ciegas y verlo
          por primera vez en la cuenta de alguien es cómo se cuela una frase
          que no se quería. */}
      <div className="banner-demo" style={{ margin: 0 }}>
        <strong>Versión de prueba</strong>
        <span className="banner-demo-detalle">
          Las campañas de esta cuenta están limitadas a{" "}
          <strong>{topeLeads} leads</strong> y{" "}
          <strong>{topeMensajes} mensajes</strong>. El resto de funciones está
          disponible sin restricciones.{" "}
          {contacto.trim()
            ? `Para ampliar los límites, escribe a ${contacto.trim()}.`
            : "Para ampliar los límites, contacta con el administrador del servicio."}
        </span>
      </div>
      <p className="menudo">
        Así lo ve un cliente en versión de prueba, arriba y en todas las
        secciones. No lo puede cerrar: es el estado de su cuenta, no un aviso
        pasajero.
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
