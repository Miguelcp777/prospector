// ============================================================
// La bienvenida: los datos del negocio, antes de nada.
//
// POR QUÉ EXISTE
//
// Hasta ahora una cuenta podía entrar sabiendo de sí misma un nombre y poco
// más. Por la vía de Google, ni eso: el alta no pregunta y el tenant nace
// con `vertical = 'sin_definir'`. Después, cada campaña volvía a pedir «tu
// negocio, en una frase» como si no se hubiera dicho nunca — y la mitad se
// quedaban vacías, así que la inferencia proponía cualquier cosa y el
// redactor escribía genérico.
//
// QUÉ BLOQUEA Y QUÉ NO
//
// Solo los cuatro esenciales: nombre, actividad, descripción y ciudad. Son
// exactamente los que leen la inferencia y el redactor, así que sin ellos el
// producto no puede hacer su trabajo. El contacto y el logo se pueden dejar
// para luego, y la pantalla dice qué falta en vez de retener a nadie.
//
// Se enseña una sola vez: la cierra `tenants.configurado_en`. Las cuentas
// anteriores a la 051 se sellaron en la migración para no encontrársela de
// golpe — la lección de la 045, que metió a todos en modo demo el mismo día.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  guardarPerfil, leerPerfil, loQueFalta, type PerfilNegocio,
} from "../lib/perfil-negocio";
import { GrupoContacto, GrupoLogo, GrupoNegocio } from "./CamposDelNegocio";

const PASOS = [
  { titulo: "Tu negocio", nota: "Con esto la IA sabe a quién buscar y qué contar" },
  { titulo: "Cómo te encuentran", nota: "Va al pie de los correos y a las landings" },
  { titulo: "Tu logo", nota: "Aparece en todo lo que se diseñe a partir de ahora" },
] as const;

export function Bienvenida({ alTerminar }: { alTerminar: () => void }) {
  const [perfil, setPerfil] = useState<PerfilNegocio | null>(null);
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    leerPerfil().then((p) => {
      if (p) setPerfil(p);
      else setError(
        "Tu usuario no tiene cuenta asociada. Eso significa que el trigger de " +
        "alta no llegó a ejecutarse, y sin él la RLS te oculta todo.",
      );
    });
  }, []);

  const cambiar = (cambio: Partial<PerfilNegocio>) =>
    setPerfil((p) => (p ? { ...p, ...cambio } : p));

  const falta = perfil ? loQueFalta(perfil) : [];

  async function terminar() {
    if (!perfil) return;
    setError(null);
    setGuardando(true);
    const r = await guardarPerfil(perfil, { cerrarBienvenida: true });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    alTerminar();
  }

  function siguiente() {
    if (paso === 0 && falta.length) {
      setError(`Falta ${falta.join(", ")}.`);
      return;
    }
    setError(null);
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else void terminar();
  }

  return (
    <main className="bienvenida">
      <div className="bienvenida-marco">
        <header className="cabecera-texto">
          <span className="rotulo">Paso {paso + 1} de {PASOS.length}</span>
          <h1>{PASOS[paso].titulo}</h1>
          <p className="sutil">{PASOS[paso].nota}</p>
        </header>

        <ol className="bienvenida-pasos" aria-label="Progreso">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className={i === paso ? "activo" : i < paso ? "hecho" : ""}>
              <span aria-hidden="true">{i < paso ? "✓" : i + 1}</span>
              {p.titulo}
            </li>
          ))}
        </ol>

        {error && <p className="caja-error">{error}</p>}
        {!perfil && !error && <p className="sutil">Cargando tu cuenta…</p>}

        {perfil && (
          <div className="tarjeta">
            {paso === 0 && <GrupoNegocio perfil={perfil} cambiar={cambiar} />}
            {paso === 1 && <GrupoContacto perfil={perfil} cambiar={cambiar} />}
            {paso === 2 && <GrupoLogo perfil={perfil} cambiar={cambiar} />}

            <div className="acciones bienvenida-acciones">
              {paso > 0 && (
                <button type="button" className="secundario"
                        onClick={() => { setError(null); setPaso(paso - 1); }}>
                  Atrás
                </button>
              )}
              {/* `.sutil` es una clase de texto: en un botón deja la cara gris
                  del navegador con letra apagada encima, y eso no se lee. */}
              {paso > 0 && (
                <button type="button" className="fantasma" onClick={terminar}
                        disabled={guardando}>
                  Terminar ahora
                </button>
              )}
              <button type="button" className="primario" onClick={siguiente}
                      disabled={guardando}>
                {guardando
                  ? "Guardando…"
                  : paso === PASOS.length - 1 ? "Entrar a Prospector" : "Continuar"}
              </button>
            </div>
          </div>
        )}

        <p className="menudo">
          Todo esto se cambia después en <strong>Cuenta</strong>, y ahí están
          además el correo saliente y la clave del modelo.{" "}
          <button className="enlace" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </p>
      </div>
    </main>
  );
}
