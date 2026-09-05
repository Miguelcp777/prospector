"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, LoaderCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderEmailHtml } from "@/lib/email-renderer";
import type { TemplateDocument } from "@/lib/template-types";

type ReviewData = { campaign: { name: string; subject: string; preheader: string; document: TemplateDocument; version: number }; comments: Array<Record<string, unknown>>; approvals: Array<Record<string, unknown>> };

export default function ReviewPortal({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const html = useMemo(() => data ? renderEmailHtml(data.campaign.document, data.campaign.subject, data.campaign.preheader) : "", [data]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/share-review?token=${encodeURIComponent(token)}`);
    const payload = await response.json() as ReviewData & { error?: string };
    if (!response.ok) setError(payload.error || "No se pudo abrir la revisión"); else setData(payload);
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(action: "comment" | "approval", status?: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/share-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token, authorName: name, body: comment, note, status }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo registrar");
      setComment(""); setNote(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo registrar"); } finally { setBusy(false); }
  }

  if (error && !data) return <main className="review-portal-state"><CircleAlert/><h1>Revisión no disponible</h1><p>{error}</p></main>;
  if (!data) return <main className="review-portal-state"><LoaderCircle className="animate-spin"/><h1>Abriendo campaña…</h1></main>;
  return <main className="external-review-shell"><header><div><img src="/assets/aurevanta-labs-official.jpg" alt="Aurevanta Labs"/><span>REVISIÓN DE CAMPAÑA</span></div><aside><small>VERSIÓN {data.campaign.version}</small><strong>{data.campaign.name}</strong></aside></header><section className="external-review-grid"><div className="external-campaign"><div><small>ASUNTO</small><strong>{data.campaign.subject}</strong><span>{data.campaign.preheader}</span></div><iframe title="Campaña para revisar" srcDoc={html}/></div><aside className="external-feedback"><div className="external-status"><ShieldCheck/><span><strong>Revisión privada</strong><small>Tus observaciones quedarán asociadas a esta versión.</small></span></div><label><span>Tu nombre</span><Input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Nombre del revisor"/></label><label><span>Comentario</span><Textarea rows={4} value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Indica qué cambiarías o qué está aprobado"/></label><Button variant="outline" disabled={busy||!comment.trim()} onClick={()=>submit("comment")}><MessageSquare/>Añadir comentario</Button><div className="external-comments">{data.comments.map((item)=><article key={String(item.id)}><strong>{String(item.authorName)}</strong><p>{String(item.body)}</p><small>{String(item.createdAt)}</small></article>)}</div><label><span>Nota de decisión</span><Textarea rows={3} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Nota final opcional"/></label><div className="external-decisions"><Button variant="outline" disabled={busy} onClick={()=>submit("approval","changes_requested")}><CircleAlert/>Solicitar cambios</Button><Button disabled={busy} onClick={()=>submit("approval","approved")}><Check/>Aprobar campaña</Button></div>{data.approvals[0]&&<div className={`last-decision ${String(data.approvals[0].status)}`}><strong>Última decisión</strong><span>{String(data.approvals[0].status)==="approved"?"Campaña aprobada":"Cambios solicitados"} por {String(data.approvals[0].reviewerName)}</span></div>}</aside></section></main>;
}
