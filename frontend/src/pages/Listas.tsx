// ============================================================
// Listas de contactos.
//
// Los contactos que el cliente ya tiene, frente a los que encuentra el
// descubrimiento. Viven fuera de las campañas y se vuelcan en la que haga
// falta, tantas veces como quiera.
//
// Esta pantalla decide sola cuál de las tres vistas enseña —índice, detalle
// o asistente—, igual que `Campanas.tsx` con `Campana.tsx`. La navegación de
// la aplicación sigue siendo un `useState`, no un router.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ImportarLista } from "./ImportarLista";
import { Lista } from "./Lista";

type Fila = {
  id: string;
  nombre: string;
  origen: string;
  filas_validas: number;
  filas_leidas: number;
  subido_por_email: string | null;
  creado_en: string;
};

const ORIGENES: Record<string, string> = {
  csv: "CSV",
  xlsx: "Excel",
  portapapeles: "pegado",
};

export function Listas() {
  const [vista, setVista] = useState<"indice" | "importar" | "detalle">("indice");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [listas, setListas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: fallo } = await supabase
      .from("listas_de_contactos")
      .select("id, nombre, origen, filas_validas, filas_leidas, subido_por_email, creado_en")
      .order("creado_en", { ascending: false });
    setCargando(false);
    if (fallo) { setError(fallo.message); return; }
    setListas((data ?? []) as Fila[]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (vista === "importar") {
    return (
      <ImportarLista
        alCancelar={() => setVista("indice")}
        alGuardar={(id) => { setAbierta(id); setVista("detalle"); void cargar(); }}
      />
    );
  }

  if (vista === "detalle" && abierta) {
    return <Lista id={abierta} alVolver={() => { setVista("indice"); void cargar(); }} />;
  }

  return (
    <section className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Prospección</span>
          <h1>Tus <span className="destacado">listas</span></h1>
          {/* Una línea, y la explicación larga debajo. `.cabecera` reparte el
              ancho entre el texto y el botón, y el texto lo pide por su
              contenido: un párrafo de cuatro líneas se lleva los 960 px y
              tira el botón a la fila siguiente. */}
          <p className="sutil">
            Los contactos que ya tienes. Los aportas tú, no la búsqueda.
          </p>
        </div>
        <button className="primario" onClick={() => setVista("importar")}>
          Importar una lista
        </button>
      </div>

      <p className="sutil">
        Tus clientes, los de tu CRM, los de una hoja de cálculo. Se suben una
        vez y se pueden usar en las campañas que quieras. No tienen nada que
        ver con los leads que encuentra la búsqueda: estos los aportas tú.
      </p>

      {error && <p className="caja-error">{error}</p>}

      {!cargando && listas.length === 0 && (
        <p className="sutil">
          Todavía no has subido ninguna. Sube el archivo tal y como lo tengas
          —CSV o Excel— y te digo qué columna creo que es el correo.
        </p>
      )}

      {listas.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Lista</th>
                <th>Contactos</th>
                <th>Origen</th>
                <th>Subida por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {listas.map((l) => (
                <tr key={l.id}>
                  <td>
                    <button
                      className="fantasma"
                      onClick={() => { setAbierta(l.id); setVista("detalle"); }}
                    >
                      <strong>{l.nombre}</strong>
                    </button>
                  </td>
                  <td>
                    <strong>{l.filas_validas}</strong>
                    {l.filas_leidas !== l.filas_validas && (
                      <span className="sutil"> de {l.filas_leidas}</span>
                    )}
                  </td>
                  <td className="sutil">{ORIGENES[l.origen] ?? l.origen}</td>
                  <td className="sutil">{l.subido_por_email ?? "—"}</td>
                  <td className="sutil">{new Date(l.creado_en).toLocaleDateString("es-ES")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
