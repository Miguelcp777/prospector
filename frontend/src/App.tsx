// ============================================================
// Raíz de la aplicación.
//
// Resuelve la sesión y monta el armazón: barra lateral y contenido. Sin
// sesión, entrada o alta.
//
// La navegación sigue siendo un useState y no un router. Con cinco
// secciones y ningún enlace que compartir, una dependencia de rutas es
// coste sin beneficio. El día que haya que compartir la URL de una campaña
// concreta, tocará cambiarlo.
// ============================================================

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Entrar } from "./pages/Entrar";
import { Registro } from "./pages/Registro";
import { Campanas } from "./pages/Campanas";
import { Leads } from "./pages/Leads";
import { Mensajes } from "./pages/Mensajes";
import { Supresiones } from "./pages/Supresiones";
import { Cuenta } from "./pages/Cuenta";
import { supabase } from "./lib/supabase";
import { estadoDe, PASOS, ProveedorRecorrido, useRecorrido } from "./lib/recorrido";

type Vista = "campanas" | "leads" | "mensajes" | "supresiones" | "cuenta";

const SECCIONES: { id: Vista; nombre: string; icono: string }[] = [
  { id: "campanas",    nombre: "Campañas",    icono: "◈" },
  { id: "leads",       nombre: "Leads",       icono: "◉" },
  { id: "mensajes",    nombre: "Mensajes",    icono: "✉" },
  { id: "supresiones", nombre: "Supresiones", icono: "⊘" },
  { id: "cuenta",      nombre: "Cuenta",      icono: "◐" },
];

export default function App() {
  return (
    <ProveedorRecorrido>
      <Aplicacion />
    </ProveedorRecorrido>
  );
}

function Aplicacion() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pantalla, setPantalla] = useState<"entrar" | "registro">("entrar");
  const [vista, setVista] = useState<Vista>("campanas");

  useEffect(() => {
    // getSession primero: al recargar, la sesión ya está en localStorage y
    // sin esto la pantalla parpadearía al formulario de entrada.
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) return <main className="centro"><p className="sutil">Cargando…</p></main>;

  if (!sesion) {
    return (
      <main className="centro">
        {pantalla === "entrar"
          ? <Entrar irARegistro={() => setPantalla("registro")} />
          : <Registro irAEntrar={() => setPantalla("entrar")} />}
      </main>
    );
  }

  return (
    <div className="armazon">
      <nav className="lateral">
        <div className="marca">
          <div className="marca-punto" />
          <span>Prospector</span>
        </div>

        {SECCIONES.map((s) => (
          <button
            key={s.id}
            className={vista === s.id ? "nav-item activa" : "nav-item"}
            onClick={() => setVista(s.id)}
          >
            <span aria-hidden="true">{s.icono}</span>
            {s.nombre}
          </button>
        ))}

        <RecorridoLateral />

        <button className="nav-item nav-fin" onClick={() => supabase.auth.signOut()}>
          <span aria-hidden="true">→</span>
          Salir
        </button>
      </nav>

      <main className="contenido">
        <div className="ancho">
          {vista === "campanas"    && <Campanas />}
          {vista === "leads"       && <Leads />}
          {vista === "mensajes"    && <Mensajes />}
          {vista === "supresiones" && <Supresiones />}
          {vista === "cuenta"      && <Cuenta />}
        </div>
      </main>
    </div>
  );
}


/**
 * El recorrido de la campaña abierta, en el lateral.
 *
 * Solo aparece cuando hay una campaña abierta. Sirve para no perder el hilo
 * al salir a Leads o a Mensajes: desde cualquier pantalla se ve por dónde va
 * la campaña en la que estabas trabajando.
 *
 * No es navegable a propósito. Cada paso se hace en su sitio dentro de la
 * campaña, y un atajo que salte al paso 4 sin haber pasado por el 3 rompe
 * justo lo que el recorrido intenta ordenar.
 */
function RecorridoLateral() {
  const { recorrido } = useRecorrido();
  if (!recorrido) return null;

  const hechos = recorrido.hechos.filter(Boolean).length;

  return (
    <div className="recorrido">
      <div className="recorrido-cabeza">
        <span className="rotulo">En curso</span>
        <strong>{recorrido.campana}</strong>
        <span className="menudo">{hechos} de {PASOS.length} pasos</span>
      </div>

      {PASOS.map((p, i) => {
        const e = estadoDe(recorrido.hechos, i);
        return (
          <div key={p.corto} className={`recorrido-paso ${e}`}>
            <span className="recorrido-marca">{e === "hecho" ? "✓" : i + 1}</span>
            {p.corto}
          </div>
        );
      })}
    </div>
  );
}
