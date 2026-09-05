import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageEvents } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import { DEFAULT_AI_COST_RATES } from "@/lib/studio-finalization";

export async function GET(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const events = await getDb().select().from(aiUsageEvents).where(eq(aiUsageEvents.ownerId, auth.user.id)).orderBy(desc(aiUsageEvents.createdAt)).limit(100);
  const totals = events.reduce((result, event) => ({
    inputTokens: result.inputTokens + event.inputTokens,
    outputTokens: result.outputTokens + event.outputTokens,
    estimatedCostMicros: result.estimatedCostMicros + event.estimatedCostMicros,
  }), { inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 });
  return Response.json({ events, totals: { ...totals, estimatedCost: totals.estimatedCostMicros / 1_000_000, currency: events[0]?.currency || DEFAULT_AI_COST_RATES.currency }, rates: DEFAULT_AI_COST_RATES, disclaimer: "Estimación configurable; la factura del proveedor es la referencia definitiva." });
}
