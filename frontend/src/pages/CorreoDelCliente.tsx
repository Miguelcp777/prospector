// ============================================================
// Configuración de correo del cliente.
//
// Implementa docs/decisiones/0004-quien-es-el-remitente.md: enviamos
// nosotros desde el dominio del cliente, y quien ya tenga su ESP lo trae.
//
// Va en Cuenta y no en el Panel a propósito. El Panel es de administración
// —uso y gasto de todo el servicio— y esto lo necesita cada cliente para el
// suyo. La clave de OpenAI de la 026 sí vive allí porque es una para todos.
//
// Lo que aquí se rellena no es preferencia: el nombre, la dirección y el
// domicilio postal son lo que exige compliance.md para identificar al
// remitente, y hoy el pie de las plantillas se compone con cadenas vacías
// porque no había de dónde sacarlo.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { invocar } from "../lib/edge";

type Config = {
  modo: "gestionado" | "propio";
  nombre_remitente: string | null;
  buzon: string | null;
  dominio: string | null;
  responder_a: string | null;
  direccion_postal: string | null;
  url_privacidad: string | null;
  proveedor: "resend" | "ses" | "smtp" | null;
  estado_dominio: "sin_verificar" | "pendiente_dns" | "verificado" | "fallo";
  detalle: string | null;
  /**
   * Lo que el proveedor dice que hay que poner en el DNS. Nace en [] y lo
   * rellena la Edge Function `dominio-correo` al dar el dominio de alta.
   */
  registros_dns: RegistroDns[];
};

/** Un registro tal como lo devuelve el proveedor. */
type RegistroDns = {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  ttl?: string | number;
  priority?: number;
  status?: string;
};

type Credencial = { configurada: boolean; actualizada_en: string | null; pista: string | null };

const VACIA: Config = {
  modo: "gestionado", nombre_remitente: "", buzon: "", dominio: "",
  responder_a: "", direccion_postal: "", url_privacidad: "",
  proveedor: null, estado_dominio: "sin_verificar", detalle: null,
  registros_dns: [],
};

