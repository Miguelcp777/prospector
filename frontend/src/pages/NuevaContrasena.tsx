// ============================================================
// Elegir contraseña nueva, al volver del enlace de recuperación.
//
// Cuando se llega desde ese correo, supabase-js lee el token del fragmento
// de la URL y abre una sesión de recuperación: por eso aquí ya hay sesión y
// basta con `updateUser`. Sin esta pantalla el enlace dejaría al usuario
// dentro de la app sin haber cambiado nada, que es lo que menos espera.
// ============================================================

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { LARGO_MINIMO, validarContrasena, validarRepeticion } from "../lib/validacion";

export function NuevaContrasena({ alTerminar }: { alTerminar: () => void }) {
  const [contrasena, setContrasena] = useState("");
  const [repeticion, setRepeticion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problema =
      validarContrasena(contrasena) ?? validarRepeticion(contrasena, repeticion);
    if (problema) { setError(problema); return; }

    setGuardando(true);
    const { error: fallo } = await supabase.auth.updateUser({ password: contrasena });
    setGuardando(false);

    if (fallo) { setError(fallo.message); return; }
    alTerminar();
  }

  return (
    <main className="acceso">
      <div className="acceso-aurora" aria-hidden="true" />
      <div className="acceso-marco acceso-marco-solo">
        <header className="acceso-cabecera">
          <img className="acceso-logo" src="/aurevanta.png" alt="Aurevanta Labs" />
        </header>

        <section className="acceso-cuerpo acceso-cuerpo-centrado">
          <div className="acceso-tarjeta-marco">
            <div className="acceso-halo" aria-hidden="true" />
            <form className="acceso-tarjeta" onSubmit={enviar} noValidate>
              <div className="acceso-tarjeta-cabeza">
                <small>Recuperar acceso</small>
                <h2>Elige una contraseña nueva</h2>
                <p>Con esto entrarás a partir de ahora.</p>
              </div>

              <label className="campo">
                <span>Nueva contraseña</span>
                <input type="password" value={contrasena} autoComplete="new-password"
                       placeholder={`Mínimo ${LARGO_MINIMO} caracteres`}
                       onChange={(e) => setContrasena(e.target.value)} />
              </label>

              <label className="campo">
                <span>Repite la contraseña</span>
                <input type="password" value={repeticion} autoComplete="new-password"
                       onChange={(e) => setRepeticion(e.target.value)} />
              </label>

              {error && <p className="caja-error" role="alert">{error}</p>}

              <button className="primario" type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar y entrar"}
              </button>
            </form>
          </div>
        </section>

        <footer className="acceso-pie">
          <span>© {new Date().getFullYear()} Aurevanta Labs</span>
        </footer>
      </div>
    </main>
  );
}
