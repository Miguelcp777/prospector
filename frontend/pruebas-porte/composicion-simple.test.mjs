// El correo del flujo simple, montado sin catálogo.
//
// Cada aserción de aquí es uno de los cuatro defectos que aparecieron al
// generar un correo para un estudio de tatuajes y salir una clínica de
// fisioterapia. Si alguna vuelve a fallar, ha vuelto el catálogo.
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/studio", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@studio": root } },
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

const { componerDocumentoSimple } = await vite.ssrLoadModule("/lib/composicion-simple.ts");
const { validarDireccionArte } = await vite.ssrLoadModule("/lib/direccion-arte.ts");
const { renderEmailHtml } = await vite.ssrLoadModule("/lib/email-renderer.ts");
const { validateTemplateDocument } = await vite.ssrLoadModule("/lib/template-document-schema.ts");
const { REQUIRED_COMPLIANCE_VARIABLES } = await vite.ssrLoadModule("/lib/template-types.ts");

const copy = {
  subject: "Hasta 20% en tatuajes y piercings",
  preheader: "Diseño propio, higiene impecable.",
  eyebrow: "ESTUDIO DE TATUAJES",
  title: "Su primer tatuaje, con un diseño a medida",
  body: "Somos artistas, no una cadena.",
  sectionTitle: "Descuentos disponibles",
  sectionBody: "Hasta un 20% este mes en tatuajes y piercings.",
  ctaLabel: "Reservar cita",
  ventajas: [
    { titulo: "Diseño propio", texto: "Cada pieza se dibuja para quien la lleva." },
    { titulo: "Higiene", texto: "Material de un solo uso y sala esterilizada." },
  ],
};

const arteDe = (extra = {}) =>
  validarDireccionArte({
    paleta: {
      fondo: "#0f0f10", superficie: "#17171a", texto: "#f4f4f5", suave: "#b9b9c0",
      primario: "#c9a227", acento: "#8b5cf6", textoSobrePrimario: "#1a1300",
    },
    tipografia: "sans-geometrica",
    mayusculas: true,
    densidad: "equilibrada",
    esquinas: "suave",
    modo: "oscuro",
    estructura: ["brand", "hero", "text", "columns", "divider", "button"],
    ...extra,
  }).arte;

const documentoDe = (extra = {}) =>
  componerDocumentoSimple({
    copy,
    arte: arteDe(),
    nombreEmpresa: "Woody Tattoo",
    urlImagen: null,
    urlDestino: "https://tattoo-alfafar.es/",
    ...extra,
  });

test("no queda nada del catálogo en los bloques", () => {
  const doc = documentoDe();
  const tipos = doc.blocks.map((b) => b.type);
  assert.ok(!tipos.includes("artText"), "el artText arrastraba el antetítulo del catálogo");
  assert.ok(!tipos.includes("image"), "el bloque image sin imagen es el recuadro 'Retrato editorial'");
  assert.equal(tipos.at(-1), "footer");
});

test("la marca es la empresa del cliente, no una categoría", () => {
  const doc = documentoDe();
  const marca = doc.blocks.find((b) => b.type === "brand");
  assert.equal(marca.props.label, "Woody Tattoo");
});

test("solo la marca va en mayúsculas, y solo si se pide", () => {
  const html = renderEmailHtml(documentoDe(), copy.subject, copy.preheader);
  const veces = (html.match(/text-transform:uppercase/g) || []).length;
  // Dos como máximo: el correo lleva dos maquetaciones desde la V45
  // —escritorio y móvil— así que la marca se pinta una vez en cada una.
  assert.ok(veces <= 2, `salieron ${veces} bloques en mayúsculas`);

  const sinMayusculas = componerDocumentoSimple({
    copy, arte: arteDe({ mayusculas: false }), nombreEmpresa: "Woody Tattoo",
  });
  const html2 = renderEmailHtml(sinMayusculas, copy.subject, copy.preheader);
  assert.ok(!html2.includes("text-transform:uppercase"));
});

test("sin imagen no aparece el recuadro con leyenda", () => {
  const html = renderEmailHtml(documentoDe({ urlImagen: null }), copy.subject, copy.preheader);
  assert.ok(!html.includes("Retrato editorial"));
  assert.ok(!/aria-label="[^"]*Retrato/.test(html));
});

test("con imagen, la imagen entra en la portada", () => {
  const doc = documentoDe({ urlImagen: "https://ejemplo.test/foto.png" });
  const hero = doc.blocks.find((b) => b.type === "hero");
  assert.equal(hero.props.imageUrl, "https://ejemplo.test/foto.png");
  assert.notEqual(hero.props.heroComposition, "free", "la composición libre recorta titulares largos");
});

test("el pie conserva las variables que exige el cumplimiento", () => {
  const doc = documentoDe();
  const pie = doc.blocks.find((b) => b.type === "footer");
  const texto = JSON.stringify(pie.props);
  for (const variable of REQUIRED_COMPLIANCE_VARIABLES) {
    if (variable.startsWith("sender.") || variable.startsWith("system.") || variable.startsWith("campaign."))
      assert.ok(texto.includes(`{{${variable}}}`), `falta {{${variable}}} en el pie`);
  }
});

test("un destino que no es una URL no ensucia el botón", () => {
  const doc = documentoDe({ urlDestino: "https://" });
  const boton = doc.blocks.find((b) => b.type === "button");
  assert.equal(boton.props.url, "{{campaign.cta_url}}");
});

test("las columnas se rellenan con las ventajas del redactor", () => {
  const doc = documentoDe();
  const columnas = doc.blocks.find((b) => b.type === "columns");
  assert.equal(columnas.props.leftTitle, "Diseño propio");
  assert.equal(columnas.props.rightTitle, "Higiene");
});

test("si el redactor no escribió ventajas, no se pinta una columna vacía", () => {
  const doc = componerDocumentoSimple({
    copy: { ...copy, ventajas: [] },
    arte: arteDe(),
    nombreEmpresa: "Woody Tattoo",
  });
  assert.ok(!doc.blocks.some((b) => b.type === "columns"));
});

test("el documento sigue cumpliendo el contrato v1", () => {
  const resultado = validateTemplateDocument(documentoDe());
  assert.equal(resultado.success, true, JSON.stringify(resultado.error?.issues?.slice(0, 3)));
});

test("un hueco que el redactor deja no lo rellena nadie", () => {
  // Este es el correo de Woody Tattoo que proponía «una auditoría de
  // oportunidades para Lumen Arquitectura». Esa frase no la escribió el
  // modelo: la componía `guidedCopy` con la oferta de fábrica del asistente
  // y el destinatario de ejemplo de la vista previa, y se colaba en medio.
  // Sin contenido, el bloque no se pinta.
  const doc = componerDocumentoSimple({
    copy: { ...copy, sectionTitle: "", sectionBody: "  " },
    arte: arteDe(),
    nombreEmpresa: "Woody Tattoo",
  });
  assert.ok(!doc.blocks.some((b) => b.type === "text"));

  const html = renderEmailHtml(doc, copy.subject, copy.preheader);
  assert.ok(!/auditor/i.test(html), "volvió la plantilla determinista");
  assert.ok(!/Lumen/.test(html), "volvió el destinatario de ejemplo");
});
