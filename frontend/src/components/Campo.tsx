// Un campo con su etiqueta. Existe para que los formularios se lean como
// formularios y no como una pila de divs.

type Props = {
  etiqueta: string;
  tipo?: string;
  valor: string;
  alCambiar: (valor: string) => void;
  autoComplete?: string;
  placeholder?: string;
  requerido?: boolean;
};

export function Campo({
  etiqueta,
  tipo = "text",
  valor,
  alCambiar,
  autoComplete,
  placeholder,
  requerido,
}: Props) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={requerido}
      />
    </label>
  );
}
