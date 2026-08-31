// ============================================================
// El recorrido de una campaña, compartido.
//
// Los pasos se dibujan en dos sitios: la pantalla de la campaña y el
// resumen del lateral. Definirlos aquí evita que se desincronicen — que es
// lo que pasa siempre que la misma lista se escribe dos veces.
//
// El estado no se guarda: lo publica la pantalla de la campaña cuando lo
// calcula a partir de los datos, y el lateral solo lo lee. Un `paso_actual`
// persistido se desincroniza el primer día que alguien haga algo por otra
// vía.
// ============================================================

import { createContext, useContext, useMemo, useState } from "react";

export const PASOS = [
  { nombre: "Describe tu negocio",         corto: "Describir" },
  { nombre: "Elige a quién te diriges",    corto: "Segmentar" },
  { nombre: "Busca clientes potenciales",  corto: "Buscar" },
  { nombre: "Encuentra sus correos",       corto: "Correos" },
  { nombre: "Escribe los mensajes",        corto: "Escribir" },
  { nombre: "Envía los correos",           corto: "Enviar" },
];

export type EstadoPaso = "hecho" | "actual" | "futuro";

export type Recorrido = {
  campana: string;
  /** Un booleano por paso, en el orden de PASOS. */
  hechos: boolean[];
} | null;

type Valor = {
  recorrido: Recorrido;
  publicar: (r: Recorrido) => void;
};

const Contexto = createContext<Valor>({ recorrido: null, publicar: () => {} });

export function ProveedorRecorrido({ children }: { children: React.ReactNode }) {
  const [recorrido, publicar] = useState<Recorrido>(null);
  const valor = useMemo(() => ({ recorrido, publicar }), [recorrido]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useRecorrido() {
  return useContext(Contexto);
}

/**
 * El primero sin hacer es el que toca. Si están todos, no hay ninguno
 * "actual" — y con el envío sin construir eso no puede pasar todavía.
 */
export function estadoDe(hechos: boolean[], i: number): EstadoPaso {
  if (hechos[i]) return "hecho";
  return i === hechos.findIndex((h) => !h) ? "actual" : "futuro";
}
