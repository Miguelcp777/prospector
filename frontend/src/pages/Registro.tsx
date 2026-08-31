// ============================================================
// Alta de cuenta.
//
// El formulario recoge los datos del negocio además del email y la
// contraseña, y los manda como metadata del signUp. El trigger
// `crear_tenant_y_perfil` (supabase/005_alta_de_usuarios.sql) los lee de
// `raw_user_meta_data` y crea el tenant y el perfil de propietario.
//
// Sin ese perfil, `auth_tenant_id()` devuelve null y la RLS oculta todo:
// el usuario entraría a una aplicación vacía sin saber por qué.
// ============================================================

import { useState } from "react";
import { Campo } from "../components/Campo";
import { supabase } from "../lib/supabase";
import { LARGO_MINIMO, validarAlta } from "../lib/validacion";

export function Registro({ irAEntrar }: { irAEntrar: () => void }) {
  const [negocio, setNegocio] = useState("");
  const [vertical, setVertical] = useState("fisioterapia");
  const [ciudad, setCiudad] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repeticion, setRepeticion] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);

    const problema = validarAlta({
      email,
      contrasena,
      repeticion,
      negocio,
      vertical,
      ciudad,
    });
    if (problema) {
      setError(problema);
      return;
    }

    setEnviando(true);
    const { data, error: fallo } = await supabase.auth.signUp({
      email: email.trim(),
      password: contrasena,
      options: {
        // Lo que lee el trigger. Los nombres tienen que coincidir con los
        // del SQL: 'negocio', 'vertical', 'ciudad'.
        data: {
          negocio: negocio.trim(),
          vertical: vertical.trim(),
          ciudad: ciudad.trim(),
        },
      },
    });
    setEnviando(false);

    if (fallo) {
      setError(fallo.message);
      return;
    }

    // Si el proyecto exige confirmar el email, signUp devuelve usuario pero
    // no sesión. Sin este aviso, la pantalla se queda quieta y parece rota.
    if (!data.session) {
      setAviso(
        "Cuenta creada. Te hemos mandado un correo para confirmar la " +
          "dirección: hasta que lo abras no podrás entrar.",
      );
      return;
    }
    // Con la sesión ya abierta, App detecta el cambio y cambia de pantalla.
  }

  return (
    <form className="tarjeta-auth" onSubmit={enviar}>
      <h1>Crear cuenta</h1>
      <p className="sutil">
        Empezamos por tu negocio: es lo que usamos para deducir a qué clientes
        merece la pena que te dirijas.
      </p>

      <Campo
        etiqueta="Nombre del negocio"
        valor={negocio}
        alCambiar={setNegocio}
        placeholder="Clínica Ejemplo"
        autoComplete="organization"
      />

      <label className="campo">
        <span>¿A qué se dedica?</span>
        <input
          list="verticales"
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          placeholder="fisioterapia"
        />
        <datalist id="verticales">
          <option value="fisioterapia" />
        </datalist>
        <small className="sutil">
          Hoy solo fisioterapia tiene taxonomía curada. Con otra vertical la
          inferencia sigue funcionando, pero sin ese apoyo.
        </small>
      </label>

      <Campo
        etiqueta="Ciudad"
        valor={ciudad}
        alCambiar={setCiudad}
        placeholder="Valencia"
        autoComplete="address-level2"
      />

      <hr />

      <Campo
        etiqueta="Email"
        tipo="email"
        valor={email}
        alCambiar={setEmail}
        autoComplete="email"
      />
      <Campo
        etiqueta="Contraseña"
        tipo="password"
        valor={contrasena}
        alCambiar={setContrasena}
        autoComplete="new-password"
        placeholder={`Mínimo ${LARGO_MINIMO} caracteres`}
      />
      <Campo
        etiqueta="Repite la contraseña"
        tipo="password"
        valor={repeticion}
        alCambiar={setRepeticion}
        autoComplete="new-password"
      />

      {error && <p className="error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      <button className="primario" type="submit" disabled={enviando}>
        {enviando ? "Creando cuenta…" : "Crear cuenta"}
      </button>

      <p className="sutil">
        ¿Ya tienes cuenta?{" "}
        <button type="button" className="enlace" onClick={irAEntrar}>
          Entrar
        </button>
      </p>
    </form>
  );
}
