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
  tono: string;
  idioma: string;
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
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("campaigns")
      .select("tipo, tono, idioma, firma, llamada_accion")
      .eq("id", campanaId).single()
      .then(({ data, error: fallo }) => {
        if (fallo) setError(fallo.message);
        else setC(data as Config);
      });
  }, [campanaId]);

  function cambiar(campo: keyof Config, valor: string) {
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
      firma: c.firma?.trim() || null,
      llamada_accion: c.llamada_accion?.trim() || null,
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

      <div className="acciones">
        <button className="primario" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
        {guardado && <span className="etiqueta lista">guardado</span>}
      </div>
    </div>
  );
}
