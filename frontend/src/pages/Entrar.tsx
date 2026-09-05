// ============================================================
// Entrada con email y contraseña.
//
// Supabase Auth devuelve el mismo error para "usuario que no existe" y
// "contraseña incorrecta", y así hay que dejarlo: distinguirlos convierte el
// formulario en una forma de averiguar quién tiene cuenta.
// ============================================================

import { useState } from "react";
import { BotonGoogle } from "../components/BotonGoogle";
import { recordarSesion, seRecuerdaLaSesion, supabase } from "../lib/supabase";
import { validarContrasena, validarEmail } from "../lib/validacion";

export function Entrar({
  irARegistro, irARecuperar,
}: {
  irARegistro: () => void;
  irARecuperar: () => void;
}) {
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [recordar, setRecordar] = useState(seRecuerdaLaSesion());
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

    // Antes de autenticar: la preferencia decide en qué almacén escribe
    // supabase-js la sesión que está a punto de crear.
    recordarSesion(recordar);

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
    <form className="acceso-tarjeta" onSubmit={enviar} noValidate>
      <div className="acceso-tarjeta-cabeza">
        <small>Tu espacio de trabajo</small>
        <h2>Entra en Prospector</h2>
        <p>Sigue donde lo dejaste.</p>
      </div>

      <BotonGoogle />
      <div className="separador-o"><span>o con tu correo</span></div>

      <label className="campo">
        <span>Email</span>
        <input type="email" value={email} autoComplete="email" inputMode="email"
               placeholder="nombre@empresa.com"
               onChange={(e) => setEmail(e.target.value)} />
      </label>

      {/* La etiqueta va fuera del <label> a propósito: un botón dentro de una
          etiqueta recibe el clic y además se lo reenvía al input, y el enlace
          de recuperar se quedaba sin efecto. Se enlazan por htmlFor/id. */}
      <div className="campo">
        <div className="campo-cabeza">
          <label htmlFor="contrasena">Contraseña</label>
          <button type="button" className="enlace enlace-menudo" onClick={irARecuperar}>
            ¿La has olvidado?
          </button>
        </div>
        <div className="campo-con-boton">
          <input id="contrasena" type={verClave ? "text" : "password"} value={contrasena}
                 autoComplete="current-password" placeholder="Tu contraseña"
                 onChange={(e) => setContrasena(e.target.value)} />
          <button type="button" className="ojo" onClick={() => setVerClave(!verClave)}
                  aria-pressed={verClave}
                  aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}>
            {verClave ? "◍" : "◉"}
          </button>
        </div>
      </div>

      <label className="casilla">
        <input type="checkbox" checked={recordar}
               onChange={(e) => setRecordar(e.target.checked)} />
        <span>
          Mantener la sesión
          {!recordar && (
            <small className="menudo"> · se cerrará al cerrar el navegador</small>
          )}
        </span>
      </label>

      {error && <p className="caja-error" role="alert">{error}</p>}

      <button className="primario" type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="sutil acceso-pie-tarjeta">
        ¿No tienes cuenta?{" "}
        <button type="button" className="enlace" onClick={irARegistro}>
          Crear una
        </button>
      </p>
    </form>
  );
}
