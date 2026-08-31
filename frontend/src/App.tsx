// ============================================================
// Raíz de la aplicación.
//
// Resuelve la sesión y, con ella, monta el armazón: navegación y pantalla.
// Sin sesión, formularios de entrada o alta.
//
// La navegación es un useState y no un router: con dos pantallas, meter una
// dependencia de rutas es coste sin beneficio. Cuando entre onboarding y
// haya enlaces que compartir, tocará cambiarlo.
// ============================================================

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Entrar } from "./pages/Entrar";
import { Registro } from "./pages/Registro";
import { Leads } from "./pages/Leads";
import { Campanas } from "./pages/Campanas";
import { Mensajes } from "./pages/Mensajes";
import { Supresiones } from "./pages/Supresiones";
import { Cuenta } from "./pages/Cuenta";
import { supabase } from "./lib/supabase";

type Vista = "campanas" | "leads" | "mensajes" | "supresiones" | "cuenta";

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

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSesion(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) return <main className="centro">Cargando…</main>;

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
    <>
      <nav className="barra">
        <span className="marca">Prospector</span>
        <button
          className={vista === "campanas" ? "pestana activa" : "pestana"}
          onClick={() => setVista("campanas")}
        >
          Campañas
        </button>
        <button
          className={vista === "leads" ? "pestana activa" : "pestana"}
          onClick={() => setVista("leads")}
        >
          Leads
        </button>
        <button
          className={vista === "mensajes" ? "pestana activa" : "pestana"}
          onClick={() => setVista("mensajes")}
        >
          Mensajes
        </button>
        <button
          className={vista === "supresiones" ? "pestana activa" : "pestana"}
          onClick={() => setVista("supresiones")}
        >
          Supresiones
        </button>
        <button
          className={vista === "cuenta" ? "pestana activa" : "pestana"}
          onClick={() => setVista("cuenta")}
        >
          Cuenta
        </button>
        <button className="pestana salir" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </nav>

      <main className="ancho">
        {vista === "campanas" && <Campanas verLeads={() => setVista("leads")} />}
        {vista === "leads" && <Leads />}
        {vista === "mensajes" && <Mensajes />}
        {vista === "supresiones" && <Supresiones />}
        {vista === "cuenta" && <Cuenta />}
      </main>
    </>
  );
}
