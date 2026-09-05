import { env } from "cloudflare:workers";
import { requireRequestUser } from "@/lib/request-user";
import { STANDALONE_CAPABILITIES } from "@/lib/prospector-contract";

export async function GET(request: Request) {
  const auth=requireRequestUser(request); if(!auth.user)return auth.response;
  const runtime=env as unknown as { OPENAI_API_KEY?:string; BUCKET?:R2Bucket; DB?:D1Database; PROSPECTOR_API_URL?:string; PROSPECTOR_API_TOKEN?:string; EMAIL_PROVIDER_KEY?:string };
  const checklist={ persistence:Boolean(runtime.DB),assets:Boolean(runtime.BUCKET),ai:Boolean(runtime.OPENAI_API_KEY),prospectorApi:Boolean(runtime.PROSPECTOR_API_URL&&runtime.PROSPECTOR_API_TOKEN),emailTransport:Boolean(runtime.EMAIL_PROVIDER_KEY) };
  return Response.json({ mode:checklist.prospectorApi?"prospector-ready":"standalone",checklist,capabilities:{...STANDALONE_CAPABILITIES,contacts:checklist.prospectorApi,segments:checklist.prospectorApi,transactionalEmail:checklist.emailTransport,campaignActivation:checklist.prospectorApi&&checklist.emailTransport,metrics:checklist.prospectorApi,suppression:checklist.prospectorApi},contract:"ProspectorIntegrationPort",contractVersion:1,templateDocumentSchemaVersion:1,release:"0.3.1" });
}
