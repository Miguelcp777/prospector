// ============================================================
// Entrar con Google.
//
// El mismo botón sirve para entrar y para registrarse: en OAuth no hay
// diferencia. Si el correo de Google no tiene cuenta, Supabase la crea y el
// trigger de alta monta tenant y perfil; si ya existe con contraseña,
// Supabase enlaza las dos identidades por email en vez de duplicar usuario.
//
// Lo que no puede hacer es rellenar el negocio: Google no sabe a qué se
// dedica quien entra. El tenant nace con vertical 'sin_definir' y la app
// avisa hasta que se complete — ver AvisoNegocio.
// ============================================================

import { useState } from "react";
import { supabase, urlDeRetorno } from "../lib/supabase";

export function BotonGoogle({ etiqueta = "Continuar con Google" }: { etiqueta?: string }) {
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar() {
    setError(null);
    setYendo(true);

    const { error: fallo } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Volver a donde estábamos. Tiene que estar en la lista de Redirect
      // URLs del proyecto, o Supabase devuelve al Site URL.
      options: { redirectTo: urlDeRetorno() },
    });

    if (fallo) {
      setYendo(false);
      // Ojo con lo que NO llega aquí: signInWithOAuth no valida el proveedor,
      // solo navega el navegador a /auth/v1/authorize. Si Google no está dado
      // de alta, el 400 lo pinta Supabase como JSON crudo en su propia página
      // y este código ya no se está ejecutando. Aquí solo caen los fallos
      // previos a la navegación — sin red, sobre todo.
      setError(
        /provider is not enabled|Unsupported provider/i.test(fallo.message)
          ? "Google todavía no está activado en este proyecto."
          : fallo.message,
      );
      return;
    }
    // Si no hubo error, el navegador ya se está yendo a Google.
  }

  return (
    <>
      <button type="button" className="secundario boton-google"
              onClick={entrar} disabled={yendo}>
        <MarcaGoogle />
        {yendo ? "Abriendo Google…" : etiqueta}
      </button>
      {error && <p className="caja-error">{error}</p>}
    </>
  );
}

/** La G de Google, con sus colores. Las condiciones de uso de la marca no
 *  dejan recolorearla ni meterla en un círculo propio. */
function MarcaGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.4h12.1c-.2 1.8-1.6 4.6-4.5 6.5l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.2z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.7 5.2-.1.3C8 41.6 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.8-5.3-.2.1C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 9.9l7-5.5z" />
      <path fill="#EB4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 15.4 2 8 6.4 4.5 14.1l7 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
    </svg>
  );
}
