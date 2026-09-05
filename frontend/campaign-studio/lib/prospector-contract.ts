import type { LeadProfile } from "./campaign-enhancements";
import { REQUIRED_COMPLIANCE_VARIABLES, type TemplateDocument } from "./template-types";

export const PROSPECTOR_INTEGRATION_CONTRACT_VERSION = 1 as const;

/** Stable boundary for replacing the public demo session with Prospector/Supabase tenancy. */
export type ProspectorCampaignContext = {
  tenantId: string;
  userId: string;
  campaignId?: string;
  leadIds: string[];
  segmentId?: string;
};

export type ProspectorLead = LeadProfile & {
  email: string;
  customFields: Record<string, string | number | boolean | null>;
  consentStatus: "granted" | "legitimate_interest" | "unknown" | "suppressed";
};

export type CampaignActivationPayload = {
  context: ProspectorCampaignContext;
  templateId: string;
  templateVersion: number;
  document: TemplateDocument;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  variantId?: string;
  scheduledAt?: string;
  utm: Record<string, string>;
  complianceHandoff: {
    builderStatus: "ready" | "incomplete";
    prospectorValidationRequired: true;
    requiredRuntimeVariables: string[];
  };
};

export type RecipientComplianceEvidence = {
  leadId: string;
  contactSource: string;
  legalBasis: "consent" | "prior_customer_similar_products";
  evidenceReference: string;
  informedAt?: string;
  objectedAt?: string;
};

export type SendComplianceDecision = {
  eligible: ProspectorLead[];
  blocked: Array<{ lead: ProspectorLead; reason: "unknown_basis" | "suppressed" | "objected" | "missing_evidence" }>;
  evidence: RecipientComplianceEvidence[];
};

export interface ProspectorAdapter {
  listLeads(context: ProspectorCampaignContext, search?: string): Promise<ProspectorLead[]>;
  saveCampaign(payload: CampaignActivationPayload): Promise<{ campaignId: string }>;
  sendTest(payload: CampaignActivationPayload, recipients: string[]): Promise<{ deliveryId: string }>;
  activate(payload: CampaignActivationPayload): Promise<{ campaignId: string; status: "scheduled" | "sending" }>;
}

export type IntegrationCapabilities = {
  tenancy: boolean; contacts: boolean; segments: boolean; transactionalEmail: boolean;
  campaignActivation: boolean; metrics: boolean; suppression: boolean;
};

export type CampaignMetricEvent = {
  campaignId: string; variantId?: string; leadId: string;
  type: "delivered" | "opened" | "clicked" | "converted" | "bounced" | "unsubscribed";
  occurredAt: string; url?: string;
};

/** Complete product-side port. Prospector only has to implement this interface. */
export interface ProspectorIntegrationPort extends ProspectorAdapter {
  capabilities(): Promise<IntegrationCapabilities>;
  listSegments(context: ProspectorCampaignContext): Promise<Array<{ id: string; name: string; estimatedRecipients: number }>>;
  validateSuppression(context: ProspectorCampaignContext, leads: ProspectorLead[]): Promise<{ eligible: ProspectorLead[]; suppressed: ProspectorLead[] }>;
  validateRecipientCompliance(context: ProspectorCampaignContext, leads: ProspectorLead[]): Promise<SendComplianceDecision>;
  ingestMetrics(events: CampaignMetricEvent[]): Promise<{ accepted: number }>;
  resolveUnsubscribe(token: string): Promise<{ leadId: string; workspaceId: string }>;
}

export const STANDALONE_CAPABILITIES: IntegrationCapabilities = {
  tenancy: true, contacts: false, segments: false, transactionalEmail: false,
  campaignActivation: false, metrics: false, suppression: false,
};

/** Builds the immutable compliance manifest that travels with a campaign snapshot. */
export function buildComplianceHandoff(document: TemplateDocument): CampaignActivationPayload["complianceHandoff"] {
  const variables = new Set(document.variables.map((variable) => variable.key));
  const footer = document.blocks.find((block) => block.type === "footer");
  const footerText = footer ? Object.values(footer.props).filter((value) => typeof value === "string").join(" ") : "";
  const variablesReady = REQUIRED_COMPLIANCE_VARIABLES.every((key) => variables.has(key));
  const linksReady = /system\.unsubscribe_url/.test(footerText) && /system\.preferences_url/.test(footerText) && /sender\.privacy_url/.test(footerText);
  const identityReady = Boolean(footer && String(footer.props.company || "").trim() && String(footer.props.address || "").trim());
  return {
    builderStatus: variablesReady && linksReady && identityReady ? "ready" : "incomplete",
    prospectorValidationRequired: true,
    requiredRuntimeVariables: [...REQUIRED_COMPLIANCE_VARIABLES],
  };
}

export const PROSPECTOR_MERGE_MAP = {
  "lead.first_name": "leads.first_name",
  "lead.company": "leads.company_name",
  "lead.segment": "lead_segments.name",
  "lead.city": "leads.city",
  "lead.temperature": "leads.score_band",
  "lead.language": "leads.locale",
  "sender.name": "workspace_profiles.sender_name",
  "sender.company": "workspaces.display_name",
  "sender.legal_name": "workspace_profiles.legal_name",
  "sender.postal_address": "workspace_profiles.postal_address",
  "sender.privacy_url": "workspace_profiles.privacy_url",
  "sender.privacy_email": "workspace_profiles.privacy_email",
  "campaign.offer": "campaigns.offer",
  "campaign.cta_url": "campaigns.destination_url",
  "campaign.legal_reason": "campaign_recipients.legal_notice",
  "system.unsubscribe_url": "suppression_links.signed_url",
  "system.preferences_url": "preference_links.signed_url",
} as const;
