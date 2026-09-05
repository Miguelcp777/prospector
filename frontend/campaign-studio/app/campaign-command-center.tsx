"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, ClipboardCheck, Copy, Download, Eye, FileClock, Languages, LayoutGrid, Link2, LoaderCircle, MessageSquare, MonitorSmartphone, Palette, Plus, RefreshCcw, Search, Send, ShieldCheck, Sparkles, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildEml, documentForLead, extractTemplateLinks, imageCostEstimate, mergeDataForLead, reimagineDocument, reviewCampaign, SECTION_LIBRARY_200, type LeadProfile, type ReviewIssue, type SectionCategory } from "@/lib/campaign-enhancements";
import { renderEmailHtml } from "@/lib/email-renderer";
import { combineVariantDocuments, createExperimentPlan, estimateAttention, rankMediaAssets, simulateEmailClient, type CampaignSegment, type EmailClientProfile } from "@/lib/studio-finalization";
import type { EmailBlock, TemplateDocument } from "@/lib/template-types";

type BrandDraft = { name: string; logoUrl?: string | null; primaryColor: string; accentColor: string; backgroundColor: string; fontFamily: string; senderName: string; senderEmail: string; postalAddress: string };
type DataItem = Record<string, unknown>;
type SubjectOption = { subject: string; preheader: string; score: number; risk: string };
type AbVariant = { name: string; direction: string; subject: string; preheader: string; rationale: string };

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  document: TemplateDocument;
  subject: string;
  preheader: string;
  name: string;
  templateId: string | null;
  selectedBlockId: string;
  mergeData: Record<string, string>;
  mediaAssets: Array<{ id: string; url: string; filename: string; altText: string; source: string }>;
  onDocumentChange: (next: TemplateDocument) => void;
  onSubjectChange: (value: string) => void;
  onPreheaderChange: (value: string) => void;
  onMergeDataChange: (value: Record<string, string>) => void;
  onSelectBlock: (id: string) => void;
  onApplyBrand: (brand: Partial<BrandDraft>) => void;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const LEADS: LeadProfile[] = [
  { id: "lead-1", firstName: "María", company: "Lumen Arquitectura", sector: "Arquitectura", city: "Madrid", temperature: "caliente", customer: false, language: "español", hasProduct: false },
  { id: "lead-2", firstName: "Carlos", company: "Nexo Industrial", sector: "Industria", city: "Bilbao", temperature: "templado", customer: true, language: "español", hasProduct: true },
  { id: "lead-3", firstName: "Sophie", company: "Atelier Nord", sector: "Diseño", city: "Paris", temperature: "frío", customer: false, language: "francés", hasProduct: false },
];

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusIcon({ severity }: { severity: ReviewIssue["severity"] }) {
  return severity === "passed" ? <Check /> : severity === "critical" ? <X /> : <CircleAlert />;
}

function miniPreview(document: TemplateDocument, subject: string, preheader: string, data: Record<string, string>, dark = false) {
  const next = structuredClone(document);
  if (dark) Object.assign(next.settings, { backgroundColor: "#05070a", contentColor: "#10151c", textColor: "#f3f7fb", mutedColor: "#bcc7d2" });
  return renderEmailHtml(next, subject, preheader, data);
}

