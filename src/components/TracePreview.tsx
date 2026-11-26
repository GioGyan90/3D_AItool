import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {OrbitControls, TransformControls} from '@react-three/drei';
import * as THREE from 'three';
import {triangulateFaces} from './traceGeometry';
import {buildPaintStickerGeometry} from '../studioProject';
import type {ControlMesh} from '../types';
import {CanvasKnifePicker} from './CanvasKnifePicker';
import type {KnifeHit} from './canvasKnife';

import {partitionRegionTriangles,regionVertices,regionFolds,type RegionInspection} from './regionInspection';

type V=[number,number,number];
type Data=ControlMesh;
export type SpatialReference={id:string;name:string;url:string;aspect:number;position:V;rotation:V;width:number;opacity:number;visible:boolean;overlay:boolean};
function ReferencePlane({plane}:{plane:SpatialReference}){
  const [texture,setTexture]=useState<THREE.Texture|null>(null);
  useEffect(()=>{
    let alive=true;
    const tex=new THREE.TextureLoader().load(plane.url,t=>{if(alive){t.colorSpace=THREE.SRGBColorSpace;setTexture(t)}});
    return()=>{alive=false;tex.dispose()};
  },[plane.url]);
  if(!plane.visible||!texture)return null;
  return <mesh position={plane.position} rotation={plane.rotation.map(v=>v*Math.PI/180) as V}
    renderOrder={plane.overlay?10:-1} raycast={()=>null}>
    <planeGeometry args={[plane.width,plane.width/plane.aspect]}/>
    <meshBasicMaterial map={texture} transparent opacity={plane.opacity} side={THREE.DoubleSide} depthWrite={false} depthTest={!plane.overlay} toneMapped={false}/>
  </mesh>;
}
type Props={
  references?:SpatialReference[];
  inspection?:RegionInspection;
  knifeSegments?:V[]; knifeDraft?:V[]; knifeSnap?:V; canvasKnife?:{onHover:(h:KnifeHit|null)=>void;onPick:(h:KnifeHit)=>void};
  optimizedTriangles?:boolean; vertexColors?:string[]; mirrorTriangles?:boolean; symmetricLight?:boolean;
  data:Data; direction:string; selected:number|null;
  selectedFace?:number|null; selectedFaces?:number[]; selectedEdge?:[number,number]|null;
  onSelect:(i:number|null)=>void; onMove:(i:number,v:V)=>void;
  onSelectFace?:(i:number,additive?:boolean)=>void; onSelectEdge?:(face:number,slot:number)=>void;
  onStartMove?:()=>void; xray?:boolean; showCage?:boolean; cameraRevision?:number; orthographic?:boolean; focus?:V; focusZoom?:number;
};
const keyOf=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;

