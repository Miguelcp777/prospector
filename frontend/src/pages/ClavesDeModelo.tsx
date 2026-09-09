// ============================================================
// Las claves de los proveedores de modelo, desde el panel.
//
// Sustituye a la pantalla de una sola clave (la de OpenAI, 026). El molde es
// el mismo y la propiedad importante no cambia: se pueden ESCRIBIR desde
// aquí, no se pueden LEER. `leer_clave_modelo` está concedida solo a
// `service_role`, que corre dentro de la Edge Function — ni siquiera un
// administrador la saca desde el navegador.
//
// Lo único que se ve son los cuatro últimos caracteres, que es lo justo para
// saber si la que hay es la que crees haber puesto.
//
// La pantalla dice de cada proveedor si alguna función lo usa. Una clave
// guardada que nadie lee parece configuración hecha, y es de las cosas que
// se descubren el día que hacen falta.
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
};

/** Para qué sirve cada uno, y qué pinta tiene su clave. */
const FICHA: Record<string, { para: string; pista: string; donde: string }> = {
  anthropic: {
    para: "Inferencia de segmentos, redacción de mensajes, landings y el studio de plantillas.",
    pista: "sk-ant-…",
    donde: "console.anthropic.com → API keys",
  },
  openai: {
    para: "Generación de imágenes en el studio. El modelo que escribe el texto no las genera.",
    pista: "sk-proj-…",
    donde: "platform.openai.com → API keys",
  },
  gemini: {
    para: "Ninguna función la usa todavía. Se guarda para tenerla puesta el día que haga falta.",
    pista: "AIza…",
    donde: "aistudio.google.com → API keys",
  },
};

export function ClavesDeModelo() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase.rpc("estado_claves_modelo");
    if (fallo) { setError(fallo.message); return; }
    setFilas((data ?? []) as Fila[]);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      {error && <p className="caja-error">{error}</p>}
      {filas.map((f) => (
        <Proveedor key={f.proveedor} fila={f} recargar={cargar} />
      ))}
    </>
  );
}

function Proveedor({ fila, recargar }: { fila: Fila; recargar: () => Promise<void> }) {
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ficha = FICHA[fila.proveedor] ?? { para: "", pista: "", donde: "" };

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_clave_modelo", {
      p_proveedor: fila.proveedor,
      p_clave: clave,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    // En cuanto sale de aquí, se olvida: no hay motivo para tenerla en
    // memoria del navegador ni un segundo más.
    setClave("");
    setMensaje("Clave guardada.");
    await recargar();
  }

  async function borrar() {
    setError(null);
    setMensaje(null);
    const { error: fallo } = await supabase.rpc("borrar_clave_modelo", {
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
    </div>
  );
}
