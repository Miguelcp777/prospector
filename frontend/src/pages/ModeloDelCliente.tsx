// ============================================================
// El proveedor de modelo de cada cliente. Cuenta → Proveedor de modelo.
//
// Mismo molde que la pantalla del panel (`ClavesDeModelo`), y la propiedad
// importante es la misma: la clave se ESCRIBE desde aquí y no se puede
// LEER. `resolver_clave_modelo` está concedida solo a `service_role`, que
// corre dentro de la Edge Function.
//
// Lo que cambia es de quién es la factura. Ver la 047:
//
//   En versión de prueba → gasta la clave del servicio
//   Fuera de la prueba   → gasta la suya, o no gasta
//
// Por eso la pantalla enseña primero en cuál de los dos estados está la
// cuenta: sin eso, «pega tu clave» es una petición sin motivo.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Fila = {
  proveedor: string;
  etiqueta: string;
  en_uso: boolean;
  configurada: boolean;
  actualizada_en: string | null;
  pista: string | null;
  preferido: boolean;
};

/** Para qué sirve cada uno, y qué pinta tiene su clave. */
const FICHA: Record<string, { para: string; pista: string; donde: string }> = {
  anthropic: {
    para: "Los segmentos, los mensajes, las landings y las herramientas de texto del studio.",
    pista: "sk-ant-…",
    donde: "console.anthropic.com → API keys",
  },
  openai: {
    para: "Las imágenes del studio. El modelo que escribe el texto no las genera.",
    pista: "sk-proj-…",
    donde: "platform.openai.com → API keys",
  },
  gemini: {
    para: "Todavía no lo llama ninguna función de Prospector. Se guarda para cuando lo haga.",
    pista: "AIza…",
    donde: "aistudio.google.com → API keys",
  },
};

export function ModeloDelCliente() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [enPrueba, setEnPrueba] = useState<boolean | null>(null);
  const [esPropietario, setEsPropietario] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [estado, cuenta, propietario] = await Promise.all([
      supabase.rpc("estado_claves_modelo_cliente"),
      supabase.from("tenants").select("modo_demo").maybeSingle(),
      supabase.rpc("es_propietario"),
    ]);
    if (estado.error) { setError(estado.error.message); return; }
    setFilas((estado.data ?? []) as Fila[]);
    setEnPrueba((cuenta.data as { modo_demo?: boolean } | null)?.modo_demo ?? null);
    setEsPropietario(propietario.data === true);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const conTexto = filas.find((f) => f.proveedor === "anthropic");

  return (
    <>
      {error && <p className="caja-error">{error}</p>}

      {/* En qué estado está la cuenta. Es lo primero porque decide si hace
          falta hacer algo en esta pantalla o no. */}
      {enPrueba === true && (
        <p className="caja-aviso">
          <strong>Versión de prueba.</strong> Mientras dure, la inteligencia
          artificial funciona con la clave del servicio y no tienes que poner
          nada. El día que se amplíen los límites de esta cuenta, harán falta
          tus propias claves: puedes dejarlas puestas desde ya.
        </p>
      )}

      {enPrueba === false && !conTexto?.configurada && (
        <p className="caja-error">
          <strong>Falta tu clave.</strong> Esta cuenta ya no está en versión de
          prueba, así que las funciones con inteligencia artificial —segmentos,
          mensajes, landings y el studio— no pueden trabajar hasta que pegues
          aquí la clave de tu proveedor.
        </p>
      )}

      {!esPropietario && (
        <p className="caja-aviso">
          Solo el propietario de la cuenta puede cambiar estas claves. Puedes
          ver cuáles hay puestas, no tocarlas.
        </p>
      )}

      {filas.map((f) => (
        <Proveedor
          key={f.proveedor}
          fila={f}
          puedeEscribir={esPropietario}
          recargar={cargar}
        />
      ))}
    </>
  );
}

function Proveedor({
  fila, puedeEscribir, recargar,
}: {
  fila: Fila;
  puedeEscribir: boolean;
  recargar: () => Promise<void>;
}) {
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ficha = FICHA[fila.proveedor] ?? { para: "", pista: "", donde: "" };

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_clave_modelo_cliente", {
      p_proveedor: fila.proveedor,
      p_clave: clave,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    // En cuanto sale de aquí, se olvida: no hay motivo para tenerla en
    // memoria del navegador ni un segundo más.
    setClave("");
    setMensaje("Clave guardada. Empieza a usarse en unos minutos como mucho.");
    await recargar();
  }

  async function borrar() {
    setError(null);
    setMensaje(null);
    if (!window.confirm(
      `¿Borrar la clave de ${fila.etiqueta}? Las funciones que la usan dejarán ` +
      `de trabajar hasta que pongas otra.`,
    )) return;
    const { error: fallo } = await supabase.rpc("borrar_clave_modelo_cliente", {
      p_proveedor: fila.proveedor,
    });
    if (fallo) { setError(fallo.message); return; }
    setMensaje("Clave borrada.");
    await recargar();
  }

  return (
    <div className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <h2>{fila.etiqueta}</h2>
          <p className="sutil">{ficha.para}</p>
        </div>
        {fila.configurada
          ? <span className="etiqueta lista">activa</span>
          : <span className="etiqueta">sin clave</span>}
      </div>

      {error && <p className="caja-error">{error}</p>}
      {mensaje && <p className="caja-aviso">{mensaje}</p>}

      {!fila.en_uso && (
        <p className="caja-aviso">
          Ninguna función de Prospector llama a este proveedor todavía. La clave
          se guarda igual, pero ponerla no cambia nada por ahora.
        </p>
      )}

      {fila.configurada ? (
        <div className="menudo">
          Puesta · <code>{fila.pista}</code> · guardada el{" "}
          {fila.actualizada_en
            ? new Date(fila.actualizada_en).toLocaleString("es-ES")
            : "—"}
        </div>
      ) : (
        <p className="menudo">Se saca en {ficha.donde}.</p>
      )}

      {puedeEscribir && (
        <>
          <label className="campo">
            <span>{fila.configurada ? "Sustituir la clave" : "Pegar la clave"}</span>
            <input
              type="password"
              value={clave}
              autoComplete="off"
              spellCheck={false}
              placeholder={ficha.pista}
              onChange={(e) => setClave(e.target.value)}
            />
          </label>

          <div className="acciones">
            <button className="primario" onClick={guardar}
                    disabled={guardando || clave.trim().length < 20}>
              {guardando ? "Guardando…" : "Guardar clave"}
            </button>
            {fila.configurada && (
              <button className="fantasma" style={{ marginLeft: "auto" }} onClick={borrar}>
                Borrar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
