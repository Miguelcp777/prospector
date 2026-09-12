export type StudioSpace = "home" | "campaigns" | "templates" | "editor" | "brand";
export type ExperienceMode = "guided" | "professional";

export type StudioAction = {
  id: string;
  label: string;
  space: StudioSpace;
  modes: ExperienceMode[];
  shortcut?: string;
  panel?: "campaigns" | "templates" | "brand" | "review" | "help" | "import" | "ai";
};

export const STUDIO_SPACES: Array<{
  id: StudioSpace;
  label: string;
  description: string;
}> = [
  { id: "home", label: "Inicio", description: "Crear o continuar" },
  { id: "campaigns", label: "Mis campañas", description: "Activas, borradores y archivo" },
  { id: "templates", label: "Plantillas", description: "Premium, recomendadas y clásicas" },
  { id: "editor", label: "Editor", description: "Maqueta, bloques y propiedades" },
  { id: "brand", label: "Marca y recursos", description: "Identidad, fuentes e imágenes" },
];

export const STUDIO_ACTIONS: StudioAction[] = [
  { id: "new", label: "Nueva campaña", space: "home", modes: ["guided", "professional"] },
  { id: "ai", label: "Crear con IA", space: "home", modes: ["guided", "professional"], panel: "ai" },
  { id: "campaigns", label: "Abrir Mis campañas", space: "campaigns", modes: ["guided", "professional"], panel: "campaigns" },
  { id: "templates", label: "Elegir plantilla", space: "templates", modes: ["guided", "professional"], panel: "templates" },
  { id: "import", label: "Importar HTML", space: "editor", modes: ["guided", "professional"], panel: "import" },
  { id: "review", label: "Revisar y exportar", space: "editor", modes: ["guided", "professional"], panel: "review" },
  { id: "brand", label: "Abrir Marca y recursos", space: "brand", modes: ["guided", "professional"], panel: "brand" },
  { id: "help", label: "Ayuda", space: "home", modes: ["guided", "professional"], shortcut: "?", panel: "help" },
  { id: "command", label: "Buscar acciones", space: "editor", modes: ["guided", "professional"], shortcut: "Ctrl K" },
];

export function actionsForMode(mode: ExperienceMode) {
  return STUDIO_ACTIONS.filter((action) => action.modes.includes(mode));
}
