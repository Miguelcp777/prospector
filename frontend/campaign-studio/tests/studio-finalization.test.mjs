import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const vite=await createServer({appType:"custom",configFile:false,root,resolve:{alias:{"@":root}},server:{middlewareMode:true,hmr:false}});
after(async()=>vite.close());

test("mobile overrides hide, reorder and scale the actual document",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {mobileDocument}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const doc=createBlankDocument(); const first=doc.blocks[0]; const second=doc.blocks[1];
  first.mobile={hidden:true}; second.mobile={order:0,fontScale:120,widthPercent:70}; second.props.fontSize=20;
  const mobile=mobileDocument(doc);
  assert.equal(mobile.blocks.some((block)=>block.id===first.id),false);
  assert.equal(mobile.blocks[0].id,second.id); assert.equal(mobile.blocks[0].props.blockWidth,70);
});

test("mobile layout automatically compresses free compositions",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {mobileDocument}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const doc=createBlankDocument(); const block=doc.blocks[1];
  doc.settings.width=640;
  Object.assign(block.props,{freeX:160,freeY:120,freeScale:200,fontSize:40,edgePadding:40});
  const mobile=mobileDocument(doc); const responsive=mobile.blocks.find((item)=>item.id===block.id);
  assert.equal(mobile.settings.width,375);
  assert.equal(responsive.props.freeX,0);
  assert.equal(responsive.props.freeY,0);
  assert.ok(responsive.props.freeScale<200);
  assert.ok(responsive.props.fontSize<40);
  assert.ok(responsive.props.fontSize>=15);
  assert.ok(responsive.props.edgePadding<=14);
  assert.ok(responsive.props.blockWidth>=94);
});

test("mobile hero reserves readable non-overlapping text zones",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {mobileDocument}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const doc=createBlankDocument(); const hero=doc.blocks.find((block)=>block.type==="hero");
  Object.assign(hero.props,{eyebrow:"Una propuesta especial",title:"Un titular largo que necesita varias líneas en una pantalla móvil",body:"Este texto explica la propuesta sin cruzarse con el título ni quedar fuera de la composición.",eyebrowY:40,titleY:42,bodyY:44,titleFontSize:72,bodyFontSize:24,minHeight:300});
  const responsive=mobileDocument(doc).blocks.find((block)=>block.id===hero.id).props;
  assert.ok(responsive.minHeight>=360);
  assert.ok(responsive.titleFontSize>=24);
  assert.ok(responsive.bodyFontSize>=15);
  assert.ok(responsive.eyebrowY<responsive.titleY);
  assert.ok(responsive.titleY<responsive.bodyY);
  assert.ok(responsive.titleWidth>=82);
  assert.ok(responsive.bodyWidth>=82);
});

test("explicit mobile positioning remains available when desired",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {mobileDocument}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const doc=createBlankDocument(); const block=doc.blocks[1];
  block.mobile={autoResponsive:false,freeX:90,freeY:-70,freeScale:145,widthPercent:130};
  const responsive=mobileDocument(doc).blocks.find((item)=>item.id===block.id);
  assert.equal(responsive.props.freeX,90);
  assert.equal(responsive.props.freeY,-70);
  assert.equal(responsive.props.freeScale,145);
  assert.equal(responsive.props.blockWidth,130);
});

test("email client previews have distinct palettes",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {simulateEmailClient}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const doc=createBlankDocument();
  assert.notEqual(simulateEmailClient(doc,"gmail-dark").settings.contentColor,simulateEmailClient(doc,"outlook-dark").settings.contentColor);
  assert.equal(simulateEmailClient(doc,"apple-dark").settings.backgroundColor,"#000000");
});

test("variant mixer selects independent campaign segments",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {combineVariantDocuments,segmentForBlock}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  const variants=[0,1,2].map((index)=>{const doc=createBlankDocument();doc.blocks.forEach((block)=>block.props.marker=index);return doc});
  const mixed=combineVariantDocuments(variants,{header:0,hero:1,body:2,cta:1,footer:0});
  assert.equal(mixed.blocks.find((block)=>segmentForBlock(block)==="hero").props.marker,1);
  assert.equal(mixed.blocks.find((block)=>segmentForBlock(block)==="body").props.marker,2);
});

test("attention, gallery ranking, cost and allocation are deterministic",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {estimateAttention,rankMediaAssets,estimateAiCost,createExperimentPlan}=await vite.ssrLoadModule("/lib/studio-finalization.ts");
  assert.ok(estimateAttention(createBlankDocument())[0].score>50);
  const ranked=rankMediaAssets([{filename:"clinica-salud-horizontal.webp",altText:"fisioterapia",source:"ai",width:1600,height:900},{filename:"casa.jpg",altText:"inmueble",source:"upload",width:900,height:1600}],"salud horizontal");
  assert.equal(ranked[0].asset.filename,"clinica-salud-horizontal.webp");
  assert.ok(estimateAiCost({resolution:"4k"}).amount>estimateAiCost({resolution:"draft"}).amount);
  assert.equal(createExperimentPlan(["a","b","c"]).variants.reduce((sum,item)=>sum+item.allocation,0),100);
});

test("renderer always exports a dedicated responsive mobile layout",async()=>{
  const {createBlankDocument}=await vite.ssrLoadModule("/lib/template-types.ts");
  const {renderEmailHtml}=await vite.ssrLoadModule("/lib/email-renderer.ts");
  const doc=createBlankDocument();
  const html=renderEmailHtml(doc,"Asunto","Preheader");
  assert.match(html,/class="mobile-layout"/);assert.match(html,/desktop-layout\{display:none/);
});
