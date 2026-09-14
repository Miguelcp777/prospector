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

  // ------------------------------------------------------------
  // El hueco de la insignia del hosting.
  //
  // Netlify inyecta «Powered by Netlify» como un iframe fijo abajo a la
  // derecha, con z-index 2147483645. Por debajo de 900 px el editor pone ahí
  // su barra de herramientas —Bloques, Capas, Editar, Vista—, así que la
  // insignia se comía los clics de los dos últimos: se veían, se pulsaban y
  // no pasaba nada.
  //
  // Se ha desactivado en el panel del sitio, pero el editor no puede
  // depender de eso: basta con cambiar de plan, o con que el proveedor la
  // reactive, para que vuelva sin avisar. Si aparece, se mide y se aparta la
  // barra lo justo; si no está, no se reserva ni un píxel.
  // ------------------------------------------------------------
  useEffect(() => {
    const medir = () => {
      const insignia = document.getElementById("nl-badge-frame");
      const ancho = insignia ? Math.ceil(insignia.getBoundingClientRect().width) : 0;
      document.documentElement.style.setProperty("--hueco-insignia", `${ancho}px`);
    };
    medir();
    const observador = new MutationObserver(medir);
    observador.observe(document.body, { childList: true, subtree: false });
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
      document.documentElement.style.removeProperty("--hueco-insignia");
    };
  }, []);

  if (!nombre) return <p className="sutil">Cargando el studio…</p>;

  return (
    <div className="studio">
      <StudioClient displayName={nombre} />
      <Toaster />
    </div>
  );
}
