// ============================================================
// Lista de supresión.
//
// Quien está aquí no recibe correos, y no es una convención del código: un
// trigger de la base rechaza marcar como enviado un mensaje a una dirección
// de esta lista. Ver supabase/012_supresion_y_baja.sql.
//
// No hay botón de borrar, y es deliberado. Quitar a alguien de la lista de
// bajas es justo lo que no debe poder hacerse desde la aplicación: la
// política de `suppressions` no concede DELETE a nadie.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Supresion = {
  id: string;
  tenant_id: string | null;
  email: string;
  motivo: string;
  creado_en: string;
};

const MOTIVOS: Record<string, string> = {
  baja: "Se dio de baja",
  rebote: "El correo rebotó",
  queja: "Puso una queja",
  manual: "Añadida a mano",
};

export function Supresiones() {
  const [lista, setLista] = useState<Supresion[]>([]);
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase
      .from("suppressions")
      .select("id, tenant_id, email, motivo, creado_en")
      .order("creado_en", { ascending: false });
    if (fallo) setError(fallo.message);
    else setLista((data ?? []) as Supresion[]);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function anadir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);

    const limpio = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
      setError("Eso no parece una dirección de correo.");
      return;
    }

    const { error: fallo } = await supabase
      .from("suppressions")
      .insert({ email: limpio, motivo: "manual" });

    if (fallo) {
      // El índice único hace que añadir dos veces falle. No es un error del
      // usuario: el resultado que quería ya se cumple.
      setAviso(fallo.code === "23505"
        ? `${limpio} ya estaba en la lista.`
        : null);
      if (fallo.code !== "23505") setError(fallo.message);
    } else {
      setAviso(`${limpio} no volverá a recibir correos.`);
    }
    setEmail("");
    await cargar();
  }

  if (cargando) {
    return <section className="panel"><p className="sutil">Cargando…</p></section>;
  }

  return (
    <section className="panel">
      <h1>Lista de supresión</h1>

      <p className="sutil">
        Estas direcciones no reciben correos. No es una comprobación del
        código que se pueda olvidar: la base de datos rechaza registrar un
        envío a cualquiera de ellas.
      </p>

      <form className="fila" onSubmit={anadir}>
        <label className="campo">
          <span>Añadir una dirección a mano</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alguien@ejemplo.es"
            autoComplete="off"
          />
        </label>
        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        <button className="primario" type="submit">Añadir a la lista</button>
        <p className="sutil">
          Una vez dentro no se puede sacar desde aquí, a propósito. Si hay
          que revertir una baja, tiene que ser una decisión consciente y con
          rastro, no un clic.
        </p>
      </form>

      {lista.length === 0 && (
        <p className="sutil">
          La lista está vacía. Se irá llenando sola con las bajas que pidan
          los destinatarios desde el enlace de sus correos.
        </p>
      )}

      {lista.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Dirección</th>
                <th>Motivo</th>
                <th>Alcance</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.email}</strong></td>
                  <td>{MOTIVOS[s.motivo] ?? s.motivo}</td>
                  <td>
                    {s.tenant_id === null
                      ? <span className="etiqueta error">Global</span>
                      : <span className="sutil">Solo tus campañas</span>}
                  </td>
                  <td className="sutil">
                    {new Date(s.creado_en).toLocaleDateString("es-ES")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
