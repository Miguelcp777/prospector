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
import { Bienvenida } from "./pages/Bienvenida";
import { Incidencias } from "./pages/Incidencias";
import { Panel } from "./pages/Panel";

const Studio = lazy(() => import("./pages/Studio"));
import { supabase } from "./lib/supabase";
import { estadoDe, PASOS, ProveedorRecorrido, useRecorrido } from "./lib/recorrido";
import { guardarTema, temaGuardado, type Tema } from "./lib/tema";

/**
 * Quién está dentro.
 *
 * Antes la app no lo decía en ninguna parte: se entraba y la pantalla era
 * la misma para todo el mundo. Con varias cuentas del mismo negocio —y con
 * el modo administrador, que ve datos de otros— saber con cuál estás es
 * parte de poder fiarte de lo que ves.
 *
 * El nombre sale de Google si lo hay; si no, del correo. Nunca queda vacío.
 */
function Conectado({ sesion, esAdmin }: { sesion: Session; esAdmin: boolean }) {
  const [negocio, setNegocio] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("tenants(nombre)").single()
      .then(({ data }) =>
        setNegocio(
          (data as { tenants?: { nombre?: string } } | null)?.tenants?.nombre ?? null,
        ),
      );
  }, [sesion.user.id]);

  const meta = sesion.user.user_metadata as { full_name?: string; name?: string };
  // El correo entero no cabe y además no es un nombre. La parte de delante
  // de la arroba se parece más a cómo se llama la gente a sí misma.
  const nombre =
    meta?.full_name ?? meta?.name ?? sesion.user.email?.split("@")[0] ?? "Tu cuenta";

  const hora = new Date().getHours();
  const saludo =
    hora < 6 ? "Buenas noches" : hora < 14 ? "Buenos días"
    : hora < 21 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="sesion">
      <div className="sesion-estado">
        <span className="sesion-punto" aria-hidden="true" />
        Conectado
        {esAdmin && <span className="etiqueta media">admin</span>}
      </div>
      {/* El saludo en su propia línea: junto al nombre no cabía en los
          240px de la barra y lo que se cortaba era el nombre, que es lo
          único que hay que poder leer entero. */}
      <span className="sesion-saludo">{saludo},</span>
      <strong className="sesion-nombre" title={sesion.user.email ?? ""}>
        {nombre}
      </strong>
      {negocio && <span className="sesion-negocio">{negocio}</span>}
    </div>
  );
}

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
  // Qué módulos tiene contratado este cliente. Se empieza con los dos
  // puestos para que el menú no parpadee mientras se resuelve: quitar
  // secciones y volver a ponerlas se lee como un fallo.
  const [modulos, setModulos] = useState({ prospeccion: true, email: true });
  // El modo demo de esta cuenta y los topes que trae. Empieza en null —no
  // «false»— para no enseñar el banner y quitarlo medio segundo después,
  // que es peor que enseñarlo tarde.
  const [demo, setDemo] = useState<
    { leads: number; mensajes: number; contacto: string | null } | null
  >(null);
  const [vista, setVista] = useState<Vista>("campanas");
  // Empieza en null —no «false»— para no enseñar la aplicación medio
  // segundo y taparla después con la bienvenida.
  const [sinConfigurar, setSinConfigurar] = useState<boolean | null>(null);

  // Si es admin, aparece la sección de panel. Que el menú esté o no no
  // decide nada: las funciones panel_* comprueban es_admin() por su cuenta,
  // y la clave publicable está en el bundle de todo el mundo.
  useEffect(() => {
    if (!sesion) { setEsAdmin(false); return; }
    supabase.rpc("es_admin").then(({ data }) => setEsAdmin(data === true));

    // Esconder una sección no la desactiva: la clave publicable va en el
    // bundle y las funciones se llaman desde la consola. Lo que de verdad
    // apaga un módulo son los triggers de la 029 sobre `jobs` y
    // `plantillas`. Esto es solo para no enseñar lo que no se ha vendido.
    supabase.from("tenants")
      .select("modulo_prospeccion, modulo_email, modo_demo, configurado_en")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // Un usuario sin tenant no tiene bienvenida que enseñar: lo que
          // necesita es el mensaje de Cuenta explicando que el trigger de
          // alta no llegó a correr. Sin esto se quedaría en «Cargando» para
          // siempre, que es la peor forma de contar un fallo.
          setSinConfigurar(false);
          return;
        }
        // Nulo = esta cuenta no ha pasado por la bienvenida. Se resuelve
        // aquí y no en la propia pantalla para que no haya un parpadeo de
        // la aplicación entera antes de taparla.
        setSinConfigurar(data.configurado_en === null);
        setModulos({
          prospeccion: data.modulo_prospeccion !== false,
          email: data.modulo_email !== false,
        });
        // El banner solo se puede pintar con las cifras delante: «estás en
        // modo demo» sin decir en qué se nota no sirve de nada.
        if (data.modo_demo === true) {
          supabase.from("ajustes")
            .select("max_leads_demo, max_mensajes_demo, contacto_soporte")
            .limit(1)
            .then(({ data: a }) => {
              const t = a?.[0] as {
                max_leads_demo: number;
                max_mensajes_demo: number;
                contacto_soporte: string | null;
              } | undefined;
              setDemo({
                leads: t?.max_leads_demo ?? 0,
                mensajes: t?.max_mensajes_demo ?? 0,
                contacto: t?.contacto_soporte?.trim() || null,
              });
            });
        } else {
          setDemo(null);
        }
      });
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

  // Antes que nada, los datos del negocio. Sin ellos la inferencia propone
  // cualquier cosa y el redactor escribe genérico, así que dejar entrar sin
  // preguntarlos es dejar que el producto falle por donde no se ve.
  if (sinConfigurar === null)
    return <main className="centro"><p className="sutil">Cargando tu cuenta…</p></main>;
  if (sinConfigurar)
    return <Bienvenida alTerminar={() => setSinConfigurar(false)} />;

  // Un módulo se puede apagar con la pantalla abierta. Sin esto, el menú
  // deja de ofrecer la sección pero el contenido sigue puesto.
  const DE_PROSPECCION: Vista[] = ["campanas", "leads"];
  const DE_EMAIL: Vista[] = ["studio", "mensajes", "historial", "supresiones"];
  const vistaValida =
    (DE_PROSPECCION.includes(vista) && !modulos.prospeccion) ||
    (DE_EMAIL.includes(vista) && !modulos.email)
      ? (modulos.prospeccion ? "campanas" : modulos.email ? "studio" : "cuenta")
      : vista;

  return (
    <div className="armazon">
      <nav className="lateral">
        <div className="marca">
          <img src="/aurevanta-marca.png" alt="" className="marca-logo" />
          <span>Prospector</span>
        </div>

        {GRUPOS.filter((g) =>
          g.id === "prospeccion" ? modulos.prospeccion
          : g.id === "email" ? modulos.email
          : true,
        ).map((g) => (
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

        {/* Dentro de la campaña el recorrido ya está al lado del contenido,
            con sus nombres completos. Repetirlo aquí sería decir lo mismo
            dos veces en la misma pantalla. */}
        <RecorridoLateral oculto={vistaValida === "campanas"} />

        <Conectado sesion={sesion} esAdmin={esAdmin} />

        <BotonTema />

        <button className="nav-item nav-fin" onClick={() => supabase.auth.signOut()}>
          <span aria-hidden="true">→</span>
          Salir
        </button>

        <div className="pie-marca">
          <img src="/aurevanta.png" alt="Aurevanta Labs" />
        </div>
      </nav>

      <main className={vistaValida === "studio" ? "contenido contenido-completo" : "contenido"}>
        {demo && (
          <div className="banner-demo" role="status">
            <strong>Versión de prueba</strong>
            <span className="banner-demo-detalle">
              Las campañas de esta cuenta están limitadas a{" "}
              <strong>{demo.leads} leads</strong> y{" "}
              <strong>{demo.mensajes} mensajes</strong>. El resto de funciones
              está disponible sin restricciones.{" "}
              <ContactoSoporte contacto={demo.contacto} />
            </span>
          </div>
        )}

        {/* El studio se sale de .ancho a propósito: esa clase limita el
            contenido a 960px, que es lo correcto para leer una tabla y lo
            contrario de lo que necesita un editor de dos paneles. */}
        {vistaValida === "studio" ? (
          <Suspense fallback={<p className="sutil">Cargando el studio…</p>}>
            <Studio />
          </Suspense>
        ) : (
        <div className="ancho">
          {vistaValida === "campanas"    && <Campanas />}
          {vistaValida === "leads"       && <Leads />}
          {vistaValida === "mensajes"    && <Mensajes alIrA={setVista} />}
          {vistaValida === "historial"   && <Historial />}
          {vistaValida === "supresiones" && <Supresiones />}
          {vistaValida === "incidencias" && <Incidencias />}
          {vistaValida === "cuenta"      && <Cuenta />}
          {vistaValida === "panel"       && esAdmin && <Panel />}
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
/**
 * A quién escribir para que le quiten el límite de la versión de prueba.
 *
 * Sin contacto configurado, la frase se queda genérica en vez de mandar a
 * ningún sitio. Decirle a alguien «contacta con» sin decir con quién es la
 * forma educada de no decir nada, pero es mejor que inventarse una
 * dirección o que no explicar cómo se sale de aquí.
 *
 * El mismo texto lo devuelve `aviso_version_de_prueba()` en la base, que es
 * el que sale en los mensajes de error. Están escritos dos veces porque uno
 * necesita ser un enlace y el otro no puede serlo.
 */
function ContactoSoporte({ contacto }: { contacto: string | null }) {
  if (!contacto) {
    return <>Para ampliar los límites, contacta con el administrador del servicio.</>;
  }

  const esCorreo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contacto);
  const esEnlace = /^https?:\/\//i.test(contacto);

  if (!esCorreo && !esEnlace) {
    // Un texto suelto —un teléfono, un nombre— se enseña tal cual: hacerlo
    // enlace a la fuerza daría un href roto.
    return <>Para ampliar los límites, contacta con {contacto}.</>;
  }

  return (
    <>
      Para ampliar los límites,{" "}
      <a href={esCorreo ? `mailto:${contacto}` : contacto}
         {...(esEnlace ? { target: "_blank", rel: "noreferrer" } : {})}>
        {esCorreo ? `escribe a ${contacto}` : "escríbenos"}
      </a>.
    </>
  );
}

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

function RecorridoLateral({ oculto }: { oculto: boolean }) {
  const { recorrido } = useRecorrido();
  if (!recorrido || oculto) return null;

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
