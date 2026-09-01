// ============================================================
// Pedir un enlace para recuperar la contraseña.
//
// La respuesta es siempre la misma haya cuenta o no. Decir "ese correo no
// está registrado" convierte este formulario en una forma de averiguar
// quién es cliente, igual que pasaría en la pantalla de entrada.
//
// El correo lo manda Supabase y vuelve al `redirectTo`, que tiene que estar
// en la lista de Redirect URLs del proyecto. Si el Site URL sigue apuntando
// a localhost, este enlace llega roto — ver supabase/README.md.
// ============================================================

import { useState } from "react";
import { supabase, urlDeRetorno } from "../lib/supabase";
import { validarEmail } from "../lib/validacion";

export function Recuperar({ irAEntrar }: { irAEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problema = validarEmail(email);
    if (problema) { setError(problema); return; }

    setEnviando(true);
    const { error: fallo } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: urlDeRetorno() },
    );
    setEnviando(false);

    // Solo se enseñan los fallos que no delatan si la cuenta existe: un
    // límite de peticiones o una caída del servicio no dicen nada de quién
    // está registrado.
    if (fallo && !/not found|no user/i.test(fallo.message)) {
      setError(fallo.message);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="acceso-tarjeta">
        <div className="acceso-tarjeta-cabeza">
          <small>Recuperar acceso</small>
          <h2>Mira tu correo</h2>
          <p>
            Si <strong>{email.trim()}</strong> tiene cuenta, le acaba de llegar
            un enlace para elegir una contraseña nueva. Caduca en una hora.
          </p>
        </div>
        <p className="menudo">
          ¿No aparece? Mira en spam antes de volver a pedirlo: pedirlo dos
          veces invalida el primer enlace.
        </p>
        <button type="button" className="secundario" onClick={irAEntrar}>
          Volver a entrar
        </button>
      </div>
    );
  }

  return (
    <form className="acceso-tarjeta" onSubmit={enviar} noValidate>
      <div className="acceso-tarjeta-cabeza">
        <small>Recuperar acceso</small>
        <h2>¿Olvidaste la contraseña?</h2>
        <p>Escribe tu correo y te mandamos un enlace para cambiarla.</p>
      </div>

      <label className="campo">
        <span>Email</span>
        <input type="email" value={email} autoComplete="email" inputMode="email"
               placeholder="nombre@empresa.com"
               onChange={(e) => setEmail(e.target.value)} />
      </label>

      {error && <p className="caja-error" role="alert">{error}</p>}

      <button className="primario" type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar enlace"}
      </button>

      <p className="sutil acceso-pie-tarjeta">
        <button type="button" className="enlace" onClick={irAEntrar}>
          Volver a entrar
        </button>
      </p>
    </form>
  );
}
