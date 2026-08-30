// ============================================================
// Raíz de la aplicación.
//
// De momento solo resuelve la sesión y, cuando la hay, enseña el tenant que
// el trigger de alta creó. Esa pantalla es deliberadamente sosa: su trabajo
// es demostrar que la cadena entera funciona — registro → trigger → perfil →
// RLS → dato visible. Las tres pantallas del MVP (onboarding, campañas,
// leads) van encima de esto.
// ============================================================

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Entrar } from "./pages/Entrar";
import { Registro } from "./pages/Registro";
import { supabase } from "./lib/supabase";

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

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pantalla, setPantalla] = useState<"entrar" | "registro">("entrar");

  useEffect(() => {
    // getSession primero: al recargar, la sesión ya está en localStorage y
    // sin esto la pantalla parpadearía al formulario de entrada.
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSesion(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) return <main className="centro">Cargando…</main>;

  if (!sesion) {
    return (
      <main className="centro">
        {pantalla === "entrar"
          ? <Entrar irARegistro={() => setPantalla("registro")} />
          : <Registro irAEntrar={() => setPantalla("entrar")} />}
      </main>
    );
  }

  return <Dentro />;
}

function Dentro() {
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
    <main className="centro">
      <section className="tarjeta">
        <h1>Dentro</h1>

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
          Estos datos llegan con la clave publicable y los filtra la RLS: lo
          que ves aquí es lo tuyo, no lo de la base.
        </p>

        <button type="button" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </section>
    </main>
  );
}