function Shape({data,selected,selectedFace,selectedFaces,selectedEdge,onSelect,onMove,onSelectFace,onSelectEdge,onStartMove,xray=false,showCage=true,optimizedTriangles=false,vertexColors,mirrorTriangles=true,orbit}:
  Omit<Props,'direction'>&{orbit:React.MutableRefObject<any>}){
  const [handle,setHandle]=useState<THREE.Group|null>(null);
  const dragging=useRef(false),transform=useRef<any>(null),dragIndex=useRef<number|null>(null);
  const selectedRef=useRef(selected);
  selectedRef.current=selected;
  const {mesh,lines,points,stickers,faceGeo,selectedEdgeTube,edgeOwners}=useMemo(()=>{
    const pos=data.vertices.flat(),edgeSet=new Map<string,[number,number]>();
    const edgeOwners=new Map<string,{face:number;slot:number}>();
    let idx:number[]=[];
    try{idx=triangulateFaces(data.vertices,data.faces,optimizedTriangles,mirrorTriangles)}catch{}
    data.faces.forEach((face,fi)=>face.forEach((a,slot)=>{
      const b=face[(slot+1)%face.length],key=keyOf(a,b);
      if(!edgeSet.has(key))edgeSet.set(key,[a,b]);
      if(face.length===4&&!edgeOwners.has(key))edgeOwners.set(key,{face:fi,slot});
    }));
    const mesh=new THREE.BufferGeometry();
    mesh.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    mesh.setIndex(idx);
    mesh.computeVertexNormals();
    const lines=new THREE.BufferGeometry(),edgePos:number[]=[];
    for(const [a,b] of edgeSet.values())edgePos.push(...data.vertices[a],...data.vertices[b]);
    lines.setAttribute('position',new THREE.Float32BufferAttribute(edgePos,3));
    const points=new THREE.BufferGeometry();
    points.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    if(vertexColors?.length===data.vertices.length)points.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors.flatMap(c=>new THREE.Color(c).toArray()),3));
    const stickers=buildPaintStickerGeometry(data);
    const faceGeo=new THREE.BufferGeometry();
    const visibleSelection=(selectedFaces?.length ? selectedFaces : selectedFace!=null ? [selectedFace] : [])
      .filter(i=>i>=0&&i<data.faces.length);
    if(visibleSelection.length){
      try{
        const selectedSet=new Set(visibleSelection);let offset=0;const selectedIndices=data.faces.flatMap((f,i)=>{const size=3*(f.length-2),t=idx.slice(offset,offset+size);offset+=size;return selectedSet.has(i)?t:[]});
        faceGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
        faceGeo.setIndex(selectedIndices);
      }catch{/* Keep the editor responsive if a manual face is invalid. */}
    }
    const selectedEdgeTube=selectedEdge?new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(...data.vertices[selectedEdge[0]]),
        new THREE.Vector3(...data.vertices[selectedEdge[1]])),
      1,.008,6,false):null;
    return {mesh,lines,points,stickers,faceGeo,selectedEdgeTube,edgeOwners};
  },[data,selectedFace,selectedFaces,selectedEdge?.[0],selectedEdge?.[1],optimizedTriangles,vertexColors,mirrorTriangles]);
  const faceForTriangle=useMemo(()=>data.faces.flatMap((f,i)=>Array(Math.max(0,f.length-2)).fill(i) as number[]),[data.faces]);
  useEffect(()=>()=>{mesh.dispose();lines.dispose();points.dispose();stickers.dispose();faceGeo.dispose();selectedEdgeTube?.dispose()},
    [mesh,lines,points,stickers,faceGeo,selectedEdgeTube]);
  useEffect(()=>{if(handle&&selected!==null&&data.vertices[selected]&&!dragging.current)handle.position.set(...data.vertices[selected])},
    [handle,selected,data.vertices]);
  useEffect(()=>()=>{if(orbit.current)orbit.current.enabled=true},[orbit]);
  const current=selected!==null?data.vertices[selected]:null;
  return <>
    <mesh geometry={mesh} onPointerDown={e=>{
      if(e.faceIndex==null||!onSelectFace)return;
      const fi=faceForTriangle[e.faceIndex];
      if(fi!==undefined){e.stopPropagation();onSelectFace(fi,Boolean(e.shiftKey||e.ctrlKey||e.metaKey));}
    }}><meshStandardMaterial color={data.faceColors?.length ? "#161a22" : "#999999"} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1}/></mesh>
    {data.faceColors?.length ? <mesh geometry={stickers} raycast={()=>null}>
      <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} roughness={.45}/>
    </mesh> : null}
    {(selectedFaces?.length||selectedFace!=null)&&<mesh geometry={faceGeo} raycast={()=>null}>
      <meshBasicMaterial color="#1eafff" transparent opacity={.22} depthWrite={false}
        side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2}/>
    </mesh>}
    {showCage&&<lineSegments geometry={lines} onPointerDown={e=>{
      if(e.index===undefined||!onSelectEdge)return;
      const edgeIndex=Math.floor(e.index/2);
      const pair=[...edgeOwners.keys()][edgeIndex];
      if(!pair)return;
      const quad=edgeOwners.get(pair);
      if(quad){e.stopPropagation();onSelectEdge(quad.face,quad.slot);}
    }}><lineBasicMaterial color="#ff791a" depthTest={!xray} depthWrite={false}/></lineSegments>}
    {showCage&&selectedEdgeTube&&<mesh geometry={selectedEdgeTube} raycast={()=>null}>
      <meshBasicMaterial color="#39e8ff" depthTest={false}/>
    </mesh>}
    {(showCage||!!vertexColors)&&<points geometry={points} onPointerDown={e=>{
      e.stopPropagation();if(e.index===undefined||dragging.current||transform.current?.axis)return;
      onSelect(e.index);
    }}><pointsMaterial color={vertexColors?"#ffffff":"#48a4ff"} vertexColors={!!vertexColors} size={vertexColors?.length ? .065 : .045} sizeAttenuation depthTest={!xray&&!vertexColors} depthWrite={false}/></points>}
    {showCage&&current&&<group ref={setHandle} position={current}>
      <mesh><sphereGeometry args={[.027,10,10]}/><meshBasicMaterial color="#f6b72f" depthTest={false}/></mesh>
    </group>}
    {showCage&&current&&handle&&<TransformControls ref={transform} object={handle} mode="translate" space="world"
      onMouseDown={()=>{dragIndex.current=selectedRef.current;dragging.current=true;onStartMove?.();if(orbit.current)orbit.current.enabled=false}}
      onObjectChange={()=>{const i=dragIndex.current;if(i!==null&&handle&&dragging.current)onMove(i,[handle.position.x,handle.position.y,handle.position.z])}}
      onMouseUp={()=>{dragging.current=false;dragIndex.current=null;if(orbit.current)orbit.current.enabled=true}}/>}
  </>;
}
function InspectionShape({data,inspection,showCage,optimizedTriangles,mirrorTriangles}:{data:Data;inspection:RegionInspection;showCage?:boolean;optimizedTriangles?:boolean;mirrorTriangles?:boolean}){
 const g=useMemo(()=>{
  const pos=data.vertices.flat(),make=(idx:number[])=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return geo};
  let target:number[]=[],context:number[]=[];try{({target,context}=partitionRegionTriangles(data,triangulateFaces(data.vertices,data.faces,optimizedTriangles,mirrorTriangles),inspection.faces))}catch{}
  const edge=new Map<string,[number,number]>();for(const i of inspection.faces){const f=data.faces[i];if(f)f.forEach((a,j)=>{const b=f[(j+1)%f.length];edge.set(keyOf(a,b),[a,b])})}
  const line=(p:number[])=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return geo};
  const folds=regionFolds(data,inspection.faces),foldLine=(sign:number)=>line(folds.filter(e=>sign*e.degrees>=5).flatMap(e=>[...data.vertices[e.a],...data.vertices[e.b]]));
  return {target:make(target),context:make(context),wire:line([...edge.values()].flatMap(([a,b])=>[...data.vertices[a],...data.vertices[b]])),concave:foldLine(-1),convex:foldLine(1)};
 },[data,inspection.faces,optimizedTriangles,mirrorTriangles]);
 useEffect(()=>()=>{Object.values(g).forEach(x=>x.dispose())},[g]);
 return <>
  <mesh geometry={g.target} raycast={()=>null}><meshStandardMaterial color={inspection.mode==='contrast'?'#d8ae72':'#b8b8b8'} flatShading side={THREE.DoubleSide}/></mesh>
  {inspection.mode!=='isolate'&&<mesh geometry={g.context} raycast={()=>null} renderOrder={1}><meshStandardMaterial color={inspection.mode==='contrast'?'#456780':'#929ba4'} flatShading side={THREE.DoubleSide} transparent opacity={inspection.opacity} depthWrite={false}/></mesh>}
  {showCage&&<lineSegments geometry={g.wire} raycast={()=>null} renderOrder={2}><lineBasicMaterial color="#ff942f" depthWrite={false}/></lineSegments>}
  {inspection.folds&&<><lineSegments geometry={g.concave} raycast={()=>null} renderOrder={3}><lineBasicMaterial color="#ff4768" depthTest={false} depthWrite={false}/></lineSegments><lineSegments geometry={g.convex} raycast={()=>null} renderOrder={3}><lineBasicMaterial color="#53d8ae" depthTest={false} depthWrite={false}/></lineSegments></>}
 </>;
}

