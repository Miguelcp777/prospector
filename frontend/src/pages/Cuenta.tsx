// ============================================================
// Cuenta: el tenant que el trigger de alta creó.
//
// Sigue siendo sosa a propósito. Su trabajo es que, cuando algo se rompa en
// el aislamiento, se vea aquí antes que en una pantalla llena de datos.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Tenant = {
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

export function Cuenta() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("email, rol, tenants(nombre, vertical, ciudad, plan)")
      .single()
      .then(({ data, error: fallo }) => {
        if (fallo) setError(fallo.message);
        else setPerfil(data as unknown as Perfil);
      });
  }, []);

  return (
    <section className="panel">
      <h1>Cuenta</h1>

      {error && <p className="error">{error}</p>}
      {!perfil && !error && <p className="sutil">Cargando tu cuenta…</p>}

      {perfil && !perfil.tenants && (
        <p className="error">
          Tu usuario no tiene tenant. Eso significa que el trigger de alta no
          llegó a ejecutarse — sin él la RLS te oculta todo.
        </p>
      )}

      {perfil?.tenants && (
        <dl className="datos">
          <dt>Negocio</dt>
          <dd>{perfil.tenants.nombre}</dd>
          <dt>Vertical</dt>
          <dd>{perfil.tenants.vertical}</dd>
          <dt>Ciudad</dt>
          <dd>{perfil.tenants.ciudad ?? "—"}</dd>
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
        ves aquí es lo tuyo, no lo de la base.
      </p>
    </section>
  );
}
