// ============================================================
// Cuenta: el negocio, editable entero.
//
// Era de solo lectura porque el formulario de registro ya pedía los datos.
// Con Google eso dejó de ser cierto —no hay formulario— y desde la 051 aquí
// vive el perfil completo: los cuatro esenciales que usan la inferencia y el
// redactor, más el contacto, el domicilio postal y el logo.
//
// Es el mismo formulario que la pantalla de bienvenida, con los campos
// puestos de corrido en vez de en tres pasos. Comparten `CamposDelNegocio` a
// propósito: dos copias del mismo formulario divergen en cuanto se añade un
// campo, y quien lo note será un cliente.
//
// La base sigue acotando qué se puede tocar. La RLS elige la fila y el GRANT
// por columna elige los campos, así que `plan` y `max_consultas_mes` se ven
// y no se mueven desde el navegador aunque alguien lo intente por su cuenta.
// Ver 021 y 051.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  guardarPerfil, leerPerfil, loQueFalta, type PerfilNegocio,
} from "../lib/perfil-negocio";
import { GrupoContacto, GrupoLogo, GrupoNegocio } from "./CamposDelNegocio";
import { ModeloDelCliente } from "./ModeloDelCliente";
import { CorreoDelCliente } from "./CorreoDelCliente";

type Cabecera = { email: string; rol: string; plan: string };

export function Cuenta() {
  const [perfil, setPerfil] = useState<PerfilNegocio | null>(null);
  const [cabecera, setCabecera] = useState<Cabecera | null>(null);
  const [sinTenant, setSinTenant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("email, rol, tenants(plan)").maybeSingle()
      .then(({ data }) => {
        const p = data as unknown as
          { email: string; rol: string; tenants: { plan: string } | null } | null;
        if (p) setCabecera({ email: p.email, rol: p.rol, plan: p.tenants?.plan ?? "—" });
      });

    leerPerfil().then((p) => {
      if (p) setPerfil(p);
      else setSinTenant(true);
    });
  }, []);

  const cambiar = (cambio: Partial<PerfilNegocio>) => {
    setGuardado(false);
    setPerfil((p) => (p ? { ...p, ...cambio } : p));
  };

  const falta = perfil ? loQueFalta(perfil) : [];

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    setError(null);
    setGuardando(true);
    // `cerrarBienvenida` también aquí: una cuenta que completa sus datos en
    // esta pantalla no tiene por qué encontrarse la bienvenida después.
    const r = await guardarPerfil(perfil, { cerrarBienvenida: true });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    setGuardado(true);
  }

  return (
    <section className="panel">
      <div className="cabecera-texto">
        <span className="rotulo">Tu negocio</span>
        <h1>Cuenta</h1>
      </div>

      {error && <p className="caja-error">{error}</p>}
      {!perfil && !sinTenant && !error && <p className="sutil">Cargando tu cuenta…</p>}

      {sinTenant && (
        <p className="caja-error">
          Tu usuario no tiene tenant. Eso significa que el trigger de alta no
          llegó a ejecutarse — sin él la RLS te oculta todo.
        </p>
      )}

      {perfil && falta.length > 0 && (
        <p className="caja-aviso">
          Falta {falta.join(", ")}. La inferencia de segmentos y la redacción
          de los correos se apoyan en esos datos, así que hasta que estén
          propondrán y escribirán cualquier cosa.
        </p>
      )}

      {perfil && (
        <form className="tarjeta" onSubmit={guardar}>
          <h2>Datos del negocio</h2>
          <GrupoNegocio perfil={perfil} cambiar={cambiar} />

          <h2>Cómo te encuentran</h2>
          <GrupoContacto perfil={perfil} cambiar={cambiar} />

          <h2>Tu logo</h2>
          <GrupoLogo perfil={perfil} cambiar={cambiar} />

          <div className="acciones">
            <button className="primario" type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardado && <span className="etiqueta lista">guardado</span>}
          </div>
        </form>
      )}

      {perfil && <CorreoDelCliente />}

      {cabecera && (
        <dl className="datos">
          <dt>Plan</dt>
          <dd>{cabecera.plan}</dd>
          <dt>Tu email</dt>
          <dd>{cabecera.email}</dd>
          <dt>Tu rol</dt>
          <dd>{cabecera.rol}</dd>
        </dl>
      )}

      <p className="sutil">
        Estos datos llegan con la clave publicable y los filtra la RLS: lo que
        ves aquí es lo tuyo, no lo de la base. El plan y los topes de gasto se
        ven pero no se tocan — los cambia quien lleva el proyecto.
      </p>

      {/* Quién paga el modelo. Va aquí y no en una sección propia del menú
          porque es configuración de la cuenta, y porque quien la necesita
          llega buscando «dónde se pone mi clave», no una sección nueva. */}
      {perfil && (
        <>
          <div className="cabecera-texto" style={{ marginTop: "var(--e5)" }}>
            <span className="rotulo">Inteligencia artificial</span>
            <h2>Proveedor de modelo</h2>
          </div>
          <ModeloDelCliente />
        </>
      )}
    </section>
  );
}