export function CorreoDelCliente() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [secreto, setSecreto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dominioOcupado, setDominioOcupado] = useState<"alta" | "comprobar" | null>(null);

  const cargar = useCallback(async () => {
    // mi_config_correo crea la fila si no existe. Así la pantalla no tiene
    // que distinguir "sin configurar" de "no la puedo leer", ni hacer un
    // upsert desde el navegador, que es donde se cuela un tenant ajeno.
    const { data, error: fallo } = await supabase.rpc("mi_config_correo");
    if (fallo) { setError(fallo.message); return; }
    setCfg({ ...VACIA, ...(data as Config) });

    const { data: cred } = await supabase.rpc("estado_credencial_correo");
    setCredencial((cred?.[0] ?? null) as Credencial | null);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  function campo<K extends keyof Config>(clave: K, valor: Config[K]) {
    setCfg((c) => (c ? { ...c, [clave]: valor } : c));
    setGuardado(false);
  }

  /**
   * Da de alta el dominio en el proveedor, o pregunta cómo va.
   *
   * Las dos cosas las hace la misma Edge Function porque comparten casi
   * todo: quién eres, cuál es tu dominio y qué dice el proveedor de él.
   * El cliente no toca `estado_dominio` ni `registros_dns` — la 028 los
   * dejó fuera del GRANT a propósito, así que esto tiene que pasar por el
   * servidor aunque parezca un botón tonto.
   */
  async function gestionarDominio(accion: "alta" | "comprobar") {
    setError(null);
    setDominioOcupado(accion);
    const { error: fallo } = await invocar(
      "dominio-correo", { accion },
      accion === "alta" ? "alta de dominio" : "comprobar dominio",
    );
    setDominioOcupado(null);
    if (fallo) { setError(fallo); return; }
    await cargar();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setError(null);
    setGuardando(true);
    // Solo las ocho columnas que la 028 concede a authenticated. El estado
    // del dominio no está entre ellas: lo decide el proveedor al comprobar
    // los DNS, no el cliente.
    const { error: fallo } = await supabase.from("config_correo").update({
      modo: cfg.modo,
      nombre_remitente: cfg.nombre_remitente?.trim() || null,
      buzon: cfg.buzon?.trim().toLowerCase() || null,
      dominio: cfg.dominio?.trim().toLowerCase().replace(/^https?:\/\//, "") || null,
      responder_a: cfg.responder_a?.trim() || null,
      direccion_postal: cfg.direccion_postal?.trim() || null,
      url_privacidad: cfg.url_privacidad?.trim() || null,
      proveedor: cfg.modo === "propio" ? cfg.proveedor : null,
    });
    // Sin filtro a propósito: la RLS deja ver exactamente una fila —la del
    // tenant, que es única por la restricción de la 028— así que el UPDATE
    // no puede alcanzar a nadie más. Poner aquí un tenant_id sacado del
    // navegador sería fiarse de un dato que el navegador controla.
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    setGuardado(true);
    await cargar();
  }

  async function guardarCredencial() {
    setError(null);
    const { error: fallo } = await supabase.rpc("guardar_credencial_correo", {
      p_secreto: secreto,
    });
    if (fallo) { setError(fallo.message); return; }
    setSecreto("");
    await cargar();
  }

  async function borrarCredencial() {
    const { error: fallo } = await supabase.rpc("borrar_credencial_correo");
    if (fallo) { setError(fallo.message); return; }
    await cargar();
  }

  if (error && !cfg) return <p className="caja-error">{error}</p>;
  if (!cfg) return <p className="sutil">Cargando la configuración de correo…</p>;

  const direccion =
    cfg.buzon && cfg.dominio ? `${cfg.buzon}@${cfg.dominio}` : null;

  const identidadCompleta = Boolean(
    cfg.nombre_remitente?.trim() && cfg.buzon?.trim() &&
    cfg.dominio?.trim() && cfg.direccion_postal?.trim(),
  );

  return (
    <>
      <form className="tarjeta" onSubmit={guardar}>
        <div>
          <h2>Correo saliente</h2>
          <p className="sutil">
            Quién firma los correos que se envían desde tus campañas. El
            nombre, la dirección y el domicilio postal no son decoración:
            son lo que identifica al remitente, y van en el pie de cada
            mensaje.
          </p>
        </div>

        {error && <p className="caja-error">{error}</p>}

        <label className="campo">
          <span>Nombre del remitente</span>
          <input value={cfg.nombre_remitente ?? ""} placeholder="Clínica Ejemplo"
                 onChange={(e) => campo("nombre_remitente", e.target.value)} />
        </label>

        <div className="rejilla">
          <label className="campo">
            <span>Buzón</span>
            <input value={cfg.buzon ?? ""} placeholder="hola"
                   onChange={(e) => campo("buzon", e.target.value)} />
          </label>
          <label className="campo">
            <span>Dominio</span>
            <input value={cfg.dominio ?? ""} placeholder="clinicaejemplo.com"
                   onChange={(e) => campo("dominio", e.target.value)} />
          </label>
        </div>

        {direccion && (
          <p className="menudo">
            Los correos saldrán como{" "}
            <strong>{cfg.nombre_remitente || "(sin nombre)"} &lt;{direccion}&gt;</strong>
          </p>
        )}

        <label className="campo">
          <span>Responder a</span>
          <input value={cfg.responder_a ?? ""} placeholder="citas@clinicaejemplo.com"
                 onChange={(e) => campo("responder_a", e.target.value)} />
          <small className="menudo">
            Dónde quieres recibir las respuestas, si es distinto del buzón de
            arriba. Este sí tiene que existir de verdad.
          </small>
        </label>

        <label className="campo">
          <span>Domicilio postal</span>
          <input value={cfg.direccion_postal ?? ""}
                 placeholder="Calle Ejemplo 1, 46001 Valencia"
                 onChange={(e) => campo("direccion_postal", e.target.value)} />
          <small className="menudo">
            Obligatorio en todo correo comercial. Va en el pie, y hoy sale
            en blanco porque no había de dónde sacarlo.
          </small>
        </label>

        <label className="campo">
          <span>Política de privacidad (URL)</span>
          <input value={cfg.url_privacidad ?? ""}
                 placeholder="https://clinicaejemplo.com/privacidad"
                 onChange={(e) => campo("url_privacidad", e.target.value)} />
          <small className="menudo">
            Si la dejas vacía, el pie no ofrece el enlace. Es preferible a
            ofrecerlo y que no lleve a ningún sitio.
          </small>
        </label>

        <div className="acciones">
          <button className="primario" type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {guardado && <span className="etiqueta lista">guardado</span>}
        </div>
      </form>

      {/* ------------------------------------------------------------
          Qué falta para poder enviar. El orden es el de la decisión
          0004, y está aquí para que nadie configure el remitente y dé
          por hecho que ya se envía.
          ------------------------------------------------------------ */}
      <div className="tarjeta">
        <div>
          <h2>Qué falta para enviar</h2>
          <p className="sutil">
            El envío automático todavía no está abierto. Estos son los pasos,
            en orden.
          </p>
        </div>

        <ol className="pasos-arreglo">
          <li>
            <strong>{identidadCompleta ? "✓" : "○"} Identidad del remitente.</strong>{" "}
            {identidadCompleta
              ? "Completa."
              : "Faltan el nombre, el buzón, el dominio o el domicilio postal."}
          </li>
          <li>
            <strong>
              {cfg.estado_dominio === "verificado" ? "✓" : "○"} Verificar el dominio.
            </strong>{" "}
            Añadirás dos o tres registros DNS donde tengas{" "}
            {cfg.dominio || "tu dominio"} y nosotros comprobamos que están.
            No hace falta que abras cuenta en ningún proveedor. Los registros
            salen abajo, en <strong>Registros DNS</strong>.
          </li>
          <li>
            <strong>✓ Rebotes y quejas automáticos.</strong> Las bajas, los
            rebotes y las quejas de spam entran solos en la lista de
            supresión desde que existe el webhook del proveedor.
          </li>
        </ol>

        <p className="menudo">
          Mientras tanto puedes usar <strong>Enviar prueba a mi correo</strong>{" "}
          en cualquier mensaje, que va solo a tu dirección.
        </p>
      </div>

      {/* ------------------------------------------------------------
          Registros DNS.

          Enseñarlos es media función: la otra media es no dejar que el
          cliente se marque verificado solo. Por eso el estado no es un
          campo de este formulario, sino lo que contesta el proveedor.
          ------------------------------------------------------------ */}
      {cfg.modo === "gestionado" && (
        <div className="tarjeta">
          <div>
            <h2>Registros DNS</h2>
            <p className="sutil">
              Damos de alta {cfg.dominio || "tu dominio"} en nuestro proveedor
              de envío y te decimos qué pegar donde lo tengas comprado. Ni
              cuenta ni clave: solo unos registros.
            </p>
          </div>

          {error && <p className="caja-error">{error}</p>}

          <p className={cfg.estado_dominio === "verificado" ? "caja-aviso" : "menudo"}>
            <strong>
              {{
                sin_verificar: "Sin dar de alta",
                pendiente_dns: "Esperando a que aparezcan los registros",
                verificado: "✓ Dominio verificado",
                fallo: "El proveedor no encuentra los registros",
              }[cfg.estado_dominio]}
            </strong>
            {cfg.detalle ? ` · ${cfg.detalle}` : ""}
          </p>

          <div className="rejilla">
            <button
              className="primario"
              type="button"
              disabled={!cfg.dominio || dominioOcupado !== null}
              onClick={() => void gestionarDominio("alta")}
            >
              {dominioOcupado === "alta" ? "Dando de alta…" : "Dar de alta el dominio"}
            </button>
            {cfg.registros_dns.length > 0 && (
              <button
                className="fantasma"
                type="button"
                disabled={dominioOcupado !== null}
                onClick={() => void gestionarDominio("comprobar")}
              >
                {dominioOcupado === "comprobar" ? "Comprobando…" : "Ya los he puesto, comprueba"}
              </button>
            )}
          </div>

          {!cfg.dominio && (
            <p className="menudo">
              Primero rellena el dominio arriba y guarda.
            </p>
          )}

          {cfg.registros_dns.length > 0 && (
            <>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th><th>Nombre</th><th>Valor</th><th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.registros_dns.map((r, i) => (
                      <tr key={i}>
                        <td>{r.type ?? "—"}</td>
                        <td><code>{r.name ?? "—"}</code></td>
                        <td>
                          <code style={{ wordBreak: "break-all" }}>{r.value ?? "—"}</code>
                          {r.priority !== undefined && ` · prioridad ${r.priority}`}
                        </td>
                        <td>{r.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="menudo">
                Cópialos tal cual, sin añadir el dominio al final del nombre:
                casi todos los paneles de DNS lo ponen ellos, y duplicarlo es
                el fallo que más tiempo se lleva. La propagación puede tardar
                horas — si al comprobar sigue en espera, no está mal puesto,
                está tardando.
              </p>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------
          Opción A de la decisión 0004.
          ------------------------------------------------------------ */}
      <div className="tarjeta">
        <div>
          <h2>Usar tu propio proveedor</h2>
          <p className="sutil">
            Si ya tienes Resend, Amazon SES o un SMTP montado, puedes enviar
            por ahí en vez de por nuestra infraestructura. Tu dominio y tu
            reputación, sin compartir IP con nadie.
          </p>
        </div>

        <label className="campo">
          <span>Modo</span>
          <select value={cfg.modo}
                  onChange={(e) => campo("modo", e.target.value as Config["modo"])}>
            <option value="gestionado">Enviar por Prospector (recomendado)</option>
            <option value="propio">Usar mi proveedor</option>
          </select>
        </label>

        {cfg.modo === "propio" && (
          <>
            <label className="campo">
              <span>Proveedor</span>
              <select value={cfg.proveedor ?? ""}
                      onChange={(e) =>
                        campo("proveedor", (e.target.value || null) as Config["proveedor"])}>
                <option value="">Elige…</option>
                <option value="resend">Resend</option>
                <option value="ses">Amazon SES</option>
                <option value="smtp">SMTP</option>
              </select>
            </label>

            {credencial?.configurada ? (
              <div className="fila-cabeza">
                <div>
                  <strong style={{ fontSize: "0.9375rem" }}>
                    Credencial guardada · <code>{credencial.pista}</code>
                  </strong>
                  <div className="menudo">
                    {credencial.actualizada_en
                      ? new Date(credencial.actualizada_en).toLocaleString("es-ES")
                      : "—"}
                  </div>
                </div>
                <button className="fantasma" type="button" onClick={borrarCredencial}>
                  Borrar
                </button>
              </div>
            ) : (
              <p className="menudo">Sin credencial: todavía no se enviaría por tu proveedor.</p>
            )}

            <label className="campo">
              <span>{credencial?.configurada ? "Sustituir la credencial" : "Pegar la credencial"}</span>
              <input type="password" value={secreto} autoComplete="off" spellCheck={false}
                     placeholder="re_… · clave de SES · usuario:contraseña de SMTP"
                     onChange={(e) => setSecreto(e.target.value)} />
            </label>

            <p className="menudo">
              Se guarda cifrada en el Vault de Supabase y no vuelve a salir de
              ahí: la lee la función de envío con identidad de servidor. Desde
              esta pantalla no se puede recuperar — si la pierdes, generas otra
              en tu proveedor y la pegas aquí.
            </p>

            <div className="acciones">
              <button className="primario" type="button" onClick={guardarCredencial}
                      disabled={secreto.trim().length < 12}>
                Guardar credencial
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
