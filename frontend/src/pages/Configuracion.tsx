// ============================================================
// Configuración de la campaña: cómo se escriben sus correos.
//
// Todo esto acaba en el prompt del redactor. Antes el modelo decidía por su
// cuenta el tono, qué pedir y quién firma; ahora lo decide el cliente, que
// es quien pone su nombre en el correo.
//
// La firma es la excepción: no va al prompt, va al pie fijo. Es
// identificación del remitente, y eso no puede quedar a merced de lo que el
// modelo redacte ese día.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Config = {
  tipo: string;
  evitar_ya_contactados: boolean;
  tono: string;
  idioma: string;
  /** La empresa que firma esta campaña. Vacío = la de la cuenta (043). */
  negocio_nombre: string | null;
  firma: string | null;
  llamada_accion: string | null;
};

const TIPOS = [
  { v: "prospeccion",  n: "Prospección",  d: "Primer contacto: no os conocen de nada" },
  { v: "colaboracion", n: "Colaboración", d: "Propones colaborar entre iguales, no vender" },
  { v: "seguimiento",  n: "Seguimiento",  d: "Ya hubo contacto: retomas, no te presentas" },
  { v: "reactivacion", n: "Reactivación", d: "Fue contacto y se enfrió" },
];

const TONOS = [
  { v: "cercano", n: "Cercano",  d: "De usted, pero natural" },
  { v: "formal",  n: "Formal",   d: "Distancia profesional" },
  { v: "directo", n: "Directo",  d: "Frases cortas, al grano" },
];

const IDIOMAS = [
  { v: "es", n: "Español" },
  { v: "ca", n: "Valenciano / catalán" },
  { v: "en", n: "Inglés" },
];

export function Configuracion({ campanaId }: { campanaId: string }) {
  const [c, setC] = useState<Config | null>(null);
  // El nombre de la cuenta, solo para enseñarlo como valor por defecto: es
  // el que se usará si la campaña no pone uno propio.
  const [nombreCuenta, setNombreCuenta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("campaigns")
      .select("tipo, tono, idioma, negocio_nombre, firma, llamada_accion, evitar_ya_contactados")
      .eq("id", campanaId).single()
      .then(({ data, error: fallo }) => {
        if (fallo) setError(fallo.message);
        else setC(data as Config);
      });
  }, [campanaId]);

  useEffect(() => {
    supabase.from("profiles").select("tenants(nombre)").single()
      .then(({ data }) => {
        setNombreCuenta(
          (data as { tenants?: { nombre?: string } } | null)?.tenants?.nombre ?? "",
        );
      });
  }, []);

  function cambiar(campo: keyof Config, valor: string | boolean) {
    setC((prev) => (prev ? { ...prev, [campo]: valor } : prev));
    setGuardado(false);
  }

  async function guardar() {
    if (!c) return;
    setGuardando(true);
    setError(null);
    const { error: fallo } = await supabase.from("campaigns").update({
      tipo: c.tipo,
      tono: c.tono,
      idioma: c.idioma,
      negocio_nombre: c.negocio_nombre?.trim() || null,
      firma: c.firma?.trim() || null,
      llamada_accion: c.llamada_accion?.trim() || null,
      evitar_ya_contactados: c.evitar_ya_contactados,
    }).eq("id", campanaId);
    setGuardando(false);
    if (fallo) setError(fallo.message);
    else setGuardado(true);
  }

  if (!c) return null;

  return (
    <div className="tarjeta">
      <div>
        <h2>Cómo se escriben los correos</h2>
        <p className="sutil">
          Estos ajustes van al redactor. Cambiarlos no reescribe los mensajes
          que ya existen — afectan a los siguientes.
        </p>
      </div>

      {error && <p className="caja-error">{error}</p>}

      <label className="campo">
        <span>Empresa que escribe</span>
        <input value={c.negocio_nombre ?? ""}
               onChange={(e) => cambiar("negocio_nombre", e.target.value)}
               placeholder={nombreCuenta || "El nombre de tu cuenta"} />
      </label>
      <p className="menudo">
        Con quién se presenta el correo y quién aparece en el pie legal.
        Déjalo vacío y firma <strong>{nombreCuenta || "tu cuenta"}</strong>,
        que es lo correcto si prospectas para ti. Ponlo cuando la campaña sea
        de otra empresa: sin esto, un correo de una campaña de Woody Tatoo se
        presenta como tu cuenta.
      </p>
      {c.negocio_nombre?.trim() && (
        <p className="menudo">
          Con nombre propio puesto, el sector y la ciudad de tu cuenta dejan
          de ir al redactor: describirían a otra empresa. Lo que cuenta
          entonces es la descripción de la campaña, del paso 1.
        </p>
      )}

      <label className="campo">
        <span>Tipo de campaña</span>
        <select value={c.tipo} onChange={(e) => cambiar("tipo", e.target.value)}>
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.n} — {t.d}</option>)}
        </select>
      </label>

      <div className="rejilla">
        <label className="campo">
          <span>Tono</span>
          <select value={c.tono} onChange={(e) => cambiar("tono", e.target.value)}>
            {TONOS.map((t) => <option key={t.v} value={t.v}>{t.n} — {t.d}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Idioma</span>
          <select value={c.idioma} onChange={(e) => cambiar("idioma", e.target.value)}>
            {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.n}</option>)}
          </select>
        </label>
      </div>

      <label className="campo">
        <span>Quién firma</span>
        <input value={c.firma ?? ""} onChange={(e) => cambiar("firma", e.target.value)}
               placeholder="Marta Ruiz · Fisioterapeuta" />
      </label>
      <p className="menudo">
        Va en el pie, no en el texto: quien responda tiene que saber con quién
        habla. Si lo dejas vacío el pie lleva solo el nombre del negocio.
      </p>

      <label className="campo">
        <span>Qué se pide al final</span>
        <input value={c.llamada_accion ?? ""} onChange={(e) => cambiar("llamada_accion", e.target.value)}
               placeholder="Una llamada de diez minutos esta semana" />
      </label>
      <p className="menudo">
        Es la única frase que decide si hay respuesta. Si lo dejas vacío, la
        elige el modelo.
      </p>

      <hr />

      <label className="fila-cabeza" style={{ cursor: "pointer", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: "0.9375rem" }}>No repetir contactos</strong>
          <p className="menudo">
            No se escribe a direcciones que ya recibieron un correo en otra
            campaña. Desactívalo en campañas de seguimiento o reactivación,
            donde volver a escribir es justo lo que quieres.
          </p>
        </div>
        <input type="checkbox" style={{ width: 18, height: 18, flexShrink: 0 }}
               checked={c.evitar_ya_contactados}
               onChange={(e) => cambiar("evitar_ya_contactados", e.target.checked)} />
      </label>

      <div className="acciones">
        <button className="primario" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
        {guardado && <span className="etiqueta lista">guardado</span>}
      </div>
    </div>
  );
}