function Camera({direction,bounds,orbit,revision,focus,focusZoom=1}:{direction:string,bounds:{center:THREE.Vector3,radius:number},orbit:React.MutableRefObject<any>,revision:number,focus?:V,focusZoom?:number}){
  const {camera,invalidate,size}=useThree();
  useEffect(()=>{
    const p:Record<string,V>={front:[0,0,4],back:[0,0,-4],side:[4,0,0],left:[-4,0,0],top:[0,4,.001],bottom:[0,-4,.001],angle:[3,1.2,4],low:[3,-2,4],lowLeft:[-3,-2,4],angleLeft:[-3,1.2,4]};
    const dir=new THREE.Vector3(...p[direction]).normalize();
    const fov=40*Math.PI/180;
    const aspect=size.width/Math.max(size.height,1);
    const half=Math.atan(Math.tan(fov/2)*Math.min(1,aspect));
    const target=focus?new THREE.Vector3(...focus):bounds.center;
    const radius=bounds.radius/Math.max(1,focusZoom);
    const distance=radius/Math.sin(half)*1.08;
    if(camera instanceof THREE.OrthographicCamera){const halfHeight=radius*1.12/Math.min(1,aspect);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.zoom=1;}
    camera.position.copy(target).addScaledVector(dir,camera instanceof THREE.OrthographicCamera?bounds.radius*4:distance);
    camera.up.set(0,1,0);camera.lookAt(target);(camera as THREE.PerspectiveCamera|THREE.OrthographicCamera).updateProjectionMatrix();
    if(orbit.current){orbit.current.target.copy(target);orbit.current.update()}
    invalidate();
  },[camera,direction,revision,invalidate,bounds,orbit,size.width,size.height,focus?.[0],focus?.[1],focus?.[2],focusZoom]);
  return null;
}
export function TracePreview(props:Props){
  const orbit=useRef<any>(null);
  const bounds=useMemo(()=>{
    const box=new THREE.Box3();const vertices=props.inspection?regionVertices(props.data,props.inspection.faces).map(i=>props.data.vertices[i]):props.data.vertices;vertices.forEach(v=>box.expandByPoint(new THREE.Vector3(...v)));
    if(box.isEmpty())return {center:new THREE.Vector3(),radius:1};
    const sphere=box.getBoundingSphere(new THREE.Sphere());
    return {center:sphere.center,radius:Math.max(sphere.radius,.05)};
  },[props.data.faces,props.inspection?.faces]);
  return <Canvas key={props.orthographic?'ortho':'perspective'} orthographic={props.orthographic} camera={props.orthographic?{position:[3,1.2,4],near:.001,far:100000}:{position:[3,1.2,4],fov:40}} gl={{antialias:true}}
    raycaster={{params:{Points:{threshold:.045},Line:{threshold:.045}} as any}}>
    <color attach="background" args={['#303030']}/>
    <ambientLight intensity={1.6}/><directionalLight position={[3,4,5]} intensity={props.symmetricLight ? .65:1.3}/><directionalLight position={[-3,4,5]} intensity={props.symmetricLight ? .65:0}/>
    {!props.inspection&&props.references?.map(plane=><ReferencePlane key={plane.id} plane={plane}/>)}
    {props.inspection?<InspectionShape data={props.data} inspection={props.inspection} showCage={props.showCage} optimizedTriangles={props.optimizedTriangles} mirrorTriangles={props.mirrorTriangles}/>:<Shape {...props} selected={props.canvasKnife?null:props.selected} orbit={orbit}/>}
    {!props.inspection&&props.canvasKnife&&<CanvasKnifePicker mesh={props.data} {...props.canvasKnife}/>}
    <KnifeOverlay segments={props.inspection?undefined:props.knifeSegments} radius={bounds.radius}/>
    <KnifeOverlay segments={props.inspection?undefined:props.knifeDraft} radius={bounds.radius} color="#ffd56a" dashed/>
    {!props.inspection&&props.knifeSnap&&<mesh position={props.knifeSnap} renderOrder={42} raycast={()=>null}><sphereGeometry args={[bounds.radius*.014,12,8]}/><meshBasicMaterial color="#ffe08b" toneMapped={false} transparent depthTest={false} depthWrite={false}/></mesh>}
    <Camera direction={props.direction} revision={props.cameraRevision??0} bounds={bounds} orbit={orbit} focus={props.inspection?undefined:props.focus} focusZoom={props.inspection?1:props.focusZoom}/>
    <OrbitControls ref={orbit} makeDefault mouseButtons={!props.inspection&&props.canvasKnife?{LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE}:{LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN}}/>
  </Canvas>;
}

