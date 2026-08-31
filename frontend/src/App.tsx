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

type Vista = "campanas" | "leads" | "mensajes" | "supresiones" | "cuenta";

const SECCIONES: { id: Vista; nombre: string; icono: string }[] = [
  { id: "campanas",    nombre: "Campañas",    icono: "◈" },
  { id: "leads",       nombre: "Leads",       icono: "◉" },
  { id: "mensajes",    nombre: "Mensajes",    icono: "✉" },
  { id: "supresiones", nombre: "Supresiones", icono: "⊘" },
  { id: "cuenta",      nombre: "Cuenta",      icono: "◐" },
];

export default function App() {
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
