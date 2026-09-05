// ============================================================
// Incidencias: qué se ha roto, por qué, y qué hacer.
//
// Antes un fallo se veía una vez, en rojo, encima de un formulario, y
// desaparecía al recargar. Cuando llegaba el aviso —"no me deja inferir"—
// no quedaba rastro de qué pasó ni de cuándo empezó.
//
// El diagnóstico sale de un catálogo, no del modelo. El motivo está
// explicado en lib/diagnostico.ts y se resume así: el primer fallo que hubo
// que diagnosticar fue que se había agotado el saldo de Anthropic, y un
// diagnosticador que llama a Anthropic no habría podido decirlo.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  diagnosticar, promptParaIT,
  type Diagnostico, type Incidencia,
} from "../lib/diagnostico";

const RESPONSABLE: Record<Diagnostico["responsable"], string> = {
  tu: "Lo puedes arreglar tú",
  it: "Necesita a quien lleva el código",
  proveedor: "Depende de un proveedor externo",
};

export function Incidencias() {
  const [filas, setFilas] = useState<Incidencia[]>([]);
  const [verCerradas, setVerCerradas] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase.from("incidencias")
      .select("id, origen, operacion, codigo, mensaje, detalle, estado, veces, primera_en, ultima_en")
      .order("ultima_en", { ascending: false })
      .limit(100);
    if (!verCerradas) q = q.eq("estado", "abierta");
    const { data } = await q;
    setFilas((data ?? []) as Incidencia[]);
    setCargando(false);
  }, [verCerradas]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(id: string, estado: string) {
    await supabase.from("incidencias").update({ estado }).eq("id", id);
    await cargar();
  }

  const abiertas = filas.filter((f) => f.estado === "abierta").length;

  return (
    <div className="panel">
      <div className="cabecera">
        <div className="cabecera-texto">
          <span className="rotulo">Estado</span>
          <h1>Incidencias</h1>
          <p className="sutil">
            Lo que ha fallado, agrupado y con lo que sabemos de cada caso. Si
            algo no funciona, empieza aquí antes de escribir a nadie.
          </p>
        </div>
      </div>

      <div className="rejilla">
        <select value={verCerradas ? "todas" : "abiertas"}
                onChange={(e) => setVerCerradas(e.target.value === "todas")}>
          <option value="abiertas">Solo abiertas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {cargando && <p className="sutil">Cargando…</p>}

      {!cargando && filas.length === 0 && (
        <div className="tarjeta">
          <h2>{verCerradas ? "No hay incidencias" : "Nada roto ahora mismo"}</h2>
          <p className="sutil">
            Aquí aparecen los fallos según ocurren, con su diagnóstico y un
            texto listo para reenviar. Que esté vacío es la buena noticia.
          </p>
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <>
          <p className="sutil">
            {abiertas} abierta{abiertas === 1 ? "" : "s"} de {filas.length}
          </p>
          <div className="lista">
            {filas.map((i) => (
              <Ficha key={i.id} i={i} alCambiarEstado={cambiarEstado} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Ficha({
  i, alCambiarEstado,
}: {
  i: Incidencia;
  alCambiarEstado: (id: string, estado: string) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const dx = diagnosticar(i.mensaje);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(promptParaIT(i, dx));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles: se deja el texto a la vista para
      // seleccionarlo a mano, que es peor pero funciona.
      setAbierta(true);
    }
  }

  return (
    <article className="tarjeta">
      <div className="fila-cabeza">
        <div>
          <strong style={{ fontSize: "0.9375rem" }}>
            {dx ? dx.causa : i.operacion ?? i.origen}
          </strong>
          <div className="menudo">
            {i.operacion ?? i.origen}
            {i.veces > 1 && ` · ${i.veces} veces`}
            {" · "}
            {new Date(i.ultima_en).toLocaleString("es-ES", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </div>
        </div>
        <span className={`etiqueta ${i.estado === "abierta" ? "" : "lista"}`}>
          {i.estado}
        </span>
      </div>

      {dx ? (
        <>
          <p className="menudo">{RESPONSABLE[dx.responsable]}</p>
          <ol className="pasos-arreglo">
            {dx.arreglo.map((p, n) => <li key={n}>{p}</li>)}
          </ol>
          {dx.bloquea && (
            <p className="caja-aviso">Mientras tanto no funciona: {dx.bloquea}</p>
          )}
        </>
      ) : (
        <p className="caja-aviso">
          Este fallo no está en el catálogo: es la primera vez que aparece. El
          texto de abajo lleva todo lo que hace falta para que alguien lo mire.
        </p>
      )}

      {abierta && (
        <>
          <div>
            <p className="menudo" style={{ marginBottom: 6 }}>Mensaje original</p>
            <pre className="cuerpo" style={{ fontSize: "0.8125rem" }}>{i.mensaje}</pre>
          </div>
          <div>
            <p className="menudo" style={{ marginBottom: 6 }}>
              Texto para enviar a quien lo tenga que arreglar
            </p>
            <pre className="cuerpo" style={{ fontSize: "0.8125rem" }}>
              {promptParaIT(i, dx)}
            </pre>
          </div>
        </>
      )}

      <div className="acciones">
        <button className="primario" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar informe"}
        </button>
        <button className="secundario" onClick={() => setAbierta(!abierta)}>
          {abierta ? "Plegar" : "Ver detalle"}
        </button>
        {i.estado === "abierta" ? (
          <button className="fantasma" style={{ marginLeft: "auto" }}
                  onClick={() => alCambiarEstado(i.id, "resuelta")}>
            Marcar resuelta
          </button>
        ) : (
          <button className="fantasma" style={{ marginLeft: "auto" }}
                  onClick={() => alCambiarEstado(i.id, "abierta")}>
            Reabrir
          </button>
        )}
      </div>
    </article>
  );
}
