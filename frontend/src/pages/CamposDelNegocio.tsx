// ============================================================
// Los campos del perfil del negocio, en tres grupos.
//
// Los comparten la pantalla de bienvenida —que los reparte en tres pasos—
// y la de Cuenta, que los enseña de corrido. El mismo formulario con
// distinta puesta en escena: si cada pantalla tuviera los suyos, el día que
// se añada un campo aparecería en una y no en la otra.
//
// Estos componentes no guardan nada. Suben el perfil entero al padre, que
// es quien decide cuándo se escribe y si además se cierra la bienvenida.
// ============================================================

import { useRef, useState } from "react";
import {
  MAX_BYTES_LOGO, quitarLogoDelNegocio, subirLogoDelNegocio, urlDelLogo,
  type PerfilNegocio,
} from "../lib/perfil-negocio";

type Props = {
  perfil: PerfilNegocio;
  cambiar: (cambio: Partial<PerfilNegocio>) => void;
};

/** Lo que no se puede dejar en blanco: es lo que usan la inferencia y el redactor. */
export function GrupoNegocio({ perfil, cambiar }: Props) {
  return (
    <>
      <label className="campo">
        <span>Nombre del negocio *</span>
        <input value={perfil.nombre} placeholder="Woody Tattoo"
               onChange={(e) => cambiar({ nombre: e.target.value })} />
        <small className="sutil">
          Es el que firma los correos, salvo que una campaña declare otro.
        </small>
      </label>

      <div className="rejilla">
        <label className="campo">
          <span>¿A qué se dedica? *</span>
          <input list="verticales" value={perfil.vertical} placeholder="tatuajes"
                 onChange={(e) => cambiar({ vertical: e.target.value })} />
          <datalist id="verticales"><option value="fisioterapia" /></datalist>
          <small className="sutil">
            Una o dos palabras. Hoy solo fisioterapia tiene taxonomía curada;
            con otra actividad la inferencia funciona igual, sin ese apoyo.
          </small>
        </label>

        <label className="campo">
          <span>Ciudad *</span>
          <input value={perfil.ciudad} placeholder="Valencia"
                 onChange={(e) => cambiar({ ciudad: e.target.value })} />
        </label>
      </div>

      <label className="campo">
        <span>Qué hacéis, en dos frases *</span>
        <textarea rows={4} value={perfil.descripcion}
                  placeholder="Estudio de tatuajes y piercings. Cada diseño se dibuja para quien lo lleva, con material de un solo uso y sala esterilizada."
                  onChange={(e) => cambiar({ descripcion: e.target.value })} />
        <small className="sutil">
          Esto es lo que lee la IA cuando escribe un correo, y lo que llega
          puesto en cada campaña nueva. Cuanto más concreto, menos genérico
          sale el resultado.
        </small>
      </label>
    </>
  );
}

/** Cómo encontrar al negocio. Nada de esto bloquea el alta. */
export function GrupoContacto({ perfil, cambiar }: Props) {
  const redes = perfil.redes;
  const cambiarRed = (clave: keyof typeof redes, valor: string) =>
    cambiar({ redes: { ...redes, [clave]: valor } });

  return (
    <>
      <div className="rejilla">
        <label className="campo">
          <span>Teléfono</span>
          <input value={perfil.telefono} placeholder="961 234 567"
                 onChange={(e) => cambiar({ telefono: e.target.value })} />
        </label>
        <label className="campo">
          <span>Email de contacto</span>
          <input type="email" value={perfil.emailContacto} placeholder="hola@tunegocio.es"
                 onChange={(e) => cambiar({ emailContacto: e.target.value })} />
        </label>
      </div>

      <label className="campo">
        <span>Web</span>
        <input value={perfil.web} placeholder="https://tunegocio.es"
               onChange={(e) => cambiar({ web: e.target.value })} />
      </label>

      <label className="campo">
        <span>Domicilio postal</span>
        <input value={perfil.direccionPostal}
               placeholder="Calle Mayor 1, 46001 Valencia"
               onChange={(e) => cambiar({ direccionPostal: e.target.value })} />
        <small className="sutil">
          Va al pie de cada correo. La ley de comercio electrónico exige
          identificar al remitente con una dirección real, así que sin esto
          los correos se diseñan pero no se pueden enviar.
        </small>
      </label>

      <label className="campo">
        <span>Horario</span>
        <input value={perfil.horario} placeholder="L-V 10:00-20:00, S 10:00-14:00"
               onChange={(e) => cambiar({ horario: e.target.value })} />
      </label>

      <fieldset className="campo">
        <legend>Redes</legend>
        <div className="rejilla">
          <input value={redes.instagram ?? ""} placeholder="Instagram"
                 onChange={(e) => cambiarRed("instagram", e.target.value)} />
          <input value={redes.facebook ?? ""} placeholder="Facebook"
                 onChange={(e) => cambiarRed("facebook", e.target.value)} />
          <input value={redes.linkedin ?? ""} placeholder="LinkedIn"
                 onChange={(e) => cambiarRed("linkedin", e.target.value)} />
          <input value={redes.tiktok ?? ""} placeholder="TikTok"
                 onChange={(e) => cambiarRed("tiktok", e.target.value)} />
        </div>
      </fieldset>
    </>
  );
}

/**
 * El logo del negocio.
 *
 * Se sube al momento, no al guardar el formulario: es un archivo, y
 * mezclarlo con el resto obligaría a mantener en memoria algo que puede
 * pesar dos megas mientras el usuario decide.
 */
export function GrupoLogo({ perfil, cambiar }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const url = urlDelLogo(perfil.rutaLogo);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    setError(null);
    setSubiendo(true);
    const r = await subirLogoDelNegocio(archivo, perfil.id);
    setSubiendo(false);

    if ("error" in r) { setError(r.error); return; }
    cambiar({ rutaLogo: r.ruta });
  }

  async function quitar() {
    setSubiendo(true);
    await quitarLogoDelNegocio();
    setSubiendo(false);
    cambiar({ rutaLogo: null });
  }

  return (
    <div className="logo-negocio">
      {error && <p className="caja-error">{error}</p>}

      <div className="logo-negocio-fila">
        <div className="logo-negocio-muestra">
          {url
            ? <img src={url} alt={`Logo de ${perfil.nombre || "tu negocio"}`} />
            : <span className="sutil">Sin logo</span>}
        </div>

        <div>
          <div className="acciones">
            <button type="button" onClick={() => entrada.current?.click()}
                    disabled={subiendo}>
              {subiendo ? "Subiendo…" : url ? "Cambiar el logo" : "Subir un logo"}
            </button>
            {url && (
              <button type="button" className="sutil" onClick={quitar} disabled={subiendo}>
                Quitarlo
              </button>
            )}
          </div>
          <p className="menudo">
            PNG, JPG o WebP, hasta {Math.round(MAX_BYTES_LOGO / 1024 / 1024)} MB.
            Sin SVG: es un documento con scripts dentro y aquí las imágenes se
            sirven en abierto para que un correo pueda pintarlas semanas
            después.
          </p>
          <p className="menudo">
            Sale en la cabecera de los correos, en las plantillas que genera
            la IA y en las landings. Una campaña puede subir el suyo y ese
            manda solo en ella.
          </p>
        </div>
      </div>

      <input ref={entrada} type="file" className="sr-only"
             accept="image/png,image/jpeg,image/webp" onChange={elegir} />
    </div>
  );
}