// Use world-space tubes rather than implementation-dependent WebGL line widths.
// Draw after translucent face selection, with exact display color and no picking.
function KnifeOverlay({segments,radius,color='#36f59a',dashed=false}:{segments?:V[];radius:number;color?:string;dashed?:boolean}){
 const parts=useMemo(()=>{
   const result:{position:THREE.Vector3;rotation:THREE.Quaternion;length:number}[]=[];
   for(let i=0;i+1<(segments?.length??0);i+=2){
     const a=new THREE.Vector3(...segments![i]),b=new THREE.Vector3(...segments![i+1]),delta=b.clone().sub(a);
     if(delta.lengthSq()<1e-20)continue;
     result.push({position:a.clone().add(b).multiplyScalar(.5),rotation:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),length:delta.length()});
   }
   return result;
 },[segments]);
 if(!parts.length)return null;
 const width=Math.max(radius*.004,.00001);
 return <group renderOrder={40}>
   {parts.flatMap(p=>dashed?Array.from({length:8},(_,j)=>({...p,position:p.position.clone().add(new THREE.Vector3(0,((j+.5)/8-.5)*p.length,0).applyQuaternion(p.rotation)),length:p.length/16})): [p]).map((p,i)=><mesh key={i} position={p.position} quaternion={p.rotation} renderOrder={40} raycast={()=>null}>
     <cylinderGeometry args={[width,width,p.length,8]}/>
     <meshBasicMaterial color={color} toneMapped={false} transparent depthTest={false} depthWrite={false}/>
   </mesh>)}
   {segments!.map((p,i)=><mesh key={'point-'+i} position={p} renderOrder={41} raycast={()=>null}>
     <sphereGeometry args={[width*2.1,10,8]}/>
     <meshBasicMaterial color={color} toneMapped={false} transparent depthTest={false} depthWrite={false}/>
   </mesh>)}
 </group>;
}