export default function CampaignCommandCenter(props: Props) {
  const [tab, setTab] = useState("review");
  const [leadId, setLeadId] = useState(LEADS[0].id);
  const [emailClient, setEmailClient] = useState<EmailClientProfile>("original");
  const [attentionMap, setAttentionMap] = useState(false);
  const [busy, setBusy] = useState("");
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [abVariants, setAbVariants] = useState<AbVariant[]>([
    { name: "A · Premium", direction: "premium", subject: props.subject, preheader: props.preheader, rationale: "Autoridad y valor percibido" },
    { name: "B · Visual", direction: "visual", subject: props.subject, preheader: props.preheader, rationale: "Impacto y reconocimiento" },
    { name: "C · Minimal", direction: "minimal", subject: props.subject, preheader: props.preheader, rationale: "Claridad y menor fricción" },
  ]);
  const [sectionSearch, setSectionSearch] = useState("");
  const [sectionCategory, setSectionCategory] = useState<SectionCategory | "Todas">("Todas");
  const [modules, setModules] = useState<DataItem[]>([]);
  const [checkpoints, setCheckpoints] = useState<DataItem[]>([]);
  const [comments, setComments] = useState<DataItem[]>([]);
  const [comment, setComment] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [moduleSync, setModuleSync] = useState(true);
  const [checkpointName, setCheckpointName] = useState("");
  const [directorPrompt, setDirectorPrompt] = useState("");
  const [directorReply, setDirectorReply] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [language, setLanguage] = useState("inglés");
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [approvalName, setApprovalName] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [testEmails, setTestEmails] = useState("");
  const [linkStatuses, setLinkStatuses] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const [shareUrl, setShareUrl] = useState("");
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryIds, setGalleryIds] = useState<string[]>([]);
  const [experimentMetric, setExperimentMetric] = useState<"clicks"|"conversions"|"opens">("clicks");
  const [segmentMix, setSegmentMix] = useState<Record<CampaignSegment,number>>({ header:0, hero:1, body:2, cta:0, footer:0 });
  const [usage, setUsage] = useState<{ totals?: { estimatedCostMicros?: number; inputTokens?: number; outputTokens?: number }; events?: DataItem[] }>({});
  const selectedLead = LEADS.find((lead) => lead.id === leadId) || LEADS[0];
  const leadView = useMemo(() => documentForLead(props.document, selectedLead, "desktop"), [props.document, selectedLead]);
  const issues = useMemo(() => reviewCampaign(props.document, props.subject, props.preheader), [props.document, props.subject, props.preheader]);
  const score = Math.round(issues.filter((issue) => issue.severity === "passed").length / Math.max(1, issues.length) * 100);
  const links = useMemo(() => extractTemplateLinks(props.document), [props.document]);
  const selectedBlock = props.document.blocks.find((block) => block.id === props.selectedBlockId);
  const previewDocument = useMemo(() => simulateEmailClient(leadView.document, emailClient), [leadView.document, emailClient]);
  const previewHtml = useMemo(() => miniPreview(previewDocument, props.subject, props.preheader, { ...props.mergeData, ...leadView.mergeData }), [previewDocument, leadView.mergeData, props.subject, props.preheader, props.mergeData]);
  const hotspots = useMemo(() => estimateAttention(previewDocument), [previewDocument]);
  const variantDocuments = useMemo(() => abVariants.map((item,index)=>reimagineDocument(props.document,item.direction,index)), [abVariants, props.document]);
  const rankedAssets = useMemo(() => { const local=rankMediaAssets(props.mediaAssets,gallerySearch).map((entry)=>entry.asset); return galleryIds.length ? galleryIds.map((id)=>props.mediaAssets.find((asset)=>asset.id===id)).filter(Boolean) as typeof props.mediaAssets : local; }, [props.mediaAssets,gallerySearch,galleryIds]);
  const filteredSections = useMemo(() => SECTION_LIBRARY_200.filter((section) => (sectionCategory === "Todas" || section.category === sectionCategory) && `${section.name} ${section.category} ${section.tags.join(" ")}`.toLowerCase().includes(sectionSearch.toLowerCase())).slice(0, 25), [sectionCategory, sectionSearch]);

  useEffect(() => {
    if (!props.open) return;
    void loadData("modules", setModules);
    void loadData("checkpoints", setCheckpoints);
    void loadData("comments", setComments);
    props.apiFetch("/api/ai-usage").then((response)=>response.ok?response.json():{}).then((data)=>setUsage(data as typeof usage)).catch(()=>{});
  }, [props.open, props.templateId]);

  useEffect(() => {
    if (!props.open || tab !== "activate") return;
    const timer = window.setInterval(() => void loadData("comments", setComments), 8000);
    return () => window.clearInterval(timer);
  }, [props.open, tab, props.templateId]);

  async function loadData(kind: string, setter: (items: DataItem[]) => void) {
    try {
      const response = await props.apiFetch(`/api/studio-data?kind=${kind}&templateId=${encodeURIComponent(props.templateId || "local")}`);
      const data = await response.json() as { items?: DataItem[] };
      if (response.ok) setter(data.items || []);
    } catch {}
  }

  async function postData(payload: Record<string, unknown>) {
    const response = await props.apiFetch("/api/studio-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { item?: DataItem; error?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
    return data.item || {};
  }

  async function ai(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    try {
      const response = await props.apiFetch("/api/ai-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo completar la acción");
      return data;
    } finally { setBusy(""); }
  }

  function updateLink(blockId: string, value: string) {
    const next = structuredClone(props.document);
    const block = next.blocks.find((item) => item.id === blockId);
    if (block) block.props.url = value;
    props.onDocumentChange(next);
  }

  async function createCheckpoint() {
    setBusy("checkpoint");
    try {
      const item = await postData({ kind: "checkpoints", templateId: props.templateId || "local", name: checkpointName || `Punto ${new Date().toLocaleString("es-ES")}`, document: props.document, subject: props.subject, preheader: props.preheader });
      setCheckpoints((current) => [item, ...current]);
      setCheckpointName("");
      toast.success("Punto de restauración guardado");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setBusy(""); }
  }

  function restoreCheckpoint(item: DataItem) {
    try {
      props.onDocumentChange(JSON.parse(String(item.documentJson)) as TemplateDocument);
      props.onSubjectChange(String(item.subject || ""));
      props.onPreheaderChange(String(item.preheader || ""));
      toast.success("Campaña restaurada");
    } catch { toast.error("El punto de restauración no es válido"); }
  }

  async function suggestSubjects() {
    try {
      const data = await ai("subjects", { subject: props.subject, preheader: props.preheader, company: selectedLead.company, document: props.document });
      setSubjects((data.subjects as SubjectOption[]) || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudieron generar asuntos"); }
  }

  function applyReimagine(direction: string, seed = Date.now()) {
    props.onDocumentChange(reimagineDocument(props.document, direction, seed));
    toast.success("Dirección visual aplicada sin alterar el contenido");
  }

  async function generateAbVariants() {
    try {
      const data = await ai("ab-variants", { subject: props.subject, preheader: props.preheader, document: props.document });
      if (Array.isArray(data.variants)) setAbVariants(data.variants as AbVariant[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudieron crear las variantes"); }
  }

  function addSection(blocks: EmailBlock[]) {
    const next = structuredClone(props.document);
    const at = Math.max(0, next.blocks.findIndex((block) => block.id === props.selectedBlockId) + 1);
    next.blocks.splice(at, 0, ...structuredClone(blocks));
    props.onDocumentChange(next);
    props.onSelectBlock(next.blocks[at]?.id || props.selectedBlockId);
    toast.success("Sección insertada en la posición seleccionada");
  }

  async function saveModule() {
    if (!selectedBlock) return toast.error("Selecciona un bloque en el editor");
    setBusy("module");
    try {
      const item = await postData({ kind: "modules", name: moduleName || `Módulo ${selectedBlock.type}`, category: selectedBlock.type, tags: [selectedBlock.type], blocks: [selectedBlock], keepStyles: true, synchronized: moduleSync });
      setModules((current) => [item, ...current]);
      setModuleName("");
      toast.success("Bloque guardado como módulo reutilizable");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setBusy(""); }
  }

  function insertStoredModule(item: DataItem) {
    try { const revision=Number(item.revision||1); const blocks=(JSON.parse(String(item.blocksJson)) as EmailBlock[]).map((block,index)=>({...structuredClone(block),id:crypto.randomUUID(),moduleRef:item.synchronized?{id:String(item.id),revision,index}:undefined})); addSection(blocks); } catch { toast.error("El módulo no se puede insertar"); }
  }

  async function syncSelectedModule() {
    if (!selectedBlock?.moduleRef) return;
    setBusy("module-sync");
    try {
      const response=await props.apiFetch("/api/studio-data",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"modules",id:selectedBlock.moduleRef.id,blocks:[{...selectedBlock,moduleRef:undefined}]})});
      const data=await response.json() as { affectedTemplates?: number; error?: string };
      if(!response.ok) throw new Error(data.error||"No se pudo sincronizar");
      await loadData("modules",setModules); toast.success(`Módulo actualizado en ${data.affectedTemplates||0} campañas`);
    } catch(error){toast.error(error instanceof Error?error.message:"No se pudo sincronizar");} finally {setBusy("");}
  }

  function applySegmentMix(){ props.onDocumentChange(combineVariantDocuments(variantDocuments,segmentMix)); toast.success("Composición combinada aplicada"); }
  async function saveExperiment(){
    const plan=createExperimentPlan(abVariants.map((item,index)=>`${index+1}-${item.name}`),experimentMetric);
    try{await postData({kind:"experiments",templateId:props.templateId,name:`A/B · ${props.name}`,metric:plan.metric,variants:abVariants.map((item,index)=>({ ...item,document:variantDocuments[index]})),allocation:plan.variants,winnerRule:plan.winnerRule});toast.success("Plan A/B guardado y preparado para Prospector");}catch(error){toast.error(error instanceof Error?error.message:"No se pudo guardar");}
  }

  async function smartGallerySearch(){
    if(!gallerySearch.trim()) return;
    try{const data=await ai("gallery-search",{query:gallerySearch,assets:props.mediaAssets});setGalleryIds(Array.isArray(data.rankedIds)?data.rankedIds.map(String):[]);}catch(error){toast.error(error instanceof Error?error.message:"No se pudo ordenar la galería");}
  }

  function updateSelectedBlock(change: (block: EmailBlock) => void) {
    if (!selectedBlock) return;
    const next = structuredClone(props.document);
    const block = next.blocks.find((item) => item.id === selectedBlock.id);
    if (block) change(block);
    props.onDocumentChange(next);
  }

  async function askDirector() {
    if (!selectedBlock || !directorPrompt.trim()) return toast.error("Selecciona un bloque y describe el cambio");
    try {
      const data = await ai("creative-director", { request: directorPrompt, block: selectedBlock, blockId: selectedBlock.id, campaign: { subject: props.subject, preheader: props.preheader } });
      const patches = Array.isArray(data.patches) ? data.patches as Array<{ blockId: string; prop: string; value: string | number | boolean }> : [];
      const next = structuredClone(props.document);
      for (const patch of patches) { const block = next.blocks.find((item) => item.id === patch.blockId); if (block && patch.prop in block.props) block.props[patch.prop] = patch.value; }
      if (patches.length) props.onDocumentChange(next);
      setDirectorReply(String(data.message || (patches.length ? "Cambio aplicado." : "No se propusieron cambios.")));
      setDirectorPrompt("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "La dirección creativa no respondió"); }
  }

  async function translateCampaign() {
    try {
      const data = await ai("translate", { language, document: props.document, subject: props.subject, preheader: props.preheader });
      if (data.document) props.onDocumentChange(data.document as TemplateDocument);
      if (data.subject) props.onSubjectChange(String(data.subject));
      if (data.preheader) props.onPreheaderChange(String(data.preheader));
      toast.success(`Campaña adaptada a ${language}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo traducir"); }
  }

  async function importUrl(kind: "content-from-url" | "brand-from-url") {
    if (!sourceUrl.trim()) return toast.error("Introduce una URL HTTPS");
    try {
      const data = await ai(kind, { url: sourceUrl });
      if (kind === "brand-from-url") {
        props.onApplyBrand((data.brand || {}) as Partial<BrandDraft>);
        toast.success("Propuesta de marca aplicada; revisa los datos legales");
      } else {
        const content = data.content as { title?: string; body?: string; offer?: string; cta?: string } | undefined;
        if (content) {
          const next = structuredClone(props.document);
          const heading = next.blocks.find((block) => block.type === "heading");
          const text = next.blocks.find((block) => block.type === "text");
          const button = next.blocks.find((block) => block.type === "button");
          if (heading) heading.props.text = content.title || heading.props.text;
          if (text) text.props.content = content.body || text.props.content;
          if (button) button.props.label = content.cta || button.props.label;
          props.onDocumentChange(next);
          toast.success("Contenido incorporado a la campaña");
        }
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo analizar la página"); }
  }

  async function repurpose() {
    try {
      const data = await ai("repurpose", { subject: props.subject, preheader: props.preheader, document: props.document });
      setChannels((data.channels as Record<string, string>) || {});
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo adaptar"); }
  }

  async function addComment() {
    try {
      const item = await postData({ kind: "comments", templateId: props.templateId || "local", blockId: props.selectedBlockId || null, authorName: approvalName || "Colaborador", body: comment });
      setComments((current) => [item, ...current]);
      setComment("");
      toast.success("Comentario añadido al bloque");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo comentar"); }
  }

  async function toggleComment(item: DataItem){
    try{const response=await props.apiFetch("/api/studio-data",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"comments",id:item.id,status:item.status==="resolved"?"open":"resolved"})});if(!response.ok)throw new Error("No se pudo actualizar");await loadData("comments",setComments);}catch(error){toast.error(error instanceof Error?error.message:"No se pudo actualizar");}
  }

  async function approve(status: "approved" | "changes_requested") {
    try {
      await postData({ kind: "approvals", templateId: props.templateId || "local", reviewerName: approvalName || "Revisor", note: approvalNote, status });
      toast.success(status === "approved" ? "Campaña aprobada" : "Cambios solicitados");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo registrar"); }
  }

  async function prepareTest() {
    const recipients = testEmails.split(/[;,\s]+/).filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)).slice(0, 10);
    if (!recipients.length) return toast.error("Introduce al menos un correo válido");
    try {
      await postData({ kind: "test-deliveries", templateId: props.templateId, recipients });
      const eml = buildEml(props.subject, previewHtml, recipients.join(", "));
      download(eml, `${props.name.replace(/\W+/g, "-").toLowerCase()}-prueba.eml`, "message/rfc822");
      toast.success("Email de prueba preparado para abrir y enviar desde tu correo");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo preparar"); }
  }

  async function checkLinks() {
    setBusy("links");
    try {
      const response = await props.apiFetch("/api/check-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ links: links.map(({ id, url }) => ({ id, url })) }) });
      const data = await response.json() as { results?: Array<{ id: string; ok: boolean; detail: string }>; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudieron comprobar los enlaces");
      setLinkStatuses(Object.fromEntries((data.results || []).map((item) => [item.id, { ok: item.ok, detail: item.detail }])));
      toast.success("Comprobación de destinos completada");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudieron comprobar"); } finally { setBusy(""); }
  }

  async function createReviewLink() {
    if (!props.templateId) return toast.error("Guarda primero la campaña para compartirla");
    setBusy("share");
    try {
      const response = await props.apiFetch("/api/share-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", templateId: props.templateId }) });
      const data = await response.json() as { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "No se pudo crear el enlace");
      const url = `${window.location.origin}${window.location.pathname}?review=${encodeURIComponent(data.token)}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success("Enlace de revisión copiado");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo compartir"); } finally { setBusy(""); }
  }

  async function revokeReviewLink(){
    if(!shareUrl) return;
    try{const token=new URL(shareUrl).searchParams.get("review")||"";const response=await props.apiFetch("/api/share-review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"revoke",token})});if(!response.ok)throw new Error("No se pudo revocar");setShareUrl("");toast.success("Enlace de revisión revocado");}catch(error){toast.error(error instanceof Error?error.message:"No se pudo revocar");}
  }

  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="studio-dialog command-center-dialog">
      <DialogHeader><div className="dialog-kicker"><span><Sparkles /></span>CENTRO DE CAMPAÑA</div><DialogTitle>Crear, comprobar y activar sin perder el foco</DialogTitle><DialogDescription>Las herramientas avanzadas actúan sobre la campaña y el bloque seleccionados.</DialogDescription></DialogHeader>
      <Tabs value={tab} onValueChange={setTab} className="command-center-tabs">
        <TabsList className="command-center-nav"><TabsTrigger value="review"><ShieldCheck/>Revisar</TabsTrigger><TabsTrigger value="optimize"><WandSparkles/>Optimizar</TabsTrigger><TabsTrigger value="personalize"><MonitorSmartphone/>Personalizar</TabsTrigger><TabsTrigger value="library"><LayoutGrid/>Módulos</TabsTrigger><TabsTrigger value="activate"><Send/>Activar</TabsTrigger></TabsList>
        <div className="command-center-body">
          <TabsContent value="review" className="command-center-pane">
            <div className="center-preview-column"><div className="center-toolbar"><label><span>Ver como destinatario</span><select value={leadId} onChange={(event)=>{setLeadId(event.target.value);const lead=LEADS.find((item)=>item.id===event.target.value)||LEADS[0];props.onMergeDataChange({...props.mergeData,...mergeDataForLead(lead)});}}>{LEADS.map((lead)=><option key={lead.id} value={lead.id}>{lead.firstName} · {lead.company}</option>)}</select></label><div className="preview-modes"><label className="client-preview"><Eye/><select value={emailClient} onChange={(event)=>setEmailClient(event.target.value as EmailClientProfile)}><option value="original">Email original</option><option value="gmail-dark">Gmail oscuro</option><option value="outlook-dark">Outlook oscuro</option><option value="apple-dark">Apple Mail oscuro</option></select></label><button className={attentionMap?"active attention":""} onClick={()=>setAttentionMap(!attentionMap)}><Sparkles/>Mapa de atención</button></div></div><div className={`center-frame ${emailClient!=="original"?"email-dark":""}`}><iframe title="Vista previa como destinatario" srcDoc={previewHtml}/>{attentionMap&&<div className="attention-overlay dynamic" aria-label="Mapa estimado de atención">{hotspots.slice(0,6).map((spot)=><i key={spot.blockId} style={{left:`${spot.x}%`,top:`${spot.y}%`,width:spot.radius,height:spot.radius,opacity:Math.max(.35,spot.score/120)}} title={`${spot.label}: ${spot.score}/100`}/>) }<span>Estimación por jerarquía · {hotspots[0]?.label||"sin bloques"} concentra la atención</span></div>}</div></div>
            <aside className="review-console"><div className="review-score" style={{ "--score": score } as React.CSSProperties}><span>{score}</span><div><strong>Preparación de campaña</strong><small>{issues.filter((issue)=>issue.severity!=="passed").length} puntos por revisar</small></div></div><div className="review-list">{issues.map((issue)=><button key={issue.id} className={issue.severity} onClick={()=>{if(issue.blockId)props.onSelectBlock(issue.blockId)}}><StatusIcon severity={issue.severity}/><span><small>{issue.group}</small><strong>{issue.label}</strong><em>{issue.detail}</em></span></button>)}</div></aside>
          </TabsContent>
          <TabsContent value="optimize" className="command-center-pane cards-pane">
            <section className="tool-card wide"><header><span><Sparkles/></span><div><strong>Asuntos y preencabezados IA</strong><small>Alternativas puntuadas por claridad, longitud y riesgo.</small></div><Button onClick={suggestSubjects} disabled={busy==="subjects"}>{busy==="subjects"?<LoaderCircle className="animate-spin"/>:<Sparkles/>}Generar</Button></header>{subjects.length>0&&<div className="subject-options">{subjects.map((option)=><button key={option.subject} onClick={()=>{props.onSubjectChange(option.subject);props.onPreheaderChange(option.preheader);toast.success("Asunto aplicado")}}><b>{option.score}</b><span><strong>{option.subject}</strong><small>{option.preheader}</small></span><em>Riesgo {option.risk}</em></button>)}</div>}</section>
            <section className="tool-card"><header><span><RefreshCcw/></span><div><strong>Reimaginar sin perder contenido</strong><small>Cambia composición, color y ritmo.</small></div></header><div className="reimagine-grid">{["premium","visual","minimal","comercial","corporativa","temporada"].map((direction)=><button key={direction} onClick={()=>applyReimagine(direction)}>{direction}</button>)}</div></section>
            <section className="tool-card"><header><span><WandSparkles/></span><div><strong>Director creativo IA</strong><small>Modifica únicamente el bloque seleccionado.</small></div></header><Textarea value={directorPrompt} onChange={(event)=>setDirectorPrompt(event.target.value)} placeholder="Ej. Haz este titular más premium, más breve y con mayor contraste"/><Button onClick={askDirector} disabled={busy==="creative-director"}>{busy==="creative-director"?<LoaderCircle className="animate-spin"/>:<Sparkles/>}Aplicar al bloque</Button>{directorReply&&<p className="director-reply">{directorReply}</p>}</section>
            <section className="tool-card wide"><header><span><LayoutGrid/></span><div><strong>Laboratorio A/B/C y combinador visual</strong><small>Compara propuestas, mezcla sus secciones y guarda un experimento activable.</small></div><Button onClick={generateAbVariants} disabled={busy==="ab-variants"}>{busy==="ab-variants"?<LoaderCircle className="animate-spin"/>:<Sparkles/>}Generar variantes</Button></header><div className="variant-compare">{abVariants.map((item,index)=><article key={`${item.name}-${index}`}><iframe title={item.name} srcDoc={miniPreview(variantDocuments[index],item.subject,item.preheader,props.mergeData)}/><div className="variant-copy"><strong>{item.name}</strong><small>{item.rationale}</small></div><button onClick={()=>{props.onDocumentChange(variantDocuments[index]);props.onSubjectChange(item.subject);props.onPreheaderChange(item.preheader)}}>Usar variante</button></article>)}</div><div className="segment-mixer">{(["header","hero","body","cta","footer"] as CampaignSegment[]).map((segment)=><label key={segment}><span>{segment}</span><select value={segmentMix[segment]} onChange={(event)=>setSegmentMix({...segmentMix,[segment]:Number(event.target.value)})}>{abVariants.map((item,index)=><option key={item.name} value={index}>{item.name.split(" · ")[0]}</option>)}</select></label>)}<Button onClick={applySegmentMix}><LayoutGrid/>Combinar secciones</Button><label><span>Métrica ganadora</span><select value={experimentMetric} onChange={(event)=>setExperimentMetric(event.target.value as typeof experimentMetric)}><option value="clicks">Clics</option><option value="conversions">Conversiones</option><option value="opens">Aperturas*</option></select></label><Button variant="outline" onClick={saveExperiment}>Guardar plan A/B</Button></div></section>
          </TabsContent>
          <TabsContent value="personalize" className="command-center-pane cards-pane">
            <section className="tool-card"><header><span><MonitorSmartphone/></span><div><strong>Bloque en móvil</strong><small>Visibilidad, orden, escala y ancho independientes.</small></div></header>{selectedBlock?<div className="mobile-controls"><label><span>Ocultar en móvil</span><input type="checkbox" checked={Boolean(selectedBlock.mobile?.hidden)} onChange={(event)=>updateSelectedBlock((block)=>{block.mobile={...block.mobile,hidden:event.target.checked}})}/></label><label><span>Orden móvil</span><Input type="number" min={0} max={99} value={selectedBlock.mobile?.order ?? props.document.blocks.indexOf(selectedBlock)} onChange={(event)=>updateSelectedBlock((block)=>{block.mobile={...block.mobile,order:Number(event.target.value)}})}/></label><label><span>Ancho móvil %</span><Input type="number" min={30} max={100} value={selectedBlock.mobile?.widthPercent ?? 100} onChange={(event)=>updateSelectedBlock((block)=>{block.mobile={...block.mobile,widthPercent:Number(event.target.value)}})}/></label><label><span>Escala de texto %</span><Input type="number" min={60} max={140} value={selectedBlock.mobile?.fontScale ?? 100} onChange={(event)=>updateSelectedBlock((block)=>{block.mobile={...block.mobile,fontScale:Number(event.target.value)}})}/></label>{props.mediaAssets.length>0&&<label className="wide"><span>Imagen móvil alternativa</span><select value={selectedBlock.mobile?.imageUrl||""} onChange={(event)=>updateSelectedBlock((block)=>{block.mobile={...block.mobile,imageUrl:event.target.value}})}><option value="">Misma imagen que escritorio</option>{props.mediaAssets.map((asset)=><option key={asset.id} value={asset.url}>{asset.filename}</option>)}</select></label>}</div>:<p>Selecciona un bloque en el editor.</p>}</section>
            <section className="tool-card"><header><span><ClipboardCheck/></span><div><strong>Regla condicional</strong><small>Decide quién verá el bloque.</small></div></header>{selectedBlock?<div className="condition-controls"><select value={selectedBlock.condition?.field||""} onChange={(event)=>updateSelectedBlock((block)=>{block.condition=event.target.value?{field:event.target.value,operator:"equals",value:""}:undefined})}><option value="">Siempre visible</option><option value="lead.segment">Sector</option><option value="lead.city">Ciudad</option><option value="lead.temperature">Temperatura</option><option value="lead.customer">Cliente existente</option><option value="lead.has_product">Tiene producto</option><option value="lead.language">Idioma</option></select>{selectedBlock.condition&&<><select value={selectedBlock.condition.operator} onChange={(event)=>updateSelectedBlock((block)=>{if(block.condition)block.condition.operator=event.target.value as typeof block.condition.operator})}><option value="equals">Es igual a</option><option value="not_equals">No es igual a</option><option value="contains">Contiene</option><option value="exists">Tiene valor</option></select>{selectedBlock.condition.operator!=="exists"&&<Input value={selectedBlock.condition.value||""} onChange={(event)=>updateSelectedBlock((block)=>{if(block.condition)block.condition.value=event.target.value})} placeholder="Valor de la condición"/>}</>}</div>:<p>Selecciona un bloque en el editor.</p>}</section>
            <section className="tool-card"><header><span><Languages/></span><div><strong>Traducción contextual</strong><small>Conserva estructura, enlaces y variables.</small></div></header><div className="inline-tools"><select value={language} onChange={(event)=>setLanguage(event.target.value)}><option>inglés</option><option>francés</option><option>alemán</option><option>italiano</option><option>portugués</option><option>catalán</option></select><Button onClick={translateCampaign} disabled={busy==="translate"}>{busy==="translate"?<LoaderCircle className="animate-spin"/>:<Languages/>}Adaptar</Button></div></section>
            <section className="tool-card"><header><span><Link2/></span><div><strong>Contenido o marca desde URL</strong><small>Analiza una página pública sin inventar datos.</small></div></header><Input type="url" value={sourceUrl} onChange={(event)=>setSourceUrl(event.target.value)} placeholder="https://empresa.es/servicio"/><div className="inline-tools"><Button variant="outline" onClick={()=>importUrl("content-from-url")} disabled={busy!==""}>Usar contenido</Button><Button onClick={()=>importUrl("brand-from-url")} disabled={busy!==""}><Palette/>Crear marca</Button></div></section>
            <section className="tool-card wide"><header><span><Search/></span><div><strong>Galería inteligente contextual</strong><small>Busca por negocio, significado, color, orientación o estilo y aplica la imagen al bloque.</small></div></header><div className="section-filters"><Search/><Input value={gallerySearch} onChange={(event)=>{setGallerySearch(event.target.value);setGalleryIds([])}} placeholder="Ej. inmobiliaria premium, azul, horizontal"/><Button onClick={smartGallerySearch} disabled={busy==="gallery-search"}>Ordenar con IA</Button></div><div className="smart-gallery">{rankedAssets.slice(0,12).map((asset)=><button key={asset.id} onClick={()=>updateSelectedBlock((block)=>{block.props.imageUrl=asset.url;block.props.imageAlt=asset.altText||asset.filename})}><img src={asset.url} alt={asset.altText||asset.filename}/><span>{asset.altText||asset.filename}</span></button>)}</div></section>
          </TabsContent>
          <TabsContent value="library" className="command-center-pane cards-pane">
            <section className="tool-card wide section-library"><header><span><LayoutGrid/></span><div><strong>200 secciones profesionales</strong><small>25 alternativas para cada tipo; se insertan después del bloque seleccionado.</small></div></header><div className="section-filters"><Search/><Input value={sectionSearch} onChange={(event)=>setSectionSearch(event.target.value)} placeholder="Buscar CTA, precio, editorial…"/><select value={sectionCategory} onChange={(event)=>setSectionCategory(event.target.value as SectionCategory|"Todas")}><option>Todas</option>{["Cabeceras","Héroes","Servicios","Testimonios","Galerías","Precios","CTA","Pies"].map((category)=><option key={category}>{category}</option>)}</select></div><div className="section-cards">{filteredSections.map((section)=><button key={section.id} onClick={()=>addSection(section.blocks)}><span>{section.blocks.map((block)=><i key={block.id} className={`mini-${block.type}`}/>)}</span><strong>{section.name}</strong><small>{section.tags.join(" · ")}</small><Plus/></button>)}</div></section>
            <section className="tool-card"><header><span><Copy/></span><div><strong>Guardar bloque como módulo</strong><small>Reutilizable y opcionalmente sincronizado.</small></div></header><Input value={moduleName} onChange={(event)=>setModuleName(event.target.value)} placeholder={selectedBlock?`Nombre para ${selectedBlock.type}`:"Selecciona un bloque"}/><label className="simple-check"><input type="checkbox" checked={moduleSync} onChange={(event)=>setModuleSync(event.target.checked)}/>Sincronizar futuras actualizaciones</label><Button onClick={saveModule} disabled={!selectedBlock||busy==="module"}><Plus/>Guardar módulo</Button></section>
            <section className="tool-card"><header><span><LayoutGrid/></span><div><strong>Mis módulos</strong><small>{modules.length} elementos guardados.</small></div></header>{selectedBlock?.moduleRef&&<Button onClick={syncSelectedModule} disabled={busy==="module-sync"}><RefreshCcw/>Actualizar y propagar módulo</Button>}<div className="saved-tools-list">{modules.length?modules.map((item)=><button key={String(item.id)} onClick={()=>insertStoredModule(item)}><span><strong>{String(item.name)}</strong><small>{String(item.category)} · {item.synchronized?`Sincronizado · r${String(item.revision||1)}`:"Independiente"}</small></span><Plus/></button>):<p>Aún no has guardado módulos.</p>}</div></section>
          </TabsContent>
          <TabsContent value="activate" className="command-center-pane cards-pane">
            <section className="tool-card"><header><span><Link2/></span><div><strong>Comprobador de enlaces</strong><small>Valida el formato y comprueba los destinos públicos.</small></div><Button onClick={checkLinks} disabled={busy==="links"}>{busy==="links"?<LoaderCircle className="animate-spin"/>:<Link2/>}Comprobar</Button></header><div className="link-editor">{links.map((link)=>{const checked=linkStatuses[link.id];const valid=checked?checked.ok:link.valid;return <label key={link.id} className={valid?"valid":"invalid"}><span>{valid?<Check/>:<X/>}<strong>{link.label}</strong>{checked&&<em>{checked.detail}</em>}</span><Input value={link.url} onChange={(event)=>updateLink(link.blockId,event.target.value)}/></label>})}</div></section>
            <section className="tool-card"><header><span><FileClock/></span><div><strong>Autoguardado y recuperación</strong><small>Guarda puntos importantes con nombre.</small></div></header><div className="inline-tools"><Input value={checkpointName} onChange={(event)=>setCheckpointName(event.target.value)} placeholder="Ej. Antes de cambiar el hero"/><Button onClick={createCheckpoint} disabled={busy==="checkpoint"}>Guardar punto</Button></div><div className="saved-tools-list">{checkpoints.slice(0,8).map((item)=><button key={String(item.id)} onClick={()=>restoreCheckpoint(item)}><span><strong>{String(item.name)}</strong><small>{String(item.createdAt)}</small></span><RefreshCcw/></button>)}</div></section>
            <section className="tool-card"><header><span><Send/></span><div><strong>Email de prueba</strong><small>Genera un .eml real para abrir y enviar desde tu cliente de correo.</small></div></header><Input value={testEmails} onChange={(event)=>setTestEmails(event.target.value)} placeholder="equipo@empresa.es, direccion@empresa.es"/><Button onClick={prepareTest}><Download/>Preparar prueba</Button></section>
            <section className="tool-card"><header><span><MessageSquare/></span><div><strong>Comentarios y aprobación</strong><small>Enlace público temporal y actualización automática cada 8 segundos.</small></div><Button onClick={createReviewLink} disabled={busy==="share"}>{busy==="share"?<LoaderCircle className="animate-spin"/>:<Link2/>}Compartir 14 días</Button></header>{shareUrl&&<div className="share-actions"><button className="share-url" onClick={()=>void navigator.clipboard.writeText(shareUrl)}><span>{shareUrl}</span><Copy/></button><Button variant="outline" onClick={revokeReviewLink}><X/>Revocar</Button></div>}<Input value={approvalName} onChange={(event)=>setApprovalName(event.target.value)} placeholder="Nombre del revisor"/><Textarea value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Añadir comentario al bloque seleccionado"/><Button onClick={addComment}><Plus/>Comentar</Button><div className="saved-tools-list comments">{comments.slice(0,6).map((item)=><div key={String(item.id)} className={item.status==="resolved"?"resolved":""}><strong>{String(item.authorName)}</strong><span>{String(item.body)}</span><small>{item.blockId?"Comentario de bloque":"Comentario general"}</small><button onClick={()=>toggleComment(item)}>{item.status==="resolved"?"Reabrir":"Resolver"}</button></div>)}</div><Textarea value={approvalNote} onChange={(event)=>setApprovalNote(event.target.value)} placeholder="Nota final opcional"/><div className="approval-actions"><Button variant="outline" onClick={()=>approve("changes_requested")}><CircleAlert/>Solicitar cambios</Button><Button onClick={()=>approve("approved")}><Check/>Aprobar</Button></div></section>
            <section className="tool-card wide"><header><span><MonitorSmartphone/></span><div><strong>Adaptación multicanal</strong><small>Convierte el concepto en piezas listas para revisar.</small></div><Button onClick={repurpose} disabled={busy==="repurpose"}>{busy==="repurpose"?<LoaderCircle className="animate-spin"/>:<Sparkles/>}Generar</Button></header>{Object.keys(channels).length>0&&<div className="channel-grid">{Object.entries(channels).map(([channel,value])=><article key={channel}><small>{channel}</small><p>{value}</p><button onClick={()=>void navigator.clipboard.writeText(value)}><Copy/>Copiar</button></article>)}</div>}</section>
            <section className="cost-strip wide"><ShieldCheck/><div><strong>Control de consumo IA</strong><small>Sesión registrada: {Number(usage.totals?.inputTokens||0).toLocaleString("es-ES")} tokens de entrada · {Number(usage.totals?.outputTokens||0).toLocaleString("es-ES")} de salida · coste configurable estimado {(Number(usage.totals?.estimatedCostMicros||0)/1_000_000).toFixed(4)} USD.</small><small>Imagen normal: {imageCostEstimate("draft").units} unidad · 2K: {imageCostEstimate("2k").units} · 4K: {imageCostEstimate("4k").units}. El proveedor factura el consumo real.</small></div></section>
          </TabsContent>
        </div>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
