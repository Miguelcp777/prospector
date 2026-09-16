// ============================================================
// Una lista de contactos por dentro.
//
// Aquí vive el registro de origen —de qué archivo salió, quién lo subió,
// qué mapeo se usó y qué declaró— y el botón que la vuelca en una campaña.
//
// La lista es un catálogo, no una fuente viva: volcar COPIA los contactos a
// `leads` y a partir de ahí el lead va por su cuenta. Si alguien se da de
// baja después, no hay nada que propagar —`encolar_redaccion` filtra por
// supresión al encolar y el trigger rechaza el envío— pero sí que enseñar,
// y de eso se encarga la columna `suprimido` de `v_contactos_de_lista`.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Lista = {
  id: string;
  nombre: string;
  origen: string;
  archivo_nombre: string | null;
  codificacion: string | null;
  cabeceras: string[];
  mapeo: Record<string, string>;
  filas_leidas: number;
  filas_validas: number;
  filas_descartadas: number;
  subido_por_email: string | null;
  consentimiento_texto: string | null;
  contactos_borrados_en: string | null;
  creado_en: string;
};

type Contacto = {
  id: string;
  fila: number;
  email: string | null;
  nombre: string | null;
  empresa: string | null;
  telefono: string | null;
  web: string | null;
  estado: string;
  suprimido: boolean;
};

type Volcado = {
  id: string;
  campaign_id: string;
  insertados: number;
  duplicados: number;
  suprimidos: number;
  sin_email: number;
  fuera_por_demo: number;
  creado_en: string;
};

type Campana = { id: string; nombre: string };

const ESTADOS: Record<string, string> = {
  valido: "",
  sin_email: "sin correo",
  email_invalido: "correo no válido",
};

