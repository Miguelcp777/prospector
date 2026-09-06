// ============================================================
// Tema claro / oscuro, para toda la app.
//
// El tema vive en un atributo del <html>, no en una clase de React: así lo
// ve el CSS entero —app, studio y pantalla de acceso— sin que ningún
// componente tenga que enterarse ni pasarlo hacia abajo.
//
// Se aplica también desde un script en index.html, antes de que React
// monte. Sin eso, la app pinta un fotograma en oscuro y luego salta al
// claro: el destello blanco al revés, que es peor porque deslumbra.
// ============================================================

export type Tema = "claro" | "oscuro";

const CLAVE = "prospector-tema";

/** Lo que el sistema operativo dice preferir. */
export function temaDelSistema(): Tema {
  return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "claro"
    : "oscuro";
}

/**
 * El tema elegido, o el del sistema si nunca se ha elegido.
 *
 * Que no haya elección guardada no es lo mismo que haber elegido oscuro:
 * mientras nadie toque el interruptor, la app sigue al sistema y cambia
 * con él.
 */
export function temaGuardado(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === "claro" || v === "oscuro") return v;
  } catch {
    /* navegador sin almacenamiento: se sigue al sistema */
  }
  return temaDelSistema();
}

/** La barra del navegador en móvil se pinta de este color. */
const BARRA: Record<Tema, string> = { oscuro: "#08060f", claro: "#f7f6fb" };

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", BARRA[tema]);
}

export function guardarTema(tema: Tema) {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    /* sin almacenamiento el cambio vale para esta sesión y ya */
  }
  aplicarTema(tema);
}
