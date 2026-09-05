// ============================================================
// Studio de plantillas.
//
// El editor de correos, traído del proyecto autónomo `campaign-studio` a
// una sección de Prospector. Ver docs/decisiones/0003.
//
// Este archivo es la costura: aísla el editor del resto de la app.
//
//   · Los estilos se cargan aquí y solo aquí. Tailwind entra sin preflight
//     —ver estilos-studio.css— y `.studio` acota lo que pueda escaparse.
//   · El nombre que enseña sale de la sesión de Supabase, no de la sesión
//     de invitado del original, que aceptaba cualquier cadena por cabecera.
//   · Se carga con React.lazy desde App: son unas cuantas centenas de kB y
//     quien no entre aquí no tiene por qué descargárselas.
// ============================================================

import { useEffect, useState } from "react";
import StudioClient from "../studio/StudioClient";
import { Toaster } from "../studio/ui/sonner";
import { supabase } from "../lib/supabase";
import "../estilos-studio.css";

export default function Studio() {
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      // El nombre de Google si lo hay; si no, el correo. Nunca "Invitado":
      // aquí siempre hay sesión, porque App no monta esto sin ella.
      const meta = u?.user_metadata as { full_name?: string; name?: string } | undefined;
      setNombre(meta?.full_name ?? meta?.name ?? u?.email ?? "Tu cuenta");
    });
  }, []);

  if (!nombre) return <p className="sutil">Cargando el studio…</p>;

  return (
    <div className="studio">
      <StudioClient displayName={nombre} />
      <Toaster />
    </div>
  );
}