export function Lista({ id, alVolver }: { id: string; alVolver: () => void }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [volcados, setVolcados] = useState<Volcado[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [elegida, setElegida] = useState("");
  const [busca, setBusca] = useState("");
  const [tope, setTope] = useState(200);
  const [volcando, setVolcando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Renombrar. `nombreEditado` a null significa «no se está editando»: con
  // una cadena vacía no se distinguiría de haber borrado el nombre.
  const [nombreEditado, setNombreEditado] = useState<string | null>(null);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  // Borrar la lista, en dos tiempos. Un botón que borra 23 direcciones al
  // primer clic es un botón mal puesto.
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // Qué contacto se está editando, y con qué valores.
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Contacto>>({});

  const cargar = useCallback(async () => {
    const [l, c, v, ca] = await Promise.all([
      supabase.from("listas_de_contactos").select("*").eq("id", id).single(),
      supabase.from("v_contactos_de_lista").select("*").eq("lista_id", id).order("fila"),
      supabase.from("volcados_de_lista").select("*").eq("lista_id", id).order("creado_en", { ascending: false }),
      supabase.from("campaigns").select("id, nombre").neq("estado", "archivada").order("creado_en", { ascending: false }),
    ]);
    if (l.error) { setError(l.error.message); return; }
    setLista(l.data as Lista);
    setContactos((c.data ?? []) as Contacto[]);
    setVolcados((v.data ?? []) as Volcado[]);
    setCampanas((ca.data ?? []) as Campana[]);
    if (!elegida && ca.data?.[0]) setElegida(ca.data[0].id);
  }, [id, elegida]);

  useEffect(() => { void cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Renombrar. Es un UPDATE directo y no una función: la RLS ya lo acota al
   * tenant, y desde la 055 la concesión de UPDATE es **solo** sobre `nombre`
   * —antes alcanzaba a las veinte columnas, incluida la declaración de origen
   * con su fecha, que es lo que convierte un supuesto en un acto registrado—.
   */
  async function renombrar() {
    const limpio = (nombreEditado ?? "").trim();
    if (limpio === "" || !lista || limpio === lista.nombre) { setNombreEditado(null); return; }
    setGuardandoNombre(true);
    setError(null);
    const { error: fallo } = await supabase
      .from("listas_de_contactos").update({ nombre: limpio }).eq("id", id);
    setGuardandoNombre(false);
    if (fallo) { setError(fallo.message); return; }
    setNombreEditado(null);
    void cargar();
  }

  /**
   * Borrar la lista. Va por función porque la decisión no es del navegador:
   * una lista que nunca se volcó desaparece entera, y una que sí se volcó
   * deja su ficha como lápida —archivo, fecha, mapeo, declaración y cifras—
   * para no romper el registro de origen de los leads que salieron de ella.
   * Lo que se borra en los dos casos son las direcciones.
   */
  async function borrarLista() {
    setBorrando(true);
    setError(null);
    const { data, error: fallo } = await supabase.rpc("borrar_lista", { p_lista: id });
    setBorrando(false);
    if (fallo) { setError(fallo.message); setConfirmando(false); return; }
    const r = Array.isArray(data) ? data[0] : data;
    // Si quedó lápida seguimos aquí y hay que recargar; si se fue entera, no
    // hay nada que enseñar y se vuelve al índice.
    if (r?.borrada) alVolver(); else void cargar();
  }

  async function guardarContacto(contactoId: string) {
    setError(null);
    const limpio = (v: unknown) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s === "" ? null : s;
    };
    const { error: fallo } = await supabase
      .from("contactos_de_lista")
      .update({
        // El correo se normaliza aquí igual que lo hace `guardar_lista`, para
        // que una dirección corregida a mano y otra importada no se
        // comporten distinto al volcar.
        email: limpio(borrador.email)?.toLowerCase() ?? null,
        nombre: limpio(borrador.nombre),
        empresa: limpio(borrador.empresa),
        telefono: limpio(borrador.telefono),
        web: limpio(borrador.web),
      })
      .eq("id", contactoId);
    if (fallo) { setError(fallo.message); return; }
    setEditando(null);
    void cargar();
  }

  async function borrarContacto(contactoId: string) {
    setError(null);
    const { error: fallo } = await supabase
      .from("contactos_de_lista").delete().eq("id", contactoId);
    if (fallo) { setError(fallo.message); return; }
    void cargar();
  }

  async function volcar() {
    if (!elegida) return;
    setVolcando(true);
    setError(null);
    setResultado(null);
    const { data, error: fallo } = await supabase.rpc("volcar_lista_en_campana", {
      p_lista: id,
      p_campana: elegida,
    });
    setVolcando(false);
    if (fallo) { setError(fallo.message); return; }
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return;
    // Las cuatro cifras que no son «insertados» son las que explican por qué
    // el total no cuadra, que es lo primero que va a preguntar cualquiera.
    const partes: string[] = [];
    if (r.duplicados > 0) partes.push(`${r.duplicados} ya estaban en la campaña`);
    if (r.suprimidos > 0) partes.push(`${r.suprimidos} están en tu lista de supresión`);
    if (r.sin_email > 0) partes.push(`${r.sin_email} no tenían un correo utilizable`);
    if (r.fuera_por_demo > 0) partes.push(`${r.fuera_por_demo} no caben por el límite de la versión de prueba`);
    setResultado(
      r.insertados === 0
        ? `No se ha añadido ninguno. ${partes.join(", ")}.`
        : `Se han añadido ${r.insertados} leads${partes.length ? `. ${partes.join(", ")}` : ""}.`,
    );
    void cargar();
  }

  if (error && !lista) return <section className="panel"><p className="caja-error">{error}</p></section>;
  if (!lista) return <section className="panel"><p className="sutil">Cargando…</p></section>;

  const suprimidos = contactos.filter((c) => c.suprimido).length;
  const utiles = contactos.filter((c) => c.estado === "valido" && !c.suprimido).length;
  const visibles = contactos
    .filter((c) => {
      if (busca.trim() === "") return true;
      const t = busca.toLowerCase();
      return [c.email, c.nombre, c.empresa].some((v) => (v ?? "").toLowerCase().includes(t));
    })
    .slice(0, tope);

  return (
    <section className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Lista de contactos</span>
          {nombreEditado === null ? (
            <h1>
              {lista.nombre}{" "}
              <button
                className="fantasma menudo"
                onClick={() => setNombreEditado(lista.nombre)}
                title="Cambiar el nombre"
              >
                cambiar el nombre
              </button>
            </h1>
          ) : (
            <div className="acciones">
              <input
                value={nombreEditado}
                autoFocus
                onChange={(e) => setNombreEditado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void renombrar();
                  if (e.key === "Escape") setNombreEditado(null);
                }}
              />
              <button className="primario" disabled={guardandoNombre} onClick={() => void renombrar()}>
                {guardandoNombre ? "Guardando…" : "Guardar"}
              </button>
              <button className="fantasma" onClick={() => setNombreEditado(null)}>Cancelar</button>
            </div>
          )}
          <p className="sutil">
            {lista.filas_leidas} filas leídas · <strong>{utiles}</strong> se pueden usar
            {suprimidos > 0 && ` · ${suprimidos} en tu lista de supresión`}
            {lista.filas_descartadas > 0 && ` · ${lista.filas_descartadas} descartadas`}
          </p>
        </div>
        <button className="fantasma" onClick={alVolver}>Volver a las listas</button>
      </div>

      {/* La lápida. Una lista que ya se volcó no desaparece al borrarla: se
          van las direcciones y se queda la ficha, porque los leads que
          salieron de ella siguen vivos y tienen que poder decir de dónde. */}
      {lista.contactos_borrados_en && (
        <p className="caja-aviso">
          <strong>Los contactos de esta lista se borraron</strong> el{" "}
          {new Date(lista.contactos_borrados_en).toLocaleString("es-ES")}. La ficha
          se queda porque esta lista se usó en alguna campaña: los leads que
          salieron de ella siguen ahí y esto es lo que permite decir de dónde
          salió cada dirección. No quedan direcciones guardadas aquí.
        </p>
      )}

      {suprimidos > 0 && (
        <p className="caja-aviso">
          {suprimidos} de estos contactos pidieron la baja o rebotaron. No
          recibirán correo, y no hace falta que hagas nada: la base lo impide
          sola al enviar.
        </p>
      )}

      {/* Sin contactos no hay nada que volcar, y un botón que no puede hacer
          nada es peor que no tenerlo. */}
      {!lista.contactos_borrados_en && (
        <>
          <h3>Usar en una campaña</h3>
          <div className="acciones">
            <label className="campo">
              <span>Campaña</span>
              <select value={elegida} onChange={(e) => setElegida(e.target.value)}>
                {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <button className="primario" disabled={volcando || !elegida} onClick={() => void volcar()}>
              {volcando ? "Añadiendo…" : "Añadir a la campaña"}
            </button>
          </div>
          <p className="sutil menudo">
            Se copian como leads. Volver a pulsarlo no duplica nada: los que ya
            estén se saltan.
          </p>
          {resultado && <p className="caja-aviso">{resultado}</p>}
        </>
      )}
      {error && <p className="caja-error">{error}</p>}

      <h3>De dónde salió</h3>
      <div className="tabla-scroll">
        <table>
          <tbody>
            <tr><td>Origen</td><td>{lista.origen === "portapapeles" ? "pegado desde una hoja de cálculo" : lista.origen}</td></tr>
            {lista.archivo_nombre && <tr><td>Archivo</td><td>{lista.archivo_nombre}</td></tr>}
            {lista.codificacion && <tr><td>Leído como</td><td>{lista.codificacion}</td></tr>}
            <tr><td>Subida por</td><td>{lista.subido_por_email ?? "—"}</td></tr>
            <tr><td>Fecha</td><td>{new Date(lista.creado_en).toLocaleString("es-ES")}</td></tr>
            <tr>
              <td>Columnas usadas</td>
              <td>{Object.entries(lista.mapeo ?? {}).map(([r, c]) => `${r} → «${c}»`).join(" · ") || "—"}</td>
            </tr>
            <tr><td>Declaración</td><td className="sutil">{lista.consentimiento_texto ?? "—"}</td></tr>
          </tbody>
        </table>
      </div>

      {volcados.length > 0 && (
        <>
          <h3>Ya se ha usado</h3>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Cuándo</th><th>Añadidos</th><th>Ya estaban</th><th>Suprimidos</th><th>Sin correo</th></tr></thead>
              <tbody>
                {volcados.map((v) => (
                  <tr key={v.id}>
                    <td className="sutil">{new Date(v.creado_en).toLocaleString("es-ES")}</td>
                    <td><strong>{v.insertados}</strong></td>
                    <td>{v.duplicados}</td>
                    <td>{v.suprimidos}</td>
                    <td>{v.sin_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Los contactos</h3>
      <label className="campo">
        <span>Buscar</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="correo, nombre o empresa" />
      </label>
      <p className="sutil menudo">
        {visibles.length} de {contactos.length}
        {contactos.length > tope && " · se enseñan los primeros"}
      </p>
      <div className="tabla-scroll">
        <table>
          <thead><tr><th>Fila</th><th>Correo</th><th>Nombre</th><th>Empresa</th><th>Teléfono</th><th></th></tr></thead>
          <tbody>
            {visibles.map((c) => editando === c.id ? (
              <tr key={c.id}>
                <td className="sutil">{c.fila}</td>
                <td><input value={borrador.email ?? ""} placeholder="correo"
                           onChange={(e) => setBorrador({ ...borrador, email: e.target.value })} /></td>
                <td><input value={borrador.nombre ?? ""} placeholder="nombre"
                           onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} /></td>
                <td><input value={borrador.empresa ?? ""} placeholder="empresa"
                           onChange={(e) => setBorrador({ ...borrador, empresa: e.target.value })} /></td>
                <td><input value={borrador.telefono ?? ""} placeholder="teléfono"
                           onChange={(e) => setBorrador({ ...borrador, telefono: e.target.value })} /></td>
                <td>
                  <div className="acciones">
                    <button className="primario" onClick={() => void guardarContacto(c.id)}>Guardar</button>
                    <button className="fantasma" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td className="sutil">{c.fila}</td>
                <td>{c.suprimido ? <s>{c.email}</s> : <strong>{c.email ?? "—"}</strong>}</td>
                <td>{c.nombre ?? "—"}</td>
                <td>{c.empresa ?? "—"}</td>
                <td>{c.telefono ?? "—"}</td>
                <td>
                  {c.suprimido && <span className="etiqueta error">baja</span>}
                  {ESTADOS[c.estado] && <span className="sutil"> {ESTADOS[c.estado]}</span>}
                  <div className="acciones">
                    <button className="fantasma menudo" onClick={() => { setEditando(c.id); setBorrador(c); }}>
                      editar
                    </button>
                    <button className="fantasma menudo" onClick={() => void borrarContacto(c.id)}>
                      quitar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contactos.length > tope && (
        <div className="acciones">
          <button className="secundario" onClick={() => setTope((t) => t + 500)}>Ver más</button>
        </div>
      )}

      {/* Borrar, al final y en dos tiempos, y diciendo antes lo que va a
          pasar. Lo que no dice ningún botón de borrar por defecto es lo
          importante aquí: los leads que ya salieron de esta lista NO se van
          con ella. */}
      {!lista.contactos_borrados_en && (
        <>
          <h3>Borrar esta lista</h3>
          {!confirmando ? (
            <>
              <p className="sutil menudo">
                Se borran las {contactos.length} direcciones.{" "}
                {volcados.length > 0
                  ? "Como ya la has usado en una campaña, la ficha se queda —archivo, fecha, columnas usadas y tu declaración— para poder responder de dónde salió cada lead."
                  : "Como no la has usado en ninguna campaña, desaparece entera."}
              </p>
              <div className="acciones">
                <button className="secundario" onClick={() => setConfirmando(true)}>
                  Borrar la lista
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="caja-error">
                Se van a borrar <strong>{contactos.length} direcciones</strong>, y
                no se pueden recuperar.
                {volcados.length > 0
                  ? " Los leads que ya salieron de esta lista siguen en sus campañas: esto no los toca."
                  : ""}
              </p>
              <div className="acciones">
                <button className="secundario" disabled={borrando} onClick={() => void borrarLista()}>
                  {borrando ? "Borrando…" : "Sí, borrarla"}
                </button>
                <button className="fantasma" onClick={() => setConfirmando(false)}>Cancelar</button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
