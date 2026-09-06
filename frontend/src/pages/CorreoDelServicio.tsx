// ============================================================
// Panel · Ajustes · Proveedor de correo del servicio
//
// La clave del ESP con el que sale el correo, y el remitente por defecto de
// las pruebas. Es de todo el servicio, como la de OpenAI, y por eso vive
// aquí y no en Cuenta.
//
// NO CONFUNDIR con Cuenta → Correo saliente, que es de cada cliente: su
// dominio, su nombre, su domicilio postal. Esta es la máquina; aquélla es
// quién firma. Ver docs/decisiones/0004-quien-es-el-remitente.md.
//
// La clave entra desde el navegador y no vuelve a salir: la guarda el Vault
// y solo `service_role` puede leerla, ni siquiera un administrador.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Estado = { configurada: boolean; actualizada_en: string | null; pista: string | null };

export function CorreoDelServicio() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [clave, setClave] = useState("");
  const [remitente, setRemitente] = useState("");
  const [proveedor, setProveedor] = useState("resend");
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase.rpc("estado_clave_correo");
    if (fallo) { setError(fallo.message); return; }
    setEstado((data?.[0] ?? null) as Estado | null);

    const { data: aj } = await supabase
      .from("ajustes").select("remitente_servicio, proveedor_correo").maybeSingle();
    if (aj) {
      setRemitente(aj.remitente_servicio ?? "");
      setProveedor(aj.proveedor_correo ?? "resend");
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardarClave() {
    setError(null);
    const { error: fallo } = await supabase.rpc("guardar_clave_correo", { p_clave: clave });
    if (fallo) { setError(fallo.message); return; }
    setClave("");
    await cargar();
  }

  async function borrarClave() {
    const { error: fallo } = await supabase.rpc("borrar_clave_correo");
    if (fallo) { setError(fallo.message); return; }
    await cargar();
  }

  async function guardarRemitente() {
    setError(null);
    const { error: fallo } = await supabase.rpc("guardar_remitente_servicio", {
      p_remitente: remitente, p_proveedor: proveedor,
    });
    if (fallo) { setError(fallo.message); return; }
    setGuardado(true);
    await cargar();
  }

  return (
    <div className="tarjeta">
      <div>
        <h2>Correo del servicio</h2>
        <p className="sutil">
          Por dónde sale el correo. Es de todo el servicio, como la clave de
          OpenAI. Lo de cada cliente —su dominio, su nombre, su domicilio
          postal— está en la Cuenta de cada uno, y se ve en Clientes.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <label className="campo">
        <span>Proveedor</span>
        <select value={proveedor} onChange={(e) => { setProveedor(e.target.value); setGuardado(false); }}>
          <option value="resend">Resend</option>
          <option value="ses">Amazon SES</option>
          <option value="smtp">SMTP</option>
        </select>
      </label>

      {estado?.configurada ? (
        <div className="fila-cabeza">
          <div>
            <strong style={{ fontSize: "0.9375rem" }}>
              Clave configurada · <code>{estado.pista}</code>
            </strong>
            <div className="menudo">
              {estado.actualizada_en
                ? new Date(estado.actualizada_en).toLocaleString("es-ES")
                : "—"}
            </div>
          </div>
          <button className="fantasma" onClick={borrarClave}>Borrar</button>
        </div>
      ) : (
        <p className="menudo">
          Sin clave: el correo de prueba responde 503 diciendo que falta.
        </p>
      )}

      <label className="campo">
        <span>{estado?.configurada ? "Sustituir la clave" : "Pegar la clave"}</span>
        <input type="password" value={clave} autoComplete="off" spellCheck={false}
               placeholder="re_…"
               onChange={(e) => setClave(e.target.value)} />
      </label>

      <div className="acciones">
        <button className="primario" onClick={guardarClave}
                disabled={clave.trim().length < 12}>
          Guardar clave
        </button>
      </div>

      <label className="campo">
        <span>Remitente por defecto</span>
        <input value={remitente} placeholder="Prospector <pruebas@tu-dominio.com>"
               onChange={(e) => { setRemitente(e.target.value); setGuardado(false); }} />
        <small className="menudo">
          El que usan los correos de prueba. El dominio tiene que estar
          verificado en el proveedor o rechazará el envío — es el primer error
          que sale siempre.
        </small>
      </label>

      <div className="acciones">
        <button className="secundario" onClick={guardarRemitente}>Guardar remitente</button>
        {guardado && <span className="etiqueta lista">guardado</span>}
      </div>

      <p className="menudo">
        La clave se guarda cifrada en el Vault y no vuelve a salir de ahí: la
        lee la función de envío con identidad de servidor. Desde aquí no se
        puede recuperar, ni siendo administrador.
      </p>
    </div>
  );
}
