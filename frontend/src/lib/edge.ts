// ============================================================
// Llamar a una Edge Function y enterarse de qué ha fallado.
//
// `supabase.functions.invoke` devuelve, cuando la función responde con un
// código distinto de 2xx, un error cuyo `message` es siempre el mismo:
//
//   "Edge Function returned a non-2xx status code"
//
// El mensaje de verdad va en el cuerpo de la respuesta, colgado del error en
// `context`. Sin leerlo, la pantalla enseña esa frase y no hay forma de
// distinguir "se agotó el saldo del proveedor" de "el negocio no existe".
// Eso pasó de verdad y costó dos despliegues averiguarlo.
//
// Aquí se lee, y además se deja constancia en incidencias.
// ============================================================

import { supabase } from "./supabase";
import { reportar } from "./incidencias";

type Resultado<T> = { datos: T | null; error: string | null };

export async function invocar<T = unknown>(
  funcion: string,
  cuerpo: Record<string, unknown>,
  operacion: string,
): Promise<Resultado<T>> {
  const { data, error: fallo } = await supabase.functions.invoke(funcion, { body: cuerpo });

  if (fallo) {
    const mensaje = await mensajeReal(fallo);
    await reportar(funcion, operacion, mensaje, { funcion });
    return { datos: null, error: mensaje };
  }

  // Las funciones devuelven 200 con {error} en algunos casos previstos.
  const conError = data as { error?: string } | null;
  if (conError?.error) {
    await reportar(funcion, operacion, conError.error, { funcion });
    return { datos: null, error: conError.error };
  }

  return { datos: data as T, error: null };
}

/** Saca el mensaje del cuerpo de la respuesta, que es donde está. */
async function mensajeReal(fallo: unknown): Promise<string> {
  const generico = (fallo as Error)?.message ?? "Fallo desconocido";
  const respuesta = (fallo as { context?: Response }).context;

  if (!respuesta || typeof respuesta.text !== "function") return generico;

  try {
    const texto = await respuesta.text();
    const json = JSON.parse(texto) as { error?: string };
    return json.error ?? texto.slice(0, 300) ?? generico;
  } catch {
    // El cuerpo puede haberse consumido ya, o no ser JSON. Nos quedamos con
    // lo que haya: el código de estado ya dice algo.
    return respuesta.status ? `${generico} (HTTP ${respuesta.status})` : generico;
  }
}
