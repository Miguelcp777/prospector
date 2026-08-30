// ============================================================
// Validación del formulario, en un módulo aparte para poder razonarla —
// y más adelante, probarla — sin montar React alrededor.
//
// Estas reglas NO son la seguridad: la contraseña la valida y la hashea
// Supabase Auth en el servidor. Esto solo evita que el usuario descubra un
// error después del viaje de ida y vuelta.
// ============================================================

/** Mínimo de Supabase Auth por defecto son 6. Pedimos 8: cuesta lo mismo. */
export const LARGO_MINIMO = 8;

export function validarEmail(email: string): string | null {
  if (!email.trim()) return "Escribe tu email.";
  // Deliberadamente laxa. La comprobación de verdad es que llegue el correo
  // de confirmación; una expresión regular estricta rechaza direcciones
  // válidas y no acepta ninguna inválida que importe.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Ese email no tiene buena pinta.";
  }
  return null;
}

export function validarContrasena(contrasena: string): string | null {
  if (!contrasena) return "Escribe una contraseña.";
  if (contrasena.length < LARGO_MINIMO) {
    return `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`;
  }
  return null;
}

/** La "verificación de contraseña": el segundo campo tiene que coincidir. */
export function validarRepeticion(
  contrasena: string,
  repeticion: string,
): string | null {
  if (!repeticion) return "Repite la contraseña.";
  if (contrasena !== repeticion) return "Las dos contraseñas no coinciden.";
  return null;
}

export type DatosAlta = {
  email: string;
  contrasena: string;
  repeticion: string;
  negocio: string;
  vertical: string;
  ciudad: string;
};

/**
 * Devuelve el primer problema encontrado, o null si el formulario está listo.
 * Un error cada vez: una lista de seis quejas a la vez no se lee.
 */
export function validarAlta(d: DatosAlta): string | null {
  if (!d.negocio.trim()) return "Escribe el nombre de tu negocio.";
  if (!d.vertical.trim()) return "Elige a qué se dedica tu negocio.";
  return (
    validarEmail(d.email) ??
    validarContrasena(d.contrasena) ??
    validarRepeticion(d.contrasena, d.repeticion)
  );
}
