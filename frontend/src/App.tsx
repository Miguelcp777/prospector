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
import { guardarTema, temaGuardado, type Tema } from "./lib/tema";

/**
 * El interruptor de tema.
 *
 * Enseña a dónde vas, no dónde estás: en oscuro dice "Modo claro". Un
 * interruptor que se etiqueta con su estado actual se lee al revés la
 * mitad de las veces.
 */
function BotonTema() {
  const [tema, setTema] = useState<Tema>(() => temaGuardado());

  // Mientras nadie haya elegido, la app sigue al sistema y cambia con él
  // —al anochecer, por ejemplo—. En cuanto se elige, deja de seguirlo.
  useEffect(() => {
    const mq = globalThis.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const alCambiar = () => {
      if (localStorage.getItem("prospector-tema")) return;
      setTema(mq.matches ? "claro" : "oscuro");
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  function alternar() {
    const siguiente: Tema = tema === "oscuro" ? "claro" : "oscuro";
    setTema(siguiente);
    guardarTema(siguiente);
  }

  const destino = tema === "oscuro" ? "claro" : "oscuro";
  return (
    <button className="nav-item" onClick={alternar}
            title={`Cambiar al modo ${destino}`}
            aria-label={`Cambiar al modo ${destino}`}>
      <span aria-hidden="true">{tema === "oscuro" ? "☀" : "☾"}</span>
      Modo {destino}
    </button>
  );
}

type Vista = "campanas" | "leads" | "mensajes" | "historial" | "supresiones" | "incidencias" | "cuenta" | "panel" | "studio";

type Seccion = { id: Vista; nombre: string; icono: string; nota: string };
type Grupo = { id: string; nombre: string; icono: string; secciones: Seccion[] };

/**
 * El lateral, repartido en los dos oficios que hay aquí.
 *
 * Nueve entradas planas no dicen en qué orden se hacen las cosas ni qué va
 * con qué. Son dos trabajos distintos: encontrar a quién escribir, y
 * escribirle. Cada grupo lleva sus pantallas en el orden en que se recorren.
 *
 * Lo de abajo no es ninguno de los dos —la cuenta, los fallos, el panel— y
 * por eso queda suelto: meterlo a la fuerza en un grupo lo escondería.
 */
const GRUPOS: Grupo[] = [
  {
    id: "prospeccion",
    nombre: "Prospección",
    icono: "◈",
    secciones: [
      { id: "campanas", nombre: "Campañas", icono: "◈",
        nota: "Describir el negocio, inferir segmentos y buscar" },
      { id: "leads", nombre: "Leads", icono: "◉",
        nota: "Lo que ha encontrado la búsqueda" },
    ],
  },
  {
    id: "email",
    nombre: "Email marketing",
    icono: "✉",
    secciones: [
      { id: "studio", nombre: "Plantillas", icono: "▧",
        nota: "Diseñar el correo: bloques, imágenes y marca" },
      { id: "mensajes", nombre: "Mensajes", icono: "✎",
        nota: "Los borradores, para revisarlos antes de enviar" },
      { id: "historial", nombre: "Historial", icono: "◔",
        nota: "A quién se escribió y cuándo" },
      { id: "supresiones", nombre: "Supresiones", icono: "⊘",
        nota: "Bajas y exclusiones, obligatorias en todo envío" },
    ],
  },
];

/** Ni prospección ni envío: el estado del servicio y quién eres. */
const SUELTAS: Seccion[] = [
  { id: "incidencias", nombre: "Incidencias", icono: "⚠", nota: "Lo que ha fallado" },
  { id: "cuenta", nombre: "Cuenta", icono: "◐", nota: "Tu negocio" },
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

        {GRUPOS.map((g) => (
          <GrupoLateral
            key={g.id}
            grupo={g}
            vista={vista}
            alElegir={setVista}
          />
        ))}

        <div className="nav-sueltas">
          {[...SUELTAS, ...(esAdmin
            ? [{ id: "panel" as Vista, nombre: "Panel", icono: "▤",
                 nota: "Uso y gasto de todo el servicio" }]
            : [])].map((s) => (
            <button
              key={s.id}
              className={vista === s.id ? "nav-item activa" : "nav-item"}
              onClick={() => setVista(s.id)}
              title={s.nota}
            >
              <span aria-hidden="true">{s.icono}</span>
              {s.nombre}
            </button>
          ))}
        </div>

        <RecorridoLateral />

        <BotonTema />

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
          {vista === "mensajes"    && <Mensajes alIrA={setVista} />}
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
/**
 * Un grupo del lateral, plegable.
 *
 * Se pliega porque con nueve entradas abiertas el lateral vuelve a ser una
 * lista larga, que es justo lo que se venía a arreglar. Y se recuerda entre
 * sesiones: quien solo hace prospección no tiene por qué volver a cerrar
 * email marketing cada vez que entra.
 *
 * Con una excepción: el grupo que contiene la pantalla abierta se abre
 * siempre. Un menú que esconde dónde estás desorienta más que uno largo.
 */
function GrupoLateral({
  grupo, vista, alElegir,
}: {
  grupo: Grupo;
  vista: Vista;
  alElegir: (v: Vista) => void;
}) {
  const contieneLaVista = grupo.secciones.some((s) => s.id === vista);
  const clave = `prospector.grupo.${grupo.id}`;

  const [abierto, setAbierto] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado === null ? true : guardado === "1";
    } catch {
      return true;
    }
  });

  function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    try { localStorage.setItem(clave, siguiente ? "1" : "0"); } catch { /* sin almacén */ }
  }

  const desplegado = abierto || contieneLaVista;

  return (
    <div className={`nav-grupo${desplegado ? " abierto" : ""}`}>
      <button className="nav-grupo-cabeza" onClick={alternar}
              aria-expanded={desplegado}>
        <span aria-hidden="true" className="nav-grupo-icono">{grupo.icono}</span>
        <span className="nav-grupo-nombre">{grupo.nombre}</span>
        {/* Punto en vez de flecha cuando la pantalla abierta está dentro y
            el grupo se ha forzado: la flecha diría que se puede cerrar. */}
        <span aria-hidden="true" className="nav-grupo-flecha">
          {contieneLaVista && !abierto ? "•" : desplegado ? "⌄" : "›"}
        </span>
      </button>

      {desplegado && (
        <div className="nav-grupo-hijos">
          {grupo.secciones.map((s) => (
            <button
              key={s.id}
              className={vista === s.id ? "nav-item activa" : "nav-item"}
              onClick={() => alElegir(s.id)}
              title={s.nota}
            >
              <span aria-hidden="true">{s.icono}</span>
              {s.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
