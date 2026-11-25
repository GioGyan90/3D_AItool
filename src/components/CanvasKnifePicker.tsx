import {useEffect,useMemo,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import type {ControlMesh} from '../types';
import {triangulateFaces} from './traceGeometry';
import type {KnifeHit} from './canvasKnife';
import type {KnifePoint} from './knifeTopology';
// A private raycast mesh prevents cage, gizmo, and reference-plane intersections
// from stealing knife clicks. Only the nearest visible polygon is considered.
export function CanvasKnifePicker({mesh,onHover,onPick}:{mesh:ControlMesh;onHover:(h:KnifeHit|null)=>void;onPick:(h:KnifeHit)=>void}){
 const {gl,camera}=useThree();
 const callbacks=useRef({onHover,onPick});callbacks.current={onHover,onPick};
 const target=useMemo(()=>{
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(mesh.vertices.flat(),3));
  try{g.setIndex(triangulateFaces(mesh.vertices,mesh.faces,false,false))}catch{g.setIndex([])}
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});
  return new T.Mesh(g,material);
 },[mesh]);
 useEffect(()=>()=>{target.geometry.dispose();target.material.dispose()},[target]);
 useEffect(()=>{
  const canvas=gl.domElement,ray=new T.Raycaster(),ndc=new T.Vector2();
  const owners=mesh.faces.flatMap((f,i)=>Array(Math.max(0,f.length-2)).fill(i) as number[]);
  const pick=(e:PointerEvent):KnifeHit|null=>{
   const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   if(!rect.width||!rect.height)return null;
   ndc.set(x/rect.width*2-1,1-y/rect.height*2);ray.setFromCamera(ndc,camera);
   const hit=ray.intersectObject(target,false)[0];if(hit?.faceIndex==null)return null;
   const face=owners[hit.faceIndex],f=mesh.faces[face];if(!f)return null;
   const project=(id:number)=>{const p=new T.Vector3(...mesh.vertices[id]),depth=-p.clone().applyMatrix4(camera.matrixWorldInverse).z,q=p.project(camera);return {x:(q.x+1)*rect.width/2,y:(1-q.y)*rect.height/2,w:camera instanceof T.PerspectiveCamera?depth:1}};
   const screen=f.map(project);let best=12,point:KnifePoint|null=null;
   for(let i=0;i<f.length;i++){const d=Math.hypot(x-screen[i].x,y-screen[i].y);if(d<=best){best=d;point={vertex:f[i]}}}
   if(point)return {face,point};
   best=15;
   for(let i=0;i<f.length;i++){
    const a=screen[i],b=screen[(i+1)%f.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
    if(l<1e-8||a.w<=0||b.w<=0)continue;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l)),d=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(d>best)continue;
    // Screen-space interpolation must be perspective corrected before topology.
    const fraction=t*a.w/(b.w*(1-t)+a.w*t);
    best=d;point=fraction<=.02?{vertex:f[i]}:fraction>=.98?{vertex:f[(i+1)%f.length]}:{edge:[f[i],f[(i+1)%f.length]],fraction};
   }
   return point?{face,point}:null;
  };
  const move=(e:PointerEvent)=>{callbacks.current.onHover(e.buttons?null:pick(e))};
  const down=(e:PointerEvent)=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const h=pick(e);if(h)callbacks.current.onPick(h);canvas.focus({preventScroll:true})};
  const leave=()=>callbacks.current.onHover(null);
  const oldCursor=canvas.style.cursor,oldTab=canvas.getAttribute('tabindex');canvas.style.cursor='crosshair';canvas.tabIndex=0;
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointerleave',leave);
  return()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointerleave',leave);canvas.style.cursor=oldCursor;if(oldTab===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',oldTab)};
 },[gl,camera,mesh,target]);
 return null;
}
