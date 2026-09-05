import type {
  CampaignActivationPayload,
  CampaignMetricEvent,
  IntegrationCapabilities,
  ProspectorCampaignContext,
  ProspectorIntegrationPort,
  ProspectorLead,
  SendComplianceDecision,
} from "../../lib/prospector-contract";

export type ProspectorHttpAdapterOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  fetcher?: typeof fetch;
};

type Segment = { id: string; name: string; estimatedRecipients: number };

/**
 * Reference adapter for deployments where Campaign Studio talks to Prospector
 * through a server-side HTTP bridge. Tokens must never be passed to the browser.
 */
export function createProspectorHttpAdapter(options: ProspectorHttpAdapterOptions): ProspectorIntegrationPort {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await options.getAccessToken();
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Prospector bridge ${response.status}: ${detail.slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    capabilities: () => request<IntegrationCapabilities>("/campaign-studio/v1/capabilities"),
    listLeads: (context, search) => request<ProspectorLead[]>("/campaign-studio/v1/leads", {
      method: "POST", body: JSON.stringify({ context, search }),
    }),
    listSegments: (context) => request<Segment[]>("/campaign-studio/v1/segments", {
      method: "POST", body: JSON.stringify({ context }),
    }),
    validateSuppression: (context, leads) => request<{ eligible: ProspectorLead[]; suppressed: ProspectorLead[] }>("/campaign-studio/v1/compliance/suppressions", {
      method: "POST", body: JSON.stringify({ context, leads }),
    }),
    validateRecipientCompliance: (context, leads) => request<SendComplianceDecision>("/campaign-studio/v1/compliance/recipients", {
      method: "POST", body: JSON.stringify({ context, leads }),
    }),
    saveCampaign: (payload) => request<{ campaignId: string }>("/campaign-studio/v1/campaigns", {
      method: "POST", body: JSON.stringify(payload),
    }),
    sendTest: (payload, recipients) => request<{ deliveryId: string }>("/campaign-studio/v1/campaigns/test", {
      method: "POST", body: JSON.stringify({ payload, recipients }),
    }),
    activate: (payload) => request<{ campaignId: string; status: "scheduled" | "sending" }>("/campaign-studio/v1/campaigns/activate", {
      method: "POST", body: JSON.stringify(payload),
    }),
    ingestMetrics: (events: CampaignMetricEvent[]) => request<{ accepted: number }>("/campaign-studio/v1/metrics", {
      method: "POST", body: JSON.stringify({ events }),
    }),
    resolveUnsubscribe: (token) => request<{ leadId: string; workspaceId: string }>("/campaign-studio/v1/unsubscribe", {
      method: "POST", body: JSON.stringify({ token }),
    }),
  };
}

export function assertProspectorContext(context: ProspectorCampaignContext) {
  if (!context.tenantId || !context.userId) throw new Error("Falta el contexto multiempresa de Prospector");
  if (!Array.isArray(context.leadIds)) throw new Error("leadIds debe ser una lista");
}

export function assertImmutableCampaign(payload: CampaignActivationPayload) {
  if (!payload.templateId || !Number.isInteger(payload.templateVersion) || payload.templateVersion < 1) {
    throw new Error("La campaña debe fijar una versión inmutable de la plantilla");
  }
  if (payload.document.schemaVersion !== 1) throw new Error("TemplateDocument no compatible");
  if (payload.complianceHandoff.builderStatus !== "ready") throw new Error("La estructura legal del constructor está incompleta");
}
