import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {OrbitControls, TransformControls} from '@react-three/drei';
import * as THREE from 'three';
import {triangulateFaces} from './traceGeometry';

type V=[number,number,number];
type Data={vertices:V[],faces:number[][]};
type Props={
  data:Data; direction:string; selected:number|null;
  selectedFace?:number|null; selectedEdge?:[number,number]|null;
  onSelect:(i:number|null)=>void; onMove:(i:number,v:V)=>void;
  onSelectFace?:(i:number)=>void; onSelectEdge?:(face:number,slot:number)=>void;
  onStartMove?:()=>void;
};
const keyOf=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;

function Shape({data,selected,selectedFace,selectedEdge,onSelect,onMove,onSelectFace,onSelectEdge,onStartMove,orbit}:
  Omit<Props,'direction'>&{orbit:React.MutableRefObject<any>}){
  const [handle,setHandle]=useState<THREE.Group|null>(null);
  const dragging=useRef(false),transform=useRef<any>(null),dragIndex=useRef<number|null>(null);
  const selectedRef=useRef(selected);
  selectedRef.current=selected;
  const {mesh,lines,points,faceGeo,selectedEdgeTube,edgeOwners}=useMemo(()=>{
    const pos=data.vertices.flat(),edgeSet=new Map<string,[number,number]>();
    const edgeOwners=new Map<string,{face:number;slot:number}>();
    let idx:number[]=[];
    try{idx=triangulateFaces(data.vertices,data.faces)}catch{}
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
    const faceGeo=new THREE.BufferGeometry();
    if(selectedFace!=null && data.faces[selectedFace]){
      try{
        const selectedIndices=triangulateFaces(data.vertices,[data.faces[selectedFace]]);
        faceGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
        faceGeo.setIndex(selectedIndices);
      }catch{/* Keep the editor responsive if a manual face is invalid. */}
    }
    const selectedEdgeTube=selectedEdge?new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(...data.vertices[selectedEdge[0]]),
        new THREE.Vector3(...data.vertices[selectedEdge[1]])),
      1,.008,6,false):null;
    return {mesh,lines,points,faceGeo,selectedEdgeTube,edgeOwners};
  },[data,selectedFace,selectedEdge?.[0],selectedEdge?.[1]]);
  const faceForTriangle=useMemo(()=>data.faces.flatMap((f,i)=>Array(Math.max(0,f.length-2)).fill(i) as number[]),[data.faces]);
  useEffect(()=>()=>{mesh.dispose();lines.dispose();points.dispose();faceGeo.dispose();selectedEdgeTube?.dispose()},
    [mesh,lines,points,faceGeo,selectedEdgeTube]);
  useEffect(()=>{if(handle&&selected!==null&&data.vertices[selected]&&!dragging.current)handle.position.set(...data.vertices[selected])},
    [handle,selected,data.vertices]);
  useEffect(()=>()=>{if(orbit.current)orbit.current.enabled=true},[orbit]);
  const current=selected!==null?data.vertices[selected]:null;
  return <>
    <mesh geometry={mesh} onPointerDown={e=>{
      if(e.faceIndex==null||!onSelectFace)return;
      const fi=faceForTriangle[e.faceIndex];
      if(fi!==undefined){e.stopPropagation();onSelectFace(fi);}
    }}><meshStandardMaterial color="#999999" flatShading side={THREE.DoubleSide}/></mesh>
    {selectedFace!=null&&<mesh geometry={faceGeo} raycast={()=>null}>
      <meshBasicMaterial color="#1eafff" transparent opacity={.22} depthWrite={false}
        side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2}/>
    </mesh>}
    <lineSegments geometry={lines} onPointerDown={e=>{
      if(e.index===undefined||!onSelectEdge)return;
      const edgeIndex=Math.floor(e.index/2);
      const pair=[...edgeOwners.keys()][edgeIndex];
      if(!pair)return;
      const quad=edgeOwners.get(pair);
      if(quad){e.stopPropagation();onSelectEdge(quad.face,quad.slot);}
    }}><lineBasicMaterial color="#ff791a" depthTest={false}/></lineSegments>
    {selectedEdgeTube&&<mesh geometry={selectedEdgeTube} raycast={()=>null}>
      <meshBasicMaterial color="#39e8ff" depthTest={false}/>
    </mesh>}
    <points geometry={points} onPointerDown={e=>{
      e.stopPropagation();if(e.index===undefined||dragging.current||transform.current?.axis)return;
      onSelect(e.index);
    }}><pointsMaterial color="#48a4ff" size={.045} sizeAttenuation depthTest={false}/></points>
    {current&&<group ref={setHandle} position={current}>
      <mesh><sphereGeometry args={[.027,10,10]}/><meshBasicMaterial color="#f6b72f" depthTest={false}/></mesh>
    </group>}
    {current&&handle&&<TransformControls ref={transform} object={handle} mode="translate" space="world"
      onMouseDown={()=>{dragIndex.current=selectedRef.current;dragging.current=true;onStartMove?.();if(orbit.current)orbit.current.enabled=false}}
      onObjectChange={()=>{const i=dragIndex.current;if(i!==null&&handle&&dragging.current)onMove(i,[handle.position.x,handle.position.y,handle.position.z])}}
      onMouseUp={()=>{dragging.current=false;dragIndex.current=null;if(orbit.current)orbit.current.enabled=true}}/>}
  </>;
}
function Camera({direction,bounds,orbit}:{direction:string,bounds:{center:THREE.Vector3,radius:number},orbit:React.MutableRefObject<any>}){
  const {camera,invalidate,size}=useThree();
  useEffect(()=>{
    const p:Record<string,V>={front:[0,0,4],back:[0,0,-4],angle:[3,1.2,4],low:[3,-2,4]};
    const dir=new THREE.Vector3(...p[direction]).normalize();
    const fov=(camera as THREE.PerspectiveCamera).fov*Math.PI/180;
    const aspect=size.width/Math.max(size.height,1);
    const half=Math.atan(Math.tan(fov/2)*Math.min(1,aspect));
    const distance=bounds.radius/Math.sin(half)*1.08;
    camera.position.copy(bounds.center).addScaledVector(dir,distance);
    camera.up.set(0,1,0);camera.lookAt(bounds.center);camera.updateProjectionMatrix();
    if(orbit.current){orbit.current.target.copy(bounds.center);orbit.current.update()}
    invalidate();
  },[camera,direction,invalidate,bounds,orbit,size.width,size.height]);
  return null;
}
export function TracePreview(props:Props){
  const orbit=useRef<any>(null);
  const bounds=useMemo(()=>{
    const box=new THREE.Box3();props.data.vertices.forEach(v=>box.expandByPoint(new THREE.Vector3(...v)));
    if(box.isEmpty())return {center:new THREE.Vector3(),radius:1};
    const sphere=box.getBoundingSphere(new THREE.Sphere());
    return {center:sphere.center,radius:Math.max(sphere.radius,.05)};
  },[props.data.faces]);
  return <Canvas camera={{position:[3,1.2,4],fov:40}} gl={{antialias:true}}
    raycaster={{params:{Points:{threshold:.045},Line:{threshold:.045}} as any}}>
    <color attach="background" args={['#303030']}/>
    <ambientLight intensity={1.6}/><directionalLight position={[3,4,5]} intensity={1.3}/>
    <Shape {...props} orbit={orbit}/>
    <Camera direction={props.direction} bounds={bounds} orbit={orbit}/>
    <OrbitControls ref={orbit} makeDefault/>
  </Canvas>;
}
