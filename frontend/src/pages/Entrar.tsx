// ============================================================
// Entrada con email y contraseña.
//
// Supabase Auth devuelve el mismo error para "usuario que no existe" y
// "contraseña incorrecta", y así hay que dejarlo: distinguirlos convierte el
// formulario en una forma de averiguar quién tiene cuenta.
// ============================================================

import { useState } from "react";
import { Campo } from "../components/Campo";
import { supabase } from "../lib/supabase";
import { validarContrasena, validarEmail } from "../lib/validacion";

export function Entrar({ irARegistro }: { irARegistro: () => void }) {
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problema = validarEmail(email) ?? validarContrasena(contrasena);
    if (problema) {
      setError(problema);
      return;
    }

    setEnviando(true);
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: contrasena,
    });
    setEnviando(false);

    if (fallo) {
      setError(
        fallo.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos."
          : fallo.message,
      );
      return;
    }
    // App escucha el cambio de sesión y cambia de pantalla solo.
  }

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h1>Entrar</h1>

      <Campo
        etiqueta="Email"
        tipo="email"
        valor={email}
        alCambiar={setEmail}
        autoComplete="email"
      />
      <Campo
        etiqueta="Contraseña"
        tipo="password"
        valor={contrasena}
        alCambiar={setContrasena}
        autoComplete="current-password"
      />

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="sutil">
        ¿No tienes cuenta?{" "}
        <button type="button" className="enlace" onClick={irARegistro}>
          Crear una
        </button>
      </p>
    </form>
  );
}
