// ============================================================
// La clave de OpenAI, desde el panel.
//
// Es la única clave de API que se pega desde el navegador, y por eso va con
// cuidado: sube al Vault de Supabase y NO se puede volver a leer desde aquí.
// Ni siquiera siendo administrador — `leer_clave_openai` está concedida
// solo a `service_role`, que corre dentro de la Edge Function.
//
// Lo que sí se ve son los cuatro últimos caracteres, que es lo justo para
// saber si la que hay es la que crees haber puesto.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Estado = { configurada: boolean; actualizada_en: string | null; pista: string | null };

export function ClaveOpenAI() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase.rpc("estado_clave_openai");
    if (fallo) { setError(fallo.message); return; }
    setEstado((data?.[0] ?? null) as Estado | null);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    const { error: fallo } = await supabase.rpc("guardar_clave_openai", { p_clave: clave });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    // En cuanto sale de aquí, se olvida: no hay motivo para tenerla en
    // memoria del navegador ni un segundo más.
    setClave("");
    setMensaje("Clave guardada. Ya se pueden generar imágenes.");
    await cargar();
  }

  async function borrar() {
    setError(null);
    setMensaje(null);
    const { error: fallo } = await supabase.rpc("borrar_clave_openai");
    if (fallo) { setError(fallo.message); return; }
    setMensaje("Clave borrada. Generar imágenes deja de funcionar.");
    await cargar();
  }

  return (
    <div className="tarjeta">
      <div>
        <h2>Generación de imágenes</h2>
        <p className="sutil">
          El modelo que usa Prospector para el texto no genera imágenes, así
          que el studio necesita una clave de OpenAI. Se saca en
          platform.openai.com → API keys.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}
      {mensaje && <p className="caja-aviso">{mensaje}</p>}

      {estado?.configurada ? (
        <div className="fila-cabeza">
          <div>
            <strong style={{ fontSize: "0.9375rem" }}>
              Configurada · <code>{estado.pista}</code>
            </strong>
            <div className="menudo">
              Guardada el{" "}
              {estado.actualizada_en
                ? new Date(estado.actualizada_en).toLocaleString("es-ES")
                : "—"}
            </div>
          </div>
          <span className="etiqueta lista">activa</span>
        </div>
      ) : (
        <p className="menudo">
          Sin clave. El editor deja usar imágenes propias, pero no generarlas.
        </p>
      )}

      <label className="campo">
        <span>{estado?.configurada ? "Sustituir la clave" : "Pegar la clave"}</span>
        <input
          type="password"
          value={clave}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-proj-…"
          onChange={(e) => setClave(e.target.value)}
        />
      </label>

      <p className="menudo">
        Se guarda cifrada en el Vault de Supabase y no vuelve a salir de ahí:
        la lee la Edge Function que genera las imágenes, con una identidad de
        servidor. Desde esta pantalla no se puede recuperar — si la pierdes,
        se genera otra en OpenAI y se pega aquí.
      </p>

      <div className="acciones">
        <button className="primario" onClick={guardar}
                disabled={guardando || clave.trim().length < 20}>
          {guardando ? "Guardando…" : "Guardar clave"}
        </button>
        {estado?.configurada && (
          <button className="fantasma" style={{ marginLeft: "auto" }} onClick={borrar}>
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}
