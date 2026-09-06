"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, HelpCircle, Sparkles, X } from "lucide-react";

export type TourStep = { selector?: string; eyebrow: string; title: string; body: string; tip?: string };

type Props = { open: boolean; onOpenChange: (open: boolean) => void; steps: TourStep[] };

export default function GuidedTour({ open, onOpenChange, steps }: Props) {
  const [index,setIndex]=useState(0);
  const [rect,setRect]=useState<DOMRect|null>(null);
  const step=steps[index];
  const scrollGuardado=useRef<{el:Element;top:number;left:number}[]|null>(null);

  // Cuando el recorrido sí ha tenido que desplazar algo para enseñarlo, al
  // cerrarse hay que devolverlo. Si no, se sale de la ayuda y el editor se
  // ha quedado movido, sin que el usuario haya tocado nada.
  useEffect(()=>{
    if(open){
      const raiz=document.querySelector(".studio")??document.body;
      const items:{el:Element;top:number;left:number}[]=[{el:document.scrollingElement??document.documentElement,top:window.scrollY,left:window.scrollX}];
      for(const el of Array.from(raiz.querySelectorAll("*")))
        if(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth)
          items.push({el,top:el.scrollTop,left:el.scrollLeft});
      scrollGuardado.current=items;
      return;
    }
    const items=scrollGuardado.current;
    if(!items)return;
    scrollGuardado.current=null;
    const devolver=()=>{
      for(const {el,top,left} of items){
        if(!el.isConnected)continue;
        el.scrollTop=top;el.scrollLeft=left;
      }
    };
    // Dos veces a propósito: el scroll suave del último paso puede seguir
    // animándose al cerrar. La primera pasada lo aborta —un scroll nuevo
    // cancela el que está en curso— y la segunda recoge lo que llegara tarde.
    devolver();
    requestAnimationFrame(devolver);
  },[open]);

  useEffect(()=>{
    if(!open||!step)return;
    const update=()=>{
      const element=step.selector?document.querySelector<HTMLElement>(step.selector):null;
      if(element){// "nearest" no mueve nada cuando el elemento ya se ve entero, que en
      // este layout es casi siempre: los siete puntos del recorrido son
      // paneles visibles a la vez. "center" los recentraba igualmente y
      // desplazaba el contenido sin ninguna necesidad.
      element.scrollIntoView({behavior:"smooth",block:"nearest",inline:"nearest"});window.setTimeout(()=>setRect(element.getBoundingClientRect()),250)}else setRect(null);
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
