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

import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Acceso } from "./pages/Acceso";
import { NuevaContrasena } from "./pages/NuevaContrasena";
import { Campanas } from "./pages/Campanas";
import { Leads } from "./pages/Leads";
import { Mensajes } from "./pages/Mensajes";
import { Historial } from "./pages/Historial";
import { Supresiones } from "./pages/Supresiones";
import { Cuenta } from "./pages/Cuenta";
import { Incidencias } from "./pages/Incidencias";
import { Panel } from "./pages/Panel";

const Studio = lazy(() => import("./pages/Studio"));
import { supabase } from "./lib/supabase";
import { estadoDe, PASOS, ProveedorRecorrido, useRecorrido } from "./lib/recorrido";

type Vista = "campanas" | "leads" | "mensajes" | "historial" | "supresiones" | "incidencias" | "cuenta" | "panel" | "studio";

const SECCIONES: { id: Vista; nombre: string; icono: string }[] = [
  { id: "campanas",    nombre: "Campañas",    icono: "◈" },
  { id: "leads",       nombre: "Leads",       icono: "◉" },
  { id: "mensajes",    nombre: "Mensajes",    icono: "✉" },
  { id: "studio",      nombre: "Plantillas",  icono: "▧" },
  { id: "historial",   nombre: "Historial",   icono: "◔" },
  { id: "supresiones", nombre: "Supresiones", icono: "⊘" },
  { id: "incidencias", nombre: "Incidencias", icono: "⚠" },
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
  const [recuperando, setRecuperando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [vista, setVista] = useState<Vista>("campanas");

  // Si es admin, aparece la sección de panel. Que el menú esté o no no
  // decide nada: las funciones panel_* comprueban es_admin() por su cuenta,
  // y la clave publicable está en el bundle de todo el mundo.
  useEffect(() => {
    if (!sesion) { setEsAdmin(false); return; }
    supabase.rpc("es_admin").then(({ data }) => setEsAdmin(data === true));
  }, [sesion]);

  useEffect(() => {
    // getSession primero: al recargar, la sesión ya está en localStorage y
    // sin esto la pantalla parpadearía al formulario de entrada.
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      // El enlace del correo de recuperación abre sesión y dispara este
      // evento. Sin atenderlo, el usuario acabaría dentro de la app sin
      // haber cambiado la contraseña que venía a cambiar.
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) return <main className="centro"><p className="sutil">Cargando…</p></main>;

  if (recuperando) return <NuevaContrasena alTerminar={() => setRecuperando(false)} />;

  if (!sesion) return <Acceso />;

  return (
    <div className="armazon">
      <nav className="lateral">
        <div className="marca">
          <img src="/aurevanta-marca.png" alt="" className="marca-logo" />
          <span>Prospector</span>
        </div>

        {[...SECCIONES, ...(esAdmin
          ? [{ id: "panel" as Vista, nombre: "Panel", icono: "▤" }]
          : [])].map((s) => (
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

        <div className="pie-marca">
          <img src="/aurevanta.png" alt="Aurevanta Labs" />
        </div>
      </nav>

      <main className={vista === "studio" ? "contenido contenido-completo" : "contenido"}>
        {/* El studio se sale de .ancho a propósito: esa clase limita el
            contenido a 960px, que es lo correcto para leer una tabla y lo
            contrario de lo que necesita un editor de dos paneles. */}
        {vista === "studio" ? (
          <Suspense fallback={<p className="sutil">Cargando el studio…</p>}>
            <Studio />
          </Suspense>
        ) : (
        <div className="ancho">
          {vista === "campanas"    && <Campanas />}
          {vista === "leads"       && <Leads />}
          {vista === "mensajes"    && <Mensajes />}
          {vista === "historial"   && <Historial />}
          {vista === "supresiones" && <Supresiones />}
          {vista === "incidencias" && <Incidencias />}
          {vista === "cuenta"      && <Cuenta />}
          {vista === "panel"       && esAdmin && <Panel />}
        </div>
        )}
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
