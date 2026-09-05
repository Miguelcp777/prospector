"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, HelpCircle, Sparkles, X } from "lucide-react";

export type TourStep = { selector?: string; eyebrow: string; title: string; body: string; tip?: string };

type Props = { open: boolean; onOpenChange: (open: boolean) => void; steps: TourStep[] };

export default function GuidedTour({ open, onOpenChange, steps }: Props) {
  const [index,setIndex]=useState(0);
  const [rect,setRect]=useState<DOMRect|null>(null);
  const step=steps[index];

  useEffect(()=>{
    if(!open||!step)return;
    const update=()=>{
      const element=step.selector?document.querySelector<HTMLElement>(step.selector):null;
      if(element){element.scrollIntoView({behavior:"smooth",block:"center",inline:"center"});window.setTimeout(()=>setRect(element.getBoundingClientRect()),250)}else setRect(null);
    };
    update();window.addEventListener("resize",update);window.addEventListener("scroll",update,true);
    return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true)};
  },[open,step]);
  const finish=useCallback(()=>{try{localStorage.setItem("aurevanta-guided-tour-complete","1")}catch{}onOpenChange(false)},[onOpenChange]);
  const next=useCallback(()=>{if(index>=steps.length-1)finish();else setIndex(index+1)},[finish,index,steps.length]);
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==="Escape")finish();if(event.key==="ArrowRight")next();if(event.key==="ArrowLeft"&&index>0)setIndex(index-1)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[finish,index,next,open]);
  const cardStyle=useMemo(()=>{
    if(!rect)return{};
    const width=Math.min(390,window.innerWidth-24);const below=rect.bottom+18;const top=below+290<window.innerHeight?below:Math.max(12,rect.top-306);
    return{position:"fixed" as const,left:Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2)),top,width};
  },[rect]);
  if(!open||!step)return null;
  return <div className="guided-tour" role="dialog" aria-modal="true" aria-label="Recorrido guiado de Campaign Studio">
    <div className="tour-backdrop"/>
    {rect&&<div className="tour-spotlight" style={{left:Math.max(5,rect.left-7),top:Math.max(5,rect.top-7),width:Math.min(window.innerWidth-10,rect.width+14),height:Math.min(window.innerHeight-10,rect.height+14)}}/>}
    <section className={`tour-card ${rect?"anchored":"welcome"}`} style={cardStyle}>
      <header><span><HelpCircle/></span><div><small>{step.eyebrow}</small><strong>{step.title}</strong></div><button onClick={finish} aria-label="Cerrar guía"><X/></button></header>
      <p>{step.body}</p>{step.tip&&<div className="tour-tip"><Sparkles/><span>{step.tip}</span></div>}
      <div className="tour-progress" aria-label={`Paso ${index+1} de ${steps.length}`}><span><i style={{width:`${((index+1)/steps.length)*100}%`}}/></span><small>{index+1} / {steps.length}</small></div>
      <footer><button onClick={finish}>Saltar guía</button><div>{index>0&&<button onClick={()=>setIndex(index-1)}><ChevronLeft/>Atrás</button>}<button className="primary" onClick={next}>{index===steps.length-1?<><Check/>Finalizar</>:<>Siguiente<ChevronRight/></>}</button></div></footer>
    </section>
  </div>;
}
