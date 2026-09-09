// ============================================================
// La plantilla por defecto: «Correo simple».
//
// Antes, un mensaje sin plantilla del studio se quedaba en texto plano: sin
// logo, sin botón y sin más pie que las cuatro líneas que añade el
// redactor. Vestirlo exigía entrar en el studio, diseñar algo y aplicarlo —
// tres pasos para el caso más normal de todos.
//
// Esto es ese caso normal, ya resuelto: la marca arriba, el texto que
// escribió el modelo, el botón a la landing si la hay, y el pie legal.
//
// VIVE EN EL CÓDIGO Y NO EN LA BASE, Y NO ES PEREZA
//
// Una plantilla del sistema en `plantillas` necesitaría filas sin tenant y
// una política de RLS que las deje leer a todo el mundo — es decir, abrir
// esa tabla a lecturas de fuera del tenant para guardar una constante. Aquí
// no hay nada que aislar: es el mismo diseño para todos y no lo edita
// nadie. Si algún día se quiere editable, entonces sí es una fila.
//
// DELIBERADAMENTE SOBRIO
//
// Es un primer contacto en frío entre dos empresas. Un correo con cabecera
// de color, tres columnas y dos botones parece publicidad y entra en spam
// con más facilidad; este parece una carta. El sitio para lucirse es el
// studio, y quien lo quiera ya lo tiene.
// ============================================================

import type {
  TemplateDocument,
  TemplateVariable,
} from "../studio/lib/template-types";

/**
 * Las variables que usa este diseño, declaradas una a una.
 *
 * Todas con `fallback` vacío y a propósito: el renderizador, cuando una
 * variable no viene, cae en sus datos de ejemplo —«Hola María»— y eso en un
 * correo real es peor que un hueco. Las rellena `datosReales` en
 * `aplicar-plantilla.ts`, y si alguna faltara el mensaje se salta en vez de
 * salir con llaves dentro.
 */
const VARIABLES: TemplateVariable[] = [
  { key: "brand.logo_url", label: "Logo", type: "url",
    required: false, fallback: "", source: "sender" },
  { key: "sender.legal_name", label: "Quién firma", type: "text",
    required: true, fallback: "", source: "sender" },
  { key: "sender.postal_address", label: "Domicilio postal", type: "text",
    required: false, fallback: "", source: "sender" },
  { key: "sender.privacy_url", label: "Política de privacidad", type: "url",
    required: false, fallback: "", source: "sender" },
  { key: "campaign.cta_url", label: "Landing de la campaña", type: "url",
    required: false, fallback: "", source: "campaign" },
  { key: "campaign.legal_reason", label: "Por qué se escribe", type: "text",
    required: true, fallback: "", source: "campaign" },
  { key: "system.unsubscribe_url", label: "Enlace de baja", type: "url",
    required: true, fallback: "", source: "system" },
];

/** Identificador con el que la pantalla de Mensajes la ofrece en la lista. */
export const ID_PLANTILLA_POR_DEFECTO = "__por_defecto__";

export const NOMBRE_PLANTILLA_POR_DEFECTO = "Correo simple (por defecto)";

/**
 * El documento.
 *
 * `aplicar-plantilla` lo trata como una plantilla marcada «respetar el
 * diseño»: no hay relleno de catálogo que filtrar, porque todos los textos
 * salen de variables o los pone el propio proceso.
 *
 * Las variables que usa —`brand.logo_url`, `campaign.cta_url`,
 * `system.unsubscribe_url`, `sender.legal_name`, `sender.postal_address`,
 * `campaign.legal_reason`— las rellena `datosReales`. Ninguna puede quedar
 * sin valor: una llave sin rellenar hace que el mensaje se salte.
 */
export const PLANTILLA_POR_DEFECTO: TemplateDocument = {
  schemaVersion: 1,
  settings: {
    width: 600,
    backgroundColor: "#f4f5f7",
    contentColor: "#ffffff",
    textColor: "#1f2933",
    mutedColor: "#6b7280",
    primaryColor: "#1f6feb",
    accentColor: "#1f6feb",
    // Pila de fuentes de sistema: ninguna webfont. Los clientes de correo
    // que no las cargan —Outlook, entre otros— caerían a una cualquiera.
    fontFamily:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    cornerRadius: 8,
  },
  variables: VARIABLES,
  blocks: [
    {
      // Con logo enseña el logo; sin logo, el nombre de quien firma. Lo
      // decide el renderizador según venga o no la URL, así que sirve para
      // los dos casos sin ramificar aquí.
      id: "por-defecto-marca",
      type: "brand",
      props: {
        logoUrl: "{{brand.logo_url}}",
        label: "{{sender.legal_name}}",
        logoWidth: 150,
        textAlign: "left",
      },
    },
    {
      id: "por-defecto-separador-alto",
      type: "spacer",
      props: { height: 12 },
    },
    {
      // `aplicar-plantilla` mete aquí el texto del lead. El contenido de
      // partida es vacío a propósito: si algo fallara y no lo rellenara,
      // sale un correo corto, no el copy de otro.
      id: "por-defecto-texto",
      type: "text",
      props: { content: "", textAlign: "left", fontSize: 15 },
    },
    {
      // Se queda solo si la campaña tiene landing publicada; si no,
      // `aplicar-plantilla` lo quita. Un botón que no lleva a ningún sitio
      // es peor que no tener botón.
      id: "por-defecto-boton",
      type: "button",
      props: {
        label: "Ver la propuesta",
        url: "{{campaign.cta_url}}",
        blockAlign: "left",
        blockWidth: 45,
        buttonSize: "medium",
        paddingTop: 8,
        paddingBottom: 20,
      },
    },
    {
      id: "por-defecto-linea",
      type: "divider",
      props: {},
    },
    {
      // Identificación del remitente y enlace de baja: los dos requisitos
      // de compliance.md. El de privacidad lo quita `aplicar-plantilla` si
      // el cliente no ha configurado ninguna, y el de preferencias no
      // existe, así que va vacío desde el principio.
      id: "por-defecto-pie",
      type: "footer",
      props: {
        company: "{{sender.legal_name}}",
        address: "{{sender.postal_address}}",
        note: "{{campaign.legal_reason}}",
        unsubscribeUrl: "{{system.unsubscribe_url}}",
        unsubscribeLabel: "Dejar de recibir estos correos",
        preferencesLabel: "",
        privacyUrl: "{{sender.privacy_url}}",
        privacyLabel: "Política de privacidad",
        textAlign: "left",
      },
    },
  ],
};
