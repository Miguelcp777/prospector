// ============================================================
// Importar una lista de contactos.
//
// Tres pasos: de dónde sale, qué columna es cada cosa, y qué va a entrar.
//
// La detección de columnas PROPONE; no decide. El paso del medio enseña las
// cinco primeras filas **tal como van a quedar guardadas**, no tal como
// venían: ver el resultado y no la entrada es lo que evita mapear mal y
// escribirle a dos mil personas llamándolas por el nombre de su ciudad.
//
// El parseo entero ocurre aquí, en el navegador. El archivo no se sube a
// ningún sitio: lo que viaja son las filas ya mapeadas, en una sola llamada
// a `guardar_lista`. Ver supabase/054_listas_de_contactos.sql.
// ============================================================

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  leerTexto,
  leerPegado,
  tokenizar,
  pareceQueHayCabecera,
  DELIMITADORES,
  type Codificacion,
} from "../lib/tabla-importada";
import { detectar, porQue, type Rol } from "../lib/deteccion-de-columnas";

const MAX_BYTES = 5 * 1024 * 1024;
const TOPE_FILAS = 2000;

const ROLES: Array<[Rol, string, boolean]> = [
  ["email", "Correo electrónico", true],
  ["nombre", "Nombre", false],
  ["empresa", "Empresa", false],
  ["telefono", "Teléfono", false],
  ["web", "Web", false],
];

// El texto se guarda literal en la base junto a la fecha y a quién lo marcó.
// No es «acepto las condiciones»: nombra la base legal, que es lo que
// convierte un supuesto en un acto registrado con autor.
const DECLARACION =
  "Confirmo que estas personas son clientes o contactos de mi negocio, que me " +
  "facilitaron su correo y que puedo escribirles sobre mis servicios. Prospector " +
  "actúa como encargado del tratamiento; el responsable soy yo.";

type Origen = "csv" | "xlsx" | "portapapeles";

