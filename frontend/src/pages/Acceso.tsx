// ============================================================
// Pantalla de acceso.
//
// El marco: fondo, titular y tarjeta. Dentro va uno de cuatro formularios
// —entrar, registro, pedir enlace de recuperación, elegir contraseña nueva—
// y el marco no sabe nada de ninguno.
//
// El registro comparte marco a propósito. Tener la entrada con hero y el
// alta en una tarjeta suelta sobre fondo negro parecen dos productos.
// ============================================================

import { useState } from "react";
import { Entrar } from "./Entrar";
import { Registro } from "./Registro";
import { Recuperar } from "./Recuperar";

export type PantallaAcceso = "entrar" | "registro" | "recuperar";

export function Acceso() {
  const [pantalla, setPantalla] = useState<PantallaAcceso>("entrar");

  return (
    <main className="acceso">
      <div className="acceso-aurora" aria-hidden="true" />

      <div className="acceso-marco">
        <header className="acceso-cabecera">
          <img className="acceso-logo" src="/aurevanta.png" alt="Aurevanta Labs" />
          <p className="acceso-sello">Entorno seguro</p>
        </header>

        <section className="acceso-cuerpo">
          <div className="acceso-discurso">
            <p className="acceso-antetitulo">Prospección asistida</p>
            <h1>
              Convierte el mercado en{" "}
              <span className="degradado">oportunidades reales.</span>
            </h1>
            <p className="acceso-entradilla">
              Descubre negocios de tu zona, quédate con los que encajan y
              prepara la primera toma de contacto{" "}
              <strong>sin listas compradas ni envíos a ciegas.</strong>
            </p>
            <ul className="acceso-pruebas">
              <li>Segmentos deducidos de tu negocio</li>
              <li>Solo buzones corporativos</li>
              <li>Baja en cada mensaje</li>
            </ul>
          </div>

          <div className="acceso-tarjeta-marco">
            <div className="acceso-halo" aria-hidden="true" />
            {pantalla === "entrar" && (
              <Entrar
                irARegistro={() => setPantalla("registro")}
                irARecuperar={() => setPantalla("recuperar")}
              />
            )}
            {pantalla === "registro" && (
              <Registro irAEntrar={() => setPantalla("entrar")} />
            )}
            {pantalla === "recuperar" && (
              <Recuperar irAEntrar={() => setPantalla("entrar")} />
            )}
          </div>
        </section>

        <footer className="acceso-pie">
          <span>© {new Date().getFullYear()} Aurevanta Labs</span>
          {/* El diseño traía enlaces a /terminos, /privacidad, /seguridad y
              /soporte. No los ponemos porque esos documentos todavía no
              existen —están pendientes en docs/compliance.md— y un enlace
              legal que lleva a un 404 es peor que no tenerlo. */}
        </footer>
      </div>
    </main>
  );
}
