// ============================================================
// Cuenta: el tenant que el trigger de alta creó.
//
// Era de solo lectura porque el formulario de registro ya pedía los datos
// del negocio. Con Google eso deja de ser cierto: no hay formulario, y el
// tenant nace con el nombre que Google conozca y la vertical sin definir.
// Sin poder editarlo aquí, esa cuenta no puede inferir segmentos nunca.
//
// La base solo deja tocar nombre, vertical y ciudad: la política de RLS
// acota las filas y el GRANT por columna acota los campos, así que
// `max_consultas_mes` y `plan` no se pueden mover desde el navegador
// aunque alguien lo intente por su cuenta. Ver 021.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Tenant = {
  id: string;
  nombre: string;
  vertical: string;
  ciudad: string | null;
  plan: string;
};

type Perfil = {
  email: string;
  rol: string;
  tenants: Tenant | null;
};

/** La vertical que pone el trigger cuando nadie se la ha dicho. */
export const SIN_DEFINIR = "sin_definir";

export function Cuenta() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [vertical, setVertical] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("email, rol, tenants(id, nombre, vertical, ciudad, plan)")
      .single()
      .then(({ data, error: fallo }) => {
        if (fallo) { setError(fallo.message); return; }
        const p = data as unknown as Perfil;
        setPerfil(p);
        setNombre(p.tenants?.nombre ?? "");
        // 'sin_definir' es una marca interna, no algo que se le enseñe a
        // nadie: el campo aparece vacío para que se escriba encima.
        setVertical(p.tenants?.vertical === SIN_DEFINIR ? "" : p.tenants?.vertical ?? "");
        setCiudad(p.tenants?.ciudad ?? "");
      });
  }, []);

  const incompleto = perfil?.tenants?.vertical === SIN_DEFINIR;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil?.tenants) return;

    if (!nombre.trim())   { setError("El negocio necesita un nombre."); return; }
    if (!vertical.trim()) { setError("Elige a qué se dedica tu negocio."); return; }

    setError(null);
    setGuardando(true);
    const { error: fallo } = await supabase.from("tenants").update({
      nombre: nombre.trim(),
      vertical: vertical.trim(),
      ciudad: ciudad.trim() || null,
    }).eq("id", perfil.tenants.id);
    setGuardando(false);

    if (fallo) { setError(fallo.message); return; }
    setGuardado(true);
    setPerfil({ ...perfil, tenants: {
      ...perfil.tenants,
      nombre: nombre.trim(), vertical: vertical.trim(), ciudad: ciudad.trim() || null,
    } });
  }

  return (
    <section className="panel">
      <div className="cabecera-texto">
        <span className="rotulo">Tu negocio</span>
        <h1>Cuenta</h1>
      </div>

      {error && <p className="caja-error">{error}</p>}
      {!perfil && !error && <p className="sutil">Cargando tu cuenta…</p>}

      {perfil && !perfil.tenants && (
        <p className="caja-error">
          Tu usuario no tiene tenant. Eso significa que el trigger de alta no
          llegó a ejecutarse — sin él la RLS te oculta todo.
        </p>
      )}

      {incompleto && (
        <p className="caja-aviso">
          Falta decir a qué se dedica tu negocio. La inferencia de segmentos
          se apoya en ese dato para saber a quién dirigirse, así que hasta
          que lo completes propondrá cualquier cosa.
        </p>
      )}

      {perfil?.tenants && (
        <form className="tarjeta" onSubmit={guardar}>
          <h2>Datos del negocio</h2>

          <label className="campo">
            <span>Nombre del negocio</span>
            <input value={nombre} placeholder="Clínica Ejemplo"
                   onChange={(e) => { setNombre(e.target.value); setGuardado(false); }} />
          </label>

          <label className="campo">
            <span>¿A qué se dedica?</span>
            <input list="verticales" value={vertical} placeholder="fisioterapia"
                   onChange={(e) => { setVertical(e.target.value); setGuardado(false); }} />
            <datalist id="verticales">
              <option value="fisioterapia" />
            </datalist>
            <small className="sutil">
              Hoy solo fisioterapia tiene taxonomía curada. Con otra vertical la
              inferencia sigue funcionando, pero sin ese apoyo.
            </small>
          </label>

          <label className="campo">
            <span>Ciudad</span>
            <input value={ciudad} placeholder="Valencia"
                   onChange={(e) => { setCiudad(e.target.value); setGuardado(false); }} />
          </label>

          <div className="acciones">
            <button className="primario" type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardado && <span className="etiqueta lista">guardado</span>}
          </div>
        </form>
      )}

      {perfil?.tenants && (
        <dl className="datos">
          <dt>Plan</dt>
          <dd>{perfil.tenants.plan}</dd>
          <dt>Tu email</dt>
          <dd>{perfil.email}</dd>
          <dt>Tu rol</dt>
          <dd>{perfil.rol}</dd>
        </dl>
      )}

      <p className="sutil">
        Estos datos llegan con la clave publicable y los filtra la RLS: lo que
        ves aquí es lo tuyo, no lo de la base. El plan y los topes de gasto se
        ven pero no se tocan — los cambia quien lleva el proyecto.
      </p>
    </section>
  );
}