export function ImportarLista({
  alGuardar,
  alCancelar,
}: {
  alGuardar: (listaId: string) => void;
  alCancelar: () => void;
}) {
  const [paso, setPaso] = useState<"origen" | "mapeo" | "revision">("origen");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [origen, setOrigen] = useState<Origen>("csv");
  const [archivo, setArchivo] = useState<{ nombre: string; mime: string; tamano: number } | null>(null);
  const [codificacion, setCodificacion] = useState<Codificacion | null>(null);
  const [delimitador, setDelimitador] = useState(";");
  const [textoCrudo, setTextoCrudo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);

  const [todas, setTodas] = useState<string[][]>([]);
  const [hayCabecera, setHayCabecera] = useState(true);
  const [mapeo, setMapeo] = useState<Partial<Record<Rol, number>>>({});
  const [detalles, setDetalles] = useState<Record<string, string>>({});
  const [ambiguo, setAmbiguo] = useState(false);

  const [nombre, setNombre] = useState("");
  const [declarado, setDeclarado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cabeceras = hayCabecera
    ? (todas[0] ?? []).map((c, i) => (c.trim() === "" ? `Columna ${i + 1}` : c.trim()))
    : (todas[0] ?? []).map((_, i) => `Columna ${i + 1}`);
  const datos = hayCabecera ? todas.slice(1) : todas;

  function analizar(filas: string[][], conCabecera?: boolean) {
    const cab = conCabecera ?? pareceQueHayCabecera(filas);
    setHayCabecera(cab);
    const titulos = cab
      ? (filas[0] ?? []).map((c, i) => (c.trim() === "" ? `Columna ${i + 1}` : c.trim()))
      : (filas[0] ?? []).map((_, i) => `Columna ${i + 1}`);
    const cuerpo = cab ? filas.slice(1) : filas;
    const d = detectar(titulos, cuerpo);
    const m: Partial<Record<Rol, number>> = {};
    const porQues: Record<string, string> = {};
    for (const [rol] of ROLES) {
      const c = d.propuesta[rol];
      if (c) {
        m[rol] = c.indice;
        porQues[rol] = porQue(c);
      }
    }
    setMapeo(m);
    setDetalles(porQues);
    setAmbiguo(d.ambiguo);
    setPaso("mapeo");
  }

  async function elegirArchivo(f: File) {
    setError(null);
    if (f.size > MAX_BYTES) {
      setError(`El archivo pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son 5 MB.`);
      return;
    }
    const esExcel = /\.xlsx$/i.test(f.name);
    try {
      if (esExcel) {
        // Import dinámico: la librería solo viaja si alguien suelta un .xlsx.
        const { leerXlsx } = await import("../lib/excel");
        const hoja = await leerXlsx(f);
        if (hoja.filas.length === 0) { setError("Esa hoja no tiene ninguna fila."); return; }
        setOrigen("xlsx");
        setHojas(hoja.hojas);
        setCodificacion(null);
        setArchivo({ nombre: f.name, mime: f.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", tamano: f.size });
        setTodas(hoja.filas);
        analizar(hoja.filas);
      } else {
        const t = leerTexto(await f.arrayBuffer());
        if (t.filas.length === 0) { setError("El archivo no tiene ninguna fila."); return; }
        setOrigen("csv");
        setHojas([]);
        setCodificacion(t.codificacion);
        setDelimitador(t.delimitador);
        setTextoCrudo(null);
        setArchivo({ nombre: f.name, mime: f.type || "text/csv", tamano: f.size });
        setTodas(t.filas);
        analizar(t.filas);
      }
    } catch (e) {
      setError(`No he podido leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function pegar(texto: string) {
    setError(null);
    if (texto.trim() === "") return;
    const t = leerPegado(texto);
    if (t.filas.length === 0) { setError("No he encontrado ninguna fila en lo que has pegado."); return; }
    setOrigen("portapapeles");
    setArchivo(null);
    setHojas([]);
    setCodificacion(null);
    setDelimitador(t.delimitador);
    setTextoCrudo(texto);
    setTodas(t.filas);
    analizar(t.filas);
  }

  /** Vuelve a trocear con otro separador, sin volver a pedir el archivo. */
  function cambiarDelimitador(d: string) {
    if (textoCrudo === null) return;
    setDelimitador(d);
    const filas = tokenizar(textoCrudo, d);
    setTodas(filas);
    analizar(filas, hayCabecera);
  }

  // Las filas tal y como se van a guardar. Es lo que se previsualiza.
  const preparadas = datos
    .map((f, i) => ({
      fila: i + 1,
      email: (f[mapeo.email ?? -1] ?? "").trim().toLowerCase(),
      nombre: (f[mapeo.nombre ?? -1] ?? "").trim(),
      empresa: (f[mapeo.empresa ?? -1] ?? "").trim(),
      telefono: (f[mapeo.telefono ?? -1] ?? "").trim(),
      web: (f[mapeo.web ?? -1] ?? "").trim(),
      extra: Object.fromEntries(
        cabeceras
          .map((c, j) => [c, (f[j] ?? "").trim()] as const)
          .filter(([, v], j) => v !== "" && !Object.values(mapeo).includes(j)),
      ),
    }))
    .filter((r) => Object.values(r).some((v) => typeof v === "string" && v !== ""));

  const RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
  const conCorreo = preparadas.filter((r) => r.email !== "");
  const validos = conCorreo.filter((r) => RE.test(r.email));
  const invalidos = conCorreo.length - validos.length;
  const sinCorreo = preparadas.length - conCorreo.length;
  const unicos = new Set(validos.map((r) => r.email));
  const repetidos = validos.length - unicos.size;
  const dominios = new Set([...unicos].map((e) => e.split("@")[1]));
  const rol = [...unicos].filter((e) => /^(info|contacto|admin|ventas|hola|soporte|comercial)@/.test(e)).length;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { data, error: fallo } = await supabase.rpc("guardar_lista", {
      p_nombre: nombre,
      p_origen: origen,
      p_archivo_nombre: archivo?.nombre ?? null,
      p_archivo_mime: archivo?.mime ?? null,
      p_archivo_tamano: archivo?.tamano ?? null,
      p_codificacion: codificacion,
      p_cabeceras: cabeceras,
      p_mapeo: Object.fromEntries(
        Object.entries(mapeo).map(([r, i]) => [r, cabeceras[i as number] ?? `Columna ${(i as number) + 1}`]),
      ),
      p_consentimiento_texto: DECLARACION,
      p_filas: preparadas,
    });
    setGuardando(false);
    if (fallo) { setError(fallo.message); return; }
    alGuardar(data as string);
  }

  // -----------------------------------------------------------------------

  if (paso === "origen") {
    return (
      <section className="panel">
        <div className="cabecera">
          <div className="cabecera-texto">
            <span className="rotulo">Paso 1 de 3 · el archivo</span>
            <h1>Importar una lista</h1>
            {/* Corta, o el párrafo se lleva el ancho entero de `.cabecera` y
                el botón cae a la fila de abajo. El resto, debajo. */}
            <p className="sutil">Sube el archivo tal y como lo tengas.</p>
          </div>
          <button className="fantasma" onClick={alCancelar}>Volver</button>
        </div>

        <p className="sutil">
          No hace falta que prepares las columnas ni que las ordenes: te digo
          cuál creo que es cada una y tú lo confirmas.
        </p>

        {error && <p className="caja-error">{error}</p>}

        <div className="rejilla">
          <div>
            <h3>Un archivo</h3>
            <p className="sutil menudo">CSV o Excel (.xlsx), hasta 5 MB y {TOPE_FILAS} contactos.</p>
            <input
              ref={entrada}
              className="sr-only"
              type="file"
              accept=".csv,.tsv,.txt,.xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void elegirArchivo(f);
              }}
            />
            <button className="secundario" onClick={() => entrada.current?.click()}>
              Elegir archivo
            </button>
          </div>

          <div>
            <h3>O pégalo</h3>
            <p className="sutil menudo">
              Copia las celdas en Excel o en Google Sheets y pégalas aquí. Es
              lo más rápido cuando son pocas.
            </p>
            <textarea
              rows={5}
              placeholder="Pega aquí las celdas…"
              onPaste={(e) => {
                const t = e.clipboardData.getData("text/plain");
                if (t) { e.preventDefault(); pegar(t); }
              }}
              onBlur={(e) => { if (e.target.value.trim() !== "") pegar(e.target.value); }}
            />
          </div>
        </div>
      </section>
    );
  }

  if (paso === "mapeo") {
    return (
      <section className="panel">
        <div className="cabecera">
          <div className="cabecera-texto">
            <span className="rotulo">Paso 2 de 3 · las columnas</span>
            <h1>¿Qué es cada columna?</h1>
            <p className="sutil">
              {datos.length} filas · {cabeceras.length} columnas
              {codificacion && ` · leído como ${codificacion}`}
              {hojas.length > 1 && ` · el libro tiene ${hojas.length} hojas, se ha leído «${hojas[0]}»`}
            </p>
          </div>
          <button className="fantasma" onClick={() => setPaso("origen")}>Atrás</button>
        </div>

        {ambiguo && (
          <p className="caja-aviso">
            Hay más de una columna que parece de correos. Comprueba cuál es la
            que quieres usar antes de seguir.
          </p>
        )}
        {mapeo.email === undefined && (
          <p className="caja-error">
            No encuentro una columna de correos. Elige cuál lo es, o revisa el
            archivo: sin correo no se puede escribir a nadie.
          </p>
        )}

        <div className="rejilla">
          {ROLES.map(([r, etiqueta, obligatorio]) => (
            <label className="campo" key={r}>
              <span>{etiqueta}{obligatorio && " *"}</span>
              <select
                value={mapeo[r] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setMapeo((m) => ({ ...m, [r]: v === "" ? undefined : Number(v) }));
                  setDetalles((d) => ({ ...d, [r]: "Elegida a mano" }));
                }}
              >
                <option value="">— ninguna —</option>
                {cabeceras.map((c, i) => (
                  <option key={i} value={i}>{c}</option>
                ))}
              </select>
              {detalles[r] && <small className="sutil">{detalles[r]}</small>}
            </label>
          ))}
        </div>

        <div className="acciones">
          <label className="campo">
            <span>Separador</span>
            <select
              value={delimitador}
              disabled={textoCrudo === null}
              onChange={(e) => cambiarDelimitador(e.target.value)}
            >
              {DELIMITADORES.map((d) => (
                <option key={d} value={d}>{d === "\t" ? "tabulador" : d}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>La primera fila</span>
            <select
              value={hayCabecera ? "titulos" : "datos"}
              onChange={(e) => analizar(todas, e.target.value === "titulos")}
            >
              <option value="titulos">son títulos</option>
              <option value="datos">ya son datos</option>
            </select>
          </label>
        </div>

        <h3>Así van a quedar</h3>
        <p className="sutil menudo">
          Las cinco primeras, ya mapeadas. Si algo está en la columna que no
          es, se ve aquí.
        </p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Fila</th><th>Correo</th><th>Nombre</th><th>Empresa</th><th>Teléfono</th><th>Web</th></tr>
            </thead>
            <tbody>
              {preparadas.slice(0, 5).map((r) => (
                <tr key={r.fila}>
                  <td className="sutil">{r.fila}</td>
                  <td><strong>{r.email || "—"}</strong></td>
                  <td>{r.nombre || "—"}</td>
                  <td>{r.empresa || "—"}</td>
                  <td>{r.telefono || "—"}</td>
                  <td>{r.web || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="acciones">
          <button
            className="primario"
            disabled={mapeo.email === undefined}
            onClick={() => setPaso("revision")}
          >
            Continuar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Paso 3 de 3 · la revisión</span>
          <h1>Revisa antes de guardar</h1>
        </div>
        <button className="fantasma" onClick={() => setPaso("mapeo")}>Atrás</button>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <div className="tabla-scroll">
        <table>
          <tbody>
            <tr><td>Filas del archivo</td><td><strong>{preparadas.length}</strong></td></tr>
            <tr><td>Con un correo utilizable</td><td><strong>{unicos.size}</strong></td></tr>
            <tr><td>Sin correo</td><td>{sinCorreo}</td></tr>
            <tr><td>Con un correo que no lo parece</td><td>{invalidos}</td></tr>
            <tr><td>Repetidos dentro del archivo</td><td>{repetidos}</td></tr>
            <tr><td>Dominios distintos</td><td>{dominios.size}</td></tr>
          </tbody>
        </table>
      </div>

      {unicos.size > 300 && dominios.size / unicos.size > 0.7 && (
        <p className="caja-aviso">
          Estos {unicos.size} contactos están repartidos en {dominios.size}
          {" "}dominios distintos. Una cartera de clientes suele concentrarse en
          unos pocos; tantos dominios distintos es la forma que tiene un
          directorio de empresas. Si es tu cartera, adelante.
        </p>
      )}
      {unicos.size > 1000 && (
        <p className="caja-aviso">
          Más de mil contactos. Una lista de clientes propios casi nunca lo es.
          Si lo es, adelante.
        </p>
      )}
      {rol > 0 && (
        <p className="sutil">
          {rol} de las direcciones son buzones genéricos del tipo <code>info@</code>.
          No es un problema, pero conviene saberlo: a un buzón genérico no le
          escribes a una persona.
        </p>
      )}

      <label className="campo">
        <span>Nombre de la lista</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Clientes de 2026"
        />
        <small className="sutil">Para encontrarla luego. Solo lo ves tú.</small>
      </label>

      {/* `.toggle` y no `.campo`: dentro de un `.campo` el texto va en el
          <span> de la etiqueta, que el CSS pinta en versalitas de 11 px —
          correcto para rotular un campo, y lo peor posible para la frase que
          sostiene el marco legal de la lista. Y la casilla se come el
          `input { width: 100% }` global, que `.toggle` ya acota a 17 px. */}
      <label className="toggle declaracion">
        <input
          type="checkbox"
          checked={declarado}
          onChange={(e) => setDeclarado(e.target.checked)}
        />
        <span>
          <strong>{DECLARACION}</strong>
          <small>
            Se guarda esta frase, la fecha y tu usuario. Es lo que permite
            responder si alguien pregunta de dónde salió su dirección.
          </small>
        </span>
      </label>

      <div className="acciones">
        <button
          className="primario"
          disabled={guardando || !declarado || nombre.trim() === "" || unicos.size === 0}
          onClick={() => void guardar()}
        >
          {guardando ? "Guardando…" : `Guardar ${unicos.size} contactos`}
        </button>
      </div>
    </section>
  );
}
