import React, {useEffect, useMemo, useRef, useState} from 'react';
import './topology-workbench.css';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {TracePreview,type SpatialReference} from './TracePreview';
import {SurfaceQualityPanel} from './SurfaceQualityPanel';
import {CalibrationWorkbench} from './CalibrationWorkbench';
import {ProfileCalibrationPanel} from './ProfileCalibrationPanel';
import {assertRegionProtected,slideOnEdge} from './regionEditing';
import {slideContinuousEdgeLoop} from './loopSlide';
import {KnifePanel} from './KnifePanel';
import {triangulateFaces,triangulateFacesWithReport} from './traceGeometry';
import {createRubikControlMesh,RUBIK_FACE_COLORS} from './rubikPreset';
import {buildEditableGeometry} from '../studioProject';
import {findCoplanarFaceIds,findMatchingColorFaceIds,moveWithSymmetry,paintFaces} from './topologySelection';
import type {SymmetryAxis} from './topologySelection';
import {createPrimitiveControlMesh,insertQuadEdgeLoop,splitQuadLocally,insetControlFace,extrudeControlFace,mirrorControlMeshX,validateControlTopology} from './meshTopology';
import type {ControlMesh} from '../types';

type V=[number,number,number];
type View='front'|'side'|'back'|'top'|'bottom';
type Geometry=ControlMesh;
type MeshHistory={geometry:Geometry|null;edited:number[];metadata:Record<string,unknown>;dirty:boolean};

type ReferenceTracingProps = {
  onClose: () => void;
  active: boolean;
  sceneEdit?: { name: string; mesh: ControlMesh; onApply: (mesh: ControlMesh) => void };
};
type Calibration={cx:number,cy:number,scale:number};
const initialCalibration=():Record<View,Calibration>=>Object.fromEntries(['front','side','back','top','bottom'].map(v=>[v,{cx:500,cy:500,scale:450}])) as Record<View,Calibration>;
const views: {id:View,label:string,cell:number}[]=[{id:'front',label:'正面',cell:0},{id:'side',label:'侧面',cell:1},{id:'back',label:'背面',cell:2},{id:'top',label:'顶部',cell:6},{id:'bottom',label:'底部',cell:7}];
const project=(v:V,view:View):[number,number]=>view==='front'?[v[0],v[1]]:view==='side'?[-v[2],v[1]]:view==='back'?[-v[0],v[1]]:view==='top'?[v[0],-v[2]]:[v[0],v[2]];
const replaceProjection=(v:V,view:View,x:number,y:number):V=>view==='front'?[x,y,v[2]]:view==='side'?[v[0],y,-x]:view==='back'?[-x,y,v[2]]:view==='top'?[x,v[1],-y]:[x,v[1],y];
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const btn='topo-button rounded border px-3 py-1.5 text-sm disabled:opacity-40';
const RUBIK_COLOR_LABELS:Record<keyof typeof RUBIK_FACE_COLORS,string>={
  right:'右 · 红',left:'左 · 橙',top:'上 · 白',bottom:'下 · 黄',front:'前 · 绿',back:'后 · 蓝',
};
const MAX_VERTICES=5000,MAX_FACES=10000,MAX_REFERENCES=30000,MAX_FILE=10*1024*1024,MAX_IMAGE=5*1024*1024;
const readGeometry=(d:any):Geometry=>{let raw=d.vertices??d.verts,faces=Array.isArray(d.control)?d.control:d.faces;if(!Array.isArray(raw)||!Array.isArray(faces))throw Error('需要 vertices/verts 和 faces/control 数组');if(raw.length&&typeof raw[0]==='number'){if(raw.length%3)throw Error('顶点坐标数量不是 3 的倍数');raw=Array.from({length:raw.length/3},(_,i)=>raw.slice(3*i,3*i+3))}if(raw.length>MAX_VERTICES||faces.length>MAX_FACES||faces.reduce((n:number,f:any)=>n+(Array.isArray(f)?f.length:0),0)>MAX_REFERENCES)throw Error('超过限制：最多 5000 顶点、10000 控制面及 30000 个面顶点引用');if(raw.some((v:any)=>!Array.isArray(v)||v.length!==3||v.some((x:any)=>typeof x!=='number'||!Number.isFinite(x))))throw Error('顶点应是有限的 [x,y,z] 坐标');if(faces.some((f:any)=>!Array.isArray(f)||f.length<3||f.length>64||f.some((i:any)=>!Number.isInteger(i)||i<0||i>=raw.length)))throw Error('控制面索引无效');if(d.faceColors!==undefined&&(!Array.isArray(d.faceColors)||d.faceColors.length!==faces.length||d.faceColors.some((c:unknown)=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))))throw Error('逐面颜色必须与控制面数量一致且为 #RRGGBB');return {vertices:raw.map((v:number[])=>[...v] as V),faces:faces.map((f:number[])=>[...f]),...(d.faceColors?{faceColors:[...d.faceColors]}:{})}};

function CoordinateInput({axis,value,onCommit,onDraft}:{axis:string,value:number,onCommit:(n:number)=>void,onDraft:(dirty:boolean)=>void}){const [draft,setDraft]=useState(String(value));const editing=useRef(false);useEffect(()=>{if(!editing.current)setDraft(String(value))},[value]);return <label>{axis}<input aria-label={`顶点 ${axis}`} className="w-full bg-neutral-800 p-1" type="text" inputMode="decimal" data-trace-draft="true" data-dirty={draft!==String(value)} value={draft} onFocus={()=>{editing.current=true}} onChange={e=>{setDraft(e.target.value);onDraft(e.target.value!==String(value))}} onBlur={()=>{editing.current=false;const n=Number(draft);if(draft.trim()!==''&&Number.isFinite(n)){if(n!==value)onCommit(n);setDraft(String(n))}else {onDraft(true);return}onDraft(false)}} onKeyDown={e=>{if(e.key==='Enter'&&draft.trim()!==''&&Number.isFinite(Number(draft)))e.currentTarget.blur()}}/></label>}

export function ReferenceTracing({onClose,active,sceneEdit}:ReferenceTracingProps){
 const [projectSpatialView, setProjectSpatialView] = useState(true);
 const [calibrationMode,setCalibrationMode]=useState(false);
 const [references,setReferences]=useState<SpatialReference[]>([]);
 const [referenceId,setReferenceId]=useState('');
 const [referenceError,setReferenceError]=useState('');
 const [referenceLoading,setReferenceLoading]=useState(false);
 const refInputBusy=useRef(false);
 const currentReference=references.find(p=>p.id===referenceId);
 const changeReference=(patch:Partial<SpatialReference>)=>setReferences(old=>old.map(p=>p.id===referenceId?{...p,...patch}:p));
 const addReference=async(e:React.ChangeEvent<HTMLInputElement>)=>{
   const input=e.currentTarget,file=input.files?.[0];input.value='';
   if(!file||refInputBusy.current)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){setReferenceError('仅支持 5 MB 以内 PNG、JPEG、WebP');return}
   if(references.length>=6){setReferenceError('最多同时使用 6 张参考图');return}
   refInputBusy.current=true;setReferenceLoading(true);setReferenceError('');
   try{
     const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('读取失败'));reader.readAsDataURL(file)});
     const aspect=await new Promise<number>((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve(img.naturalWidth/img.naturalHeight):reject(Error('无效尺寸'));img.onerror=()=>reject(Error('图片无法解码'));img.src=url});
     const id=crypto.randomUUID();
     setReferences(old=>[...old,{id,name:file.name,url,aspect,position:[0,0,-.6],rotation:[0,0,0],width:Math.max(1,aspect),opacity:.55,visible:true,overlay:false}]);
     setReferenceId(id);
   }catch(err){setReferenceError(String(err))}finally{refInputBusy.current=false;setReferenceLoading(false)}
 };
 const referencePanel=<details open className="topo-inspector-card space-y-2">
   <summary className="cursor-pointer font-semibold">空间参考图 · {references.length}</summary>
   <p className="topo-helptext">独立辅助平面，仅在 3D 编辑中显示；不会参与选点、布线或 GLB 导出。</p>
   <label className={btn+' inline-block cursor-pointer'}>上传空间参考图<input type="file" aria-label="上传空间参考图" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={referenceLoading||references.length>=6} onChange={addReference}/></label>
   {referenceError&&<p role="alert" className="text-amber-300">{referenceError}</p>}
   {references.length>0&&<select aria-label="当前空间参考图" className="w-full bg-neutral-800 p-2" value={referenceId} onChange={e=>setReferenceId(e.target.value)}>{references.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
   {currentReference&&<>
     <div className="flex flex-wrap gap-1">{([
       ['正面',[0,0,-.6],[0,0,0]],['侧面',[-.6,0,0],[0,90,0]],['背面',[0,0,.6],[0,180,0]],['俯视',[0,-.6,0],[-90,0,0]],['仰视',[0,.6,0],[90,0,0]]
     ] as [string,V,V][]).map(([label,position,rotation])=><button key={label} className={btn} onClick={()=>changeReference({position,rotation})}>{label}参考</button>)}</div>
     {(['position','rotation'] as const).map(key=><div key={key}><p>{key==='position'?'位置 XYZ':'旋转 XYZ（度）'}</p><div className="grid grid-cols-3 gap-1">{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}<input aria-label={'参考图 '+(key==='position'?'位置 ':'旋转 ')+axis} className="w-full bg-neutral-800 p-1" type="number" step={key==='position'?.05:5} value={currentReference[key][i]} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)){const v=[...currentReference[key]] as V;v[i]=n;changeReference({[key]:v})}}}/></label>)}</div></div>)}
     <label className="block">宽度（保持图片比例）<input aria-label="参考图宽度" className="w-full bg-neutral-800 p-1" type="number" min=".01" max="100" step=".05" value={currentReference.width} onChange={e=>{const n=e.target.valueAsNumber;if(n>=.01&&n<=100)changeReference({width:n})}}/></label>
     <label className="block">透明度 {Math.round(currentReference.opacity*100)}%<input aria-label="空间参考图透明度" className="w-full" type="range" min="0" max="1" step=".01" value={currentReference.opacity} onChange={e=>changeReference({opacity:+e.target.value})}/></label>
     <div className="flex flex-wrap gap-2"><label><input type="checkbox" checked={currentReference.visible} onChange={e=>changeReference({visible:e.target.checked})}/> 显示</label><label><input type="checkbox" checked={currentReference.overlay} onChange={e=>changeReference({overlay:e.target.checked})}/> 前景叠加</label></div>
     <button className={btn} onClick={()=>{const remaining=references.filter(p=>p.id!==referenceId);setReferences(remaining);setReferenceId(remaining[0]?.id??'')}}>移除当前参考图</button>
   </>}
   <p className="topo-helptext">本轮参考图为临时工作区内容，关闭编辑器后不保留。</p>
 </details>;
 // An editor for a scene layer is mounted per session and edits its own copy.
 const [geometry, setGeometry] = useState<Geometry | null>(() => sceneEdit ? readGeometry(sceneEdit.mesh) : null);
 const [locked,setLocked]=useState<number[]>([]);
 const [slideTarget,setSlideTarget]=useState('');
 const [slideFraction,setSlideFraction]=useState(.25);
 const [loopChain,setLoopChain]=useState<number[]>([]);
 const [loopGuide,setLoopGuide]=useState('');
 const [ringSlideFraction,setRingSlideFraction]=useState(.25);
 const [loopMirror,setLoopMirror]=useState(false);
 const [loopClosed,setLoopClosed]=useState(false);
 const loopPreview=useMemo(()=>{try{
   if(!geometry||loopChain.length<2||loopGuide==='')return {result:null,error:''};
   return {result:slideContinuousEdgeLoop(geometry,loopChain,Number(loopGuide),ringSlideFraction,{mirrorX:loopMirror,closed:loopClosed}),error:''};
 }catch(e){return {result:null,error:String(e)}}
 },[geometry,loopChain,loopGuide,ringSlideFraction,loopMirror,loopClosed]);

 const [past,setPast]=useState<MeshHistory[]>([]);
 const [optimizedTriangles,setOptimizedTriangles]=useState(false);
 const [mirrorTriangles,setMirrorTriangles]=useState(true);
 const [symmetricLight,setSymmetricLight]=useState(false);
 const renderMirrorReport=useMemo(()=>{try{return geometry?.faces.length?triangulateFacesWithReport(geometry.vertices,geometry.faces,optimizedTriangles,mirrorTriangles).report:null}catch{return null}},[geometry,optimizedTriangles,mirrorTriangles]);
 const [qualityColors,setQualityColors]=useState<string[]|undefined>();
 const [future,setFuture]=useState<MeshHistory[]>([]);
 const dragRecorded=useRef(false);
 const [insetFraction,setInsetFraction]=useState(.25);
 const [xray,setXray]=useState(false);
 const [cameraRevision,setCameraRevision]=useState(0);
 const previewRegionRef=useRef<HTMLDivElement>(null);
 // R3F camera bounds are recalculated when the canvas changes its width/height.
 // Schedule another reset after React has committed the resized scene, so
 // OrbitControls cannot retain an out-of-frame target on short/mobile windows.
 useEffect(()=>{
   if(!active)return;
   let frame=0;
   const recenter=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setCameraRevision(i=>i+1))};
   window.addEventListener('resize',recenter);
   return()=>{window.removeEventListener('resize',recenter);cancelAnimationFrame(frame)};
 },[active]);
 const [showCage,setShowCage]=useState(!Boolean(sceneEdit?.mesh.faceColors?.length));
 const [extrudeDistance,setExtrudeDistance]=useState(.2);
 const [toolPanel,setToolPanel]=useState<'topology'|'model'|'paint'|'inspect'|'reference'>(()=>sceneEdit?.mesh.faceColors?.length?'paint':'topology');
 const [paintColor,setPaintColor]=useState<string>(RUBIK_FACE_COLORS.right);
 const [selectedFaces,setSelectedFaces]=useState<number[]>([]);
 const [symmetryAxes,setSymmetryAxes]=useState<SymmetryAxis[]>([]);
 const [advancedOpen,setAdvancedOpen]=useState(false);
 const [selectionExpanded,setSelectionExpanded]=useState(false);
 const [inspectorExpanded,setInspectorExpanded]=useState(false);
 const toolScrollRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(toolScrollRef.current)toolScrollRef.current.scrollTop=0},[toolPanel]);
 useEffect(()=>{
   if(!active||!projectSpatialView)return;
   const frame=requestAnimationFrame(()=>setCameraRevision(i=>i+1));
   return()=>cancelAnimationFrame(frame);
 },[active,projectSpatialView,inspectorExpanded]);
 const [view,setView]=useState<View>('front'),[sourceMetadata,setSourceMetadata]=useState<Record<string,unknown>>({}),[image,setImage]=useState(''),[grid,setGrid]=useState(true),[opacity,setOpacity]=useState(.6),[calibration,setCalibration]=useState(initialCalibration),[selected,setSelected]=useState<number|null>(null),[edited,setEdited]=useState<number[]>([]),[dirty,setDirty]=useState(false),[referenceDirty,setReferenceDirty]=useState(false),[draftDirty,setDraftDirty]=useState(false),[selectedFace,setSelectedFace]=useState<number|null>(null),[selectedEdgeSlot,setSelectedEdgeSlot]=useState(0),[loopFraction,setLoopFraction]=useState(.5),[loopInfo,setLoopInfo]=useState(''),[loading,setLoading]=useState(false),[imageSquare,setImageSquare]=useState(true),[mode,setMode]=useState<'select'|'point'|'face'>('select'),[constraint,setConstraint]=useState<'both'|'horizontal'|'vertical'>('both'),[depth,setDepth]=useState(0),[depthText,setDepthText]=useState('0'),[faceDraft,setFaceDraft]=useState<number[]>([]),[preview,setPreview]=useState(false),[previewLarge,setPreviewLarge]=useState(false),[previewDirection,setPreviewDirection]=useState('angle'),[error,setError]=useState(''),[drag,setDrag]=useState(false),[showLabels,setShowLabels]=useState(true),[showAll,setShowAll]=useState(false),[backup,setBackup]=useState<{geometry:Geometry|null,image:string,imageSquare:boolean,grid:boolean,opacity:number,calibration:Record<View,Calibration>,metadata:Record<string,unknown>,edited:number[],showAll:boolean}|null>(null);const dialogRef=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),busy=useRef(false),referenceBaseline=useRef({image:'',imageSquare:true,grid:true,opacity:.6,calibration:initialCalibration(),showAll:false});const start=()=>{if(busy.current)return false;busy.current=true;setLoading(true);return true};const stop=()=>{busy.current=false;setLoading(false)};
 useEffect(()=>{if(!referenceDirty&&!loading)referenceBaseline.current={image,imageSquare,grid,opacity,calibration,showAll}},[referenceDirty,loading,image,imageSquare,grid,opacity,calibration,showAll]);
 useEffect(()=>{if(!dirty&&!referenceDirty&&!draftDirty&&!faceDraft.length)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,referenceDirty,draftDirty,faceDraft.length]);
 const pendingDraft=()=>dialogRef.current?.querySelector<HTMLInputElement>('input[data-trace-draft="true"][data-dirty="true"]');
 const protectDraft=(e:React.PointerEvent<HTMLDivElement>)=>{const input=pendingDraft();if(!input||e.target===input||(e.target as Element).closest('[data-trace-close]'))return;const text=input.value.trim();if(!text||!Number.isFinite(Number(text))){e.preventDefault();e.stopPropagation();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus();return}if(document.activeElement===input)input.blur()};
 const protectDraftClick=(e:React.MouseEvent<HTMLDivElement>)=>{const input=pendingDraft();if(!input||e.target===input||(e.target as Element).closest('[data-trace-close]'))return;const text=input.value.trim();if(!text||!Number.isFinite(Number(text))){e.preventDefault();e.stopPropagation();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus()}};
 const protectDraftKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{if(e.key!=='Tab')return;const input=pendingDraft();if(input&&(!input.value.trim()||!Number.isFinite(Number(input.value)))){e.preventDefault();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus()}};
 useEffect(()=>{
   if(!active||!previewRegionRef.current)return;
   let frame1=0,frame2=0;
   const schedule=()=>{
     cancelAnimationFrame(frame1);cancelAnimationFrame(frame2);
     // Let the canvas ResizeObserver / R3F update its actual drawing size
     // before resetting OrbitControls to the new fitting distance.
     frame1=requestAnimationFrame(()=>{
       frame2=requestAnimationFrame(()=>setCameraRevision(i=>i+1));
     });
   };
   const observer=new ResizeObserver(schedule);
   observer.observe(previewRegionRef.current);
   return()=>{observer.disconnect();cancelAnimationFrame(frame1);cancelAnimationFrame(frame2)};
 },[active,projectSpatialView,preview,previewLarge,inspectorExpanded]);
 const cell=views.find(v=>v.id===view)!.cell;const {cx,cy,scale}=calibration[view];const updateCalibration=(patch:Partial<Calibration>)=>{setReferenceDirty(true);setCalibration(old=>({...old,[view]:{...old[view],...patch}}))};const setCx=(v:number)=>updateCalibration({cx:v});const setCy=(v:number)=>updateCalibration({cy:v});const setScale=(v:number)=>updateCalibration({scale:v});
 const {edges,visible}=useMemo(()=>{const set=new Set<string>(),visible=new Set<number>();const camera:Record<View,V>={front:[0,0,1],side:[1,0,0],back:[0,0,-1],top:[0,1,0],bottom:[0,-1,0]};geometry?.faces.forEach(f=>{let nx=0,ny=0,nz=0;for(let i=0;i<f.length;i++){const a=geometry.vertices[f[i]],b=geometry.vertices[f[(i+1)%f.length]];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1])}const d=camera[view],facing=nx*d[0]+ny*d[1]+nz*d[2];if(!showAll&&facing<=1e-10)return;f.forEach((a,i)=>{visible.add(a);const b=f[(i+1)%f.length];set.add(a<b?`${a},${b}`:`${b},${a}`)})});if(geometry){const used=new Set(geometry.faces.flat());geometry.vertices.forEach((_,i)=>{if(!used.has(i))visible.add(i)})}return {edges:[...set].map(k=>k.split(',').map(Number)),visible}},[geometry,view,showAll]);
 const edgeToQuad=useMemo(()=>{const result=new Map<string,{face:number,slot:number}>();geometry?.faces.forEach((face,fi)=>{if(face.length!==4)return;face.forEach((id,slot)=>{const next=face[(slot+1)%4],key=id<next?`${id}:${next}`:`${next}:${id}`;if(!result.has(key))result.set(key,{face:fi,slot})})});return result},[geometry]);
 const baseCube=createPrimitiveControlMesh('box');
 const isBaseBox=Boolean(geometry && geometry.vertices.length===8 && geometry.faces.length===6 &&
   JSON.stringify(geometry.vertices)===JSON.stringify(baseCube.vertices) &&
   JSON.stringify(geometry.faces)===JSON.stringify(baseCube.faces));
 const chooseFace=(fi:number,additive=false)=>{
   if(!geometry?.faces[fi])return;
   const next=additive
     ? selectedFaces.includes(fi)?selectedFaces.filter(i=>i!==fi):[...selectedFaces,fi]
     : [fi];
   setSelectedFaces(next);setSelectedFace(next.length?next[next.length-1]:null);
   setSelectedEdgeSlot(0);setError('');setLoopInfo('');
 };
 const chooseFaceGroup=(kind:'plane'|'color')=>{
   if(!geometry||selectedFace===null)return;
   const ids=kind==='plane'?findCoplanarFaceIds(geometry,selectedFace):
     findMatchingColorFaceIds(geometry,selectedFace);
   if(!ids.length){setError('没有找到满足条件的控制面');return;}
   setSelectedFaces(ids);
   setLoopInfo(`已选择 ${ids.length} 个${kind==='plane'?'共面':'同色'}控制面，可一次配色。`);
 };
 const clearFaces=()=>{setSelectedFace(null);setSelectedFaces([]);setLoopInfo('');setError('')};
 const selectedLoopFace=selectedFace===null?null:geometry?.faces[selectedFace];
 const selectedLoopEdge=selectedLoopFace?.length===4?[selectedLoopFace[selectedEdgeSlot],selectedLoopFace[(selectedEdgeSlot+1)%4]]:null;
 const selectedSummary=selectedFaces.length>1?`已选 ${selectedFaces.length} 个控制面`:
   selectedFace!==null?`面 #${selectedFace}`:
   selected!==null?`顶点 #${selected}`:'未选择元素';
 const tabDetails={
   reference:'上传和调整独立三维参考平面',
   topology:'添加与分割边线 · 先选择四边面的一条边',
   model:'移动顶点，或对选中控制面执行内插与挤出',
   paint:'选择一个或多个控制面，统一设置颜色',
   inspect:'核对顶点数量、面连接与网格完整性',
 } as const;
 const meshQuality=useMemo(()=>{
   if(!geometry)return null;
   try{const {edges,boundaryEdges}=validateControlTopology(geometry);return {edges,boundaryEdges,error:''}}
   catch(e){return {edges:0,boundaryEdges:0,error:String(e instanceof Error?e.message:e)}}
 },[geometry]);
 const triangulationError=useMemo(()=>{if((!preview&&!sceneEdit)||!geometry?.faces.length)return '';try{triangulateFaces(geometry.vertices,geometry.faces);return ''}catch(e){return String(e)}},[geometry,preview,sceneEdit]);
 const screen=(v:V)=>{const [x,y]=project(v,view);return [cx+x*scale,cy-y*scale]};
 const snapshot=():MeshHistory=>({geometry,edited,metadata:sourceMetadata,dirty});
 const remember=()=>{setPast(p=>[...p.slice(-49),snapshot()]);setFuture([])};
 const restoreSnapshot=(state:MeshHistory)=>{
   setGeometry(state.geometry);setEdited(state.edited);setSourceMetadata(state.metadata);setDirty(state.dirty);
   setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setLoopInfo('');setError('');
 };
 const undoMesh=()=>{if(!past.length||busy.current||draftDirty||faceDraft.length)return;
   if(locked.length){setError('区域锁定期间请先解锁再撤销');return}
   setFuture(f=>[...f,snapshot()]);restoreSnapshot(past[past.length-1]);setPast(p=>p.slice(0,-1));};
 const redoMesh=()=>{if(!future.length||busy.current||draftDirty||faceDraft.length)return;
   if(locked.length){setError('区域锁定期间请先解锁再重做');return}
   setPast(p=>[...p,snapshot()]);restoreSnapshot(future[future.length-1]);setFuture(f=>f.slice(0,-1));};
 const historyKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{
   protectDraftKey(e);
   if(e.key==='Escape' && !(e.target as Element).closest('input,textarea,[contenteditable="true"]') && !faceDraft.length){
     if(selected!==null||selectedFace!==null){setSelected(null);clearFaces();e.preventDefault()}
     return;
   }
   if(!(e.ctrlKey||e.metaKey)||e.altKey||
     (e.target as Element).closest('input,textarea,[contenteditable="true"]'))return;
   const key=e.key.toLowerCase();
   if(key==='z'||key==='y'){
     const redo=key==='y'||e.shiftKey;
     if(redo?future.length:past.length){e.preventDefault();redo?redoMesh():undoMesh();}
   }
 };
 const commitMesh=(next:Geometry,label:string)=>{
   if(!geometry)return;
   assertRegionProtected(geometry,next,locked);
   validateControlTopology(next);
   triangulateFaces(next.vertices,next.faces);
   const oldCount=geometry.vertices.length;
   remember();setGeometry(next);setDirty(true);setSelected(null);setSelectedFace(null);setSelectedFaces([]);
   setLoopInfo(label);setError('');
   setSourceMetadata(old=>{
     const m=old.meta;if(!m||typeof m!=='object')return old;
     const meta=m as Record<string,unknown>,tags=meta.tags;
     if(!Array.isArray(tags)||tags.length!==oldCount)return old;
     return {...old,meta:{...meta,tags:[
       ...tags,...Array.from({length:Math.max(0,next.vertices.length-oldCount)},
         ()=>({source:label,depth:'拓扑编辑生成'}))
     ]}};
   });
 };
 const operateMesh=(operation:()=>Geometry,label:string)=>{
   if(!geometry||draftDirty||faceDraft.length||busy.current)return;
   try{commitMesh(operation(),label)}catch(e){setError('拓扑操作失败：'+String(e instanceof Error?e.message:e))}
 };
 const update=(id:number,v:V)=>{
   if(busy.current||!geometry)return;
   const result=moveWithSymmetry(geometry,id,v,symmetryAxes);
   try{assertRegionProtected(geometry,{...geometry,vertices:result.vertices},locked)}catch(e){setError(String(e));return}
   setDirty(true);
   setEdited(old=>[...new Set([...old,...result.changed])]);
   setGeometry(g=>g?{...g,vertices:moveWithSymmetry(g,id,v,symmetryAxes).vertices}:g);
 };
 const pointer=(e:React.PointerEvent<SVGSVGElement>)=>{if(!drag||selected===null||!geometry||!svg.current)return;const pt=svg.current.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.current.getScreenCTM()!.inverse()),original=project(geometry.vertices[selected],view),x=constraint==='vertical'?original[0]:(p.x-cx)/scale,y=constraint==='horizontal'?original[1]:(cy-p.y)/scale;if(!dragRecorded.current){remember();dragRecorded.current=true;}update(selected,replaceProjection(geometry.vertices[selected],view,x,y));};
 const readData=(file:File)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
 const imageInfo=(url:string)=>new Promise<boolean>((resolve,reject)=>{if(!/^data:image\/(png|jpeg|webp);base64,/i.test(url))return reject(Error('只支持 PNG、JPEG、WebP 参考图'));const im=new Image();im.onload=()=>{if(im.naturalWidth>8192||im.naturalHeight>8192||im.naturalWidth*im.naturalHeight>16000000)reject(Error('图片尺寸过大，最多 1600 万像素且边长不超过 8192'));else resolve(Math.abs(im.naturalWidth/im.naturalHeight-1)<.01)};im.onerror=()=>reject(Error('参考图无法读取'));im.src=url});
 const loadMesh=async(e:React.ChangeEvent<HTMLInputElement>)=>{if(locked.length){e.currentTarget.value='';setError('请先解锁区域');return}const target=e.currentTarget,file=target.files?.[0];if(!file||dirty||draftDirty||faceDraft.length>0||!start()){target.value='';return}try{if(file.size>MAX_FILE)throw Error('JSON 超过 10 MB');const d=JSON.parse(await file.text()),next=readGeometry(d),ref=d.reference,hasRef=ref&&['image','grid','showAll','opacity','calibration'].some(k=>k in ref);if(referenceDirty&&hasRef)throw Error('当前参考图或标定尚未保存，不能被导入文件覆盖');let square=imageSquare;if(typeof ref?.image==='string'&&ref.image){if(ref.image.length>MAX_IMAGE*1.4)throw Error('JSON 中的参考图超过 5 MB');square=await imageInfo(ref.image)}const {vertices,verts,faces,control,faceColors,reference,...extra}=d;setGeometry(next);setPast([]);setFuture([]);setSourceMetadata(extra);if(ref){if(typeof ref.image==='string'){setImage(ref.image);setImageSquare(square)}if(typeof ref.grid==='boolean')setGrid(ref.grid&&square);if(typeof ref.showAll==='boolean')setShowAll(ref.showAll);if(Number.isFinite(ref.opacity))setOpacity(Math.max(0,Math.min(1,ref.opacity)));if(ref.calibration){const nextCal=initialCalibration();for(const v of views){const c=ref.calibration[v.id];if(c&&[c.cx,c.cy,c.scale].every(Number.isFinite)&&c.scale>=50&&c.scale<=700)nextCal[v.id]={cx:c.cx,cy:c.cy,scale:c.scale}}setCalibration(nextCal)}if(hasRef)setReferenceDirty(false)}setEdited(Array.isArray(ref?.editedVertexIds)?ref.editedVertexIds.filter((i:unknown)=>Number.isInteger(i)):[]);setDirty(false);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setError('')}catch(x){setError('载入失败：'+String(x))}finally{target.value='';stop()}};
 const undoReference=()=>{if(busy.current)return;const b=referenceBaseline.current;setImage(b.image);setImageSquare(b.imageSquare);setGrid(b.grid);setOpacity(b.opacity);setCalibration(b.calibration);setShowAll(b.showAll);setReferenceDirty(false);setError('')};
 const restoreBackup=()=>{if(locked.length){setError('请先解锁区域');return}if(!backup||dirty||referenceDirty||draftDirty||faceDraft.length>0||busy.current)return;setGeometry(backup.geometry);setPast([]);setFuture([]);setImage(backup.image);setImageSquare(backup.imageSquare);setGrid(backup.grid);setOpacity(backup.opacity);setCalibration(backup.calibration);setSourceMetadata(backup.metadata);setEdited(backup.edited);setShowAll(backup.showAll);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setMode('select');setDirty(false);setReferenceDirty(false);setBackup(null)};
 const loadImage=async(e:React.ChangeEvent<HTMLInputElement>)=>{const target=e.currentTarget,file=target.files?.[0];if(!file||referenceDirty||!start()){target.value='';return}try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('只支持 PNG、JPEG、WebP，不支持 SVG');if(file.size>MAX_IMAGE)throw Error('参考图超过 5 MB');const url=await readData(file),square=await imageInfo(url);setImage(url);setImageSquare(square);if(!square)setGrid(false);setReferenceDirty(true);setError('')}catch(e){setError('载入图片失败：'+String(e))}finally{target.value='';stop()}};
 const newMesh=()=>{if(locked.length){setError('请先解锁区域');return}if(dirty||draftDirty||faceDraft.length>0||backup||busy.current)return;if(geometry||image)setBackup({geometry,image,imageSquare,grid,opacity,calibration,metadata:sourceMetadata,edited,showAll});setGeometry({vertices:[],faces:[]});setPast([]);setFuture([]);setSourceMetadata({});setEdited([]);setDirty(true);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setMode('point')};
 const canvasPoint=(e:React.PointerEvent<SVGSVGElement>)=>{if(locked.length&&mode==='point'){setError('请先解锁区域再增加顶点');return}if(mode!=='point'||!geometry||!svg.current||busy.current||geometry.vertices.length>=MAX_VERTICES)return;const pt=svg.current.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const depthValue=Number(depthText);if(depthText.trim()===''||!Number.isFinite(depthValue)){setError('隐藏轴坐标无效，请输入有限数字后再放点');return}const p=pt.matrixTransform(svg.current.getScreenCTM()!.inverse()),x=(p.x-cx)/scale,y=(cy-p.y)/scale,v=replaceProjection(view==='side'?[depthValue,0,0]:view==='top'||view==='bottom'?[0,depthValue,0]:[0,0,depthValue],view,x,y);setError('');remember();setGeometry(g=>g?{...g,vertices:[...g.vertices,v]}:g);setSourceMetadata(old=>{const m=old.meta;if(!m||typeof m!=='object')return old;const obj=m as Record<string,unknown>,tags=obj.tags;if(!Array.isArray(tags)||tags.length!==geometry.vertices.length)return old;return {...old,meta:{...obj,tags:[...tags,{source:'手工放置',view,depth:`用户指定隐藏轴 ${depthValue}`}]}}});setSelected(geometry.vertices.length);setEdited(old=>[...old,geometry.vertices.length]);setDirty(true)};
 const finishFace=()=>{if(locked.length){setError('请先解锁区域再连接面');return}if(!geometry||faceDraft.length<3||faceDraft.length>64)return;if(geometry.faces.length>=MAX_FACES||geometry.faces.reduce((n,f)=>n+f.length,0)+faceDraft.length>MAX_REFERENCES){setError('超过限制：最多 10000 控制面及 30000 个面顶点引用');return}const f=faceDraft;if(f.some(i=>!Number.isInteger(i)||i<0||i>=geometry.vertices.length)){setError('待连接顶点不属于当前网格');setFaceDraft([]);return}if(new Set(f).size!==f.length){setError('面不能重复引用顶点');return}let n=new THREE.Vector3();for(let i=0;i<f.length;i++){const a=geometry.vertices[f[i]],b=geometry.vertices[f[(i+1)%f.length]];n.x+=(a[1]-b[1])*(a[2]+b[2]);n.y+=(a[2]-b[2])*(a[0]+b[0]);n.z+=(a[0]-b[0])*(a[1]+b[1])}if(n.lengthSq()<1e-14){setError('面面积为零，请调整顶点');return}remember();setGeometry(g=>g?{...g,faces:[...g.faces,[...f]],...(g.faceColors?{faceColors:[...g.faceColors,'#aab3c3']}: {})}:g);setDirty(true);setFaceDraft([]);setError('')};
 const addEdgeLoop=()=>{if(!geometry||selectedFace===null)return;
   operateMesh(()=>insertQuadEdgeLoop(geometry,selectedFace,selectedEdgeSlot,loopFraction),'连续环线已插入：共用新顶点，邻接面保持连通。');
 };
 const addLocalCut=()=>{if(!geometry||selectedFace===null)return;
   operateMesh(()=>splitQuadLocally(geometry,selectedFace,selectedEdgeSlot,loopFraction),'局部布线完成：已自动补齐邻面的共享边。');
 };
 const addInset=()=>{if(!geometry||selectedFace===null)return;
   operateMesh(()=>insetControlFace(geometry,selectedFace,insetFraction),'面内插完成：选中面周围形成独立四边面环。');
 };
 const addExtrude=()=>{if(!geometry||selectedFace===null)return;
   operateMesh(()=>extrudeControlFace(geometry,selectedFace,extrudeDistance),'面挤出完成：已生成顶面与侧壁。');
 };
 const addMirror=()=>{if(!geometry)return;
   operateMesh(()=>mirrorControlMeshX(geometry),'半模型 X 镜像完成：中心线顶点已焊接。');
 };
 const makeRubik=()=>{
   if(!isBaseBox||!geometry||draftDirty||faceDraft.length)return;
   operateMesh(createRubikControlMesh,'魔方六条环线完成：56 共享顶点 / 54 四边面，每个方向 9 格。');
   setToolPanel('paint');setPreviewDirection('angle');setShowCage(false);
 };
 const paintSelectedFace=(hex:string)=>{
   if(!geometry||selectedFace===null||draftDirty||faceDraft.length||busy.current)return;
   const chosen=selectedFaces.length?selectedFaces:[selectedFace];
   try{
     const next=paintFaces(geometry,chosen,hex);
     validateControlTopology(next);remember();setGeometry(next);setDirty(true);
     setPaintColor(hex);setLoopInfo(`已为 ${chosen.length} 个控制面着色（支持撤销）。`);setError('');
   }catch(e){setError('上色失败：'+String(e))}
 };
 const removeFaceColors=()=>{
   if(!geometry?.faceColors||draftDirty||faceDraft.length)return;
   remember();const {faceColors,...unpainted}=geometry;setGeometry(unpainted);
   setDirty(true);setLoopInfo('已移除全部面颜色。');
 };
 const deleteVertex=()=>{if(locked.length){setError('请先解锁区域再删除顶点');return}if(!geometry||selected===null||faceDraft.length>0||geometry.faces.some(f=>f.includes(selected)))return;const oldCount=geometry.vertices.length;remember();setGeometry(g=>g?{...g,vertices:g.vertices.filter((_,i)=>i!==selected),faces:g.faces.map(f=>f.map(i=>i>selected?i-1:i))}:g);setSourceMetadata(old=>{const m=old.meta;if(!m||typeof m!=='object')return old;const obj=m as Record<string,unknown>,tags=obj.tags;if(!Array.isArray(tags)||tags.length>oldCount)return old;return {...old,meta:{...obj,tags:tags.filter((_,i)=>i!==selected)}}});setEdited(old=>old.filter(i=>i!==selected).map(i=>i>selected?i-1:i));setSelected(null);setDirty(true)};
 const deleteFace=()=>{if(locked.length){setError('请先解锁区域再删除面');return}if(!geometry||faceDraft.length>0||selectedFace===null||selectedFace<0||selectedFace>=geometry.faces.length)return;remember();setGeometry(g=>g?{...g,faces:g.faces.filter((_,i)=>i!==selectedFace),...(g.faceColors?{faceColors:g.faceColors.filter((_,i)=>i!==selectedFace)}:{})}:g);setSelectedFace(null);setSelectedFaces([]);setDirty(true)};
 const save=()=>{if(!geometry)return;download(new Blob([JSON.stringify({...sourceMetadata,...geometry,reference:{image,grid,opacity,calibration,showAll,editedVertexIds:edited}},null,2)],{type:'application/json'}),'vertex-cage.json');setDirty(false);setReferenceDirty(false)};
 const openExhibition=()=>{
   if(!geometry?.faces.length||draftDirty||faceDraft.length||triangulationError)return;
   const url='https://giogyan90.github.io/RoomBoy/?view=topology-exhibition';
   const bytes=new TextEncoder().encode(JSON.stringify(geometry));
   if(bytes.length>100000){download(new Blob([JSON.stringify(geometry)],{type:'application/json'}),'exhibition-mesh.json');window.open(url,'_blank','noopener,noreferrer');setLoopInfo('模型较大，已下载 JSON，请在展览馆导入。');return;}
   const encoded=btoa(Array.from(bytes,n=>String.fromCharCode(n)).join(''));
   window.open(url+'#'+new URLSearchParams({mesh:encoded}).toString(),'_blank','noopener,noreferrer');
 };
 const exportGlb=()=>{
   if(!geometry||!geometry.faces.length)return;
   let geo:THREE.BufferGeometry|undefined,exportGeometry:THREE.BufferGeometry|undefined;
   try{
     geo=new THREE.BufferGeometryLoader().parse(buildEditableGeometry(geometry));
     exportGeometry=geo.index?geo.toNonIndexed():geo.clone();
     exportGeometry.computeVertexNormals();
     const colored=Boolean(geometry.faceColors?.length);
     const mesh=new THREE.Mesh(exportGeometry,new THREE.MeshStandardMaterial({
       color:colored?0xffffff:0x999999,vertexColors:colored,
       flatShading:true,roughness:1,side:THREE.DoubleSide
     }));
     const original=geo,ex=exportGeometry;
     new GLTFExporter().parse(mesh,out=>{
       if(out instanceof ArrayBuffer)download(new Blob([out],{type:'model/gltf-binary'}),'vertex-cage.glb');
       original.dispose();ex.dispose();
     },cause=>{original.dispose();ex.dispose();setError('导出失败：'+String(cause))},{binary:true});
     setError('');
   }catch(cause){geo?.dispose();exportGeometry?.dispose();setError('导出失败：'+String(cause))}
 };
 const hasPendingMeshChanges = dirty || draftDirty || faceDraft.length > 0;
 const closeEditor = () => {
   if (sceneEdit && hasPendingMeshChanges && !window.confirm('关闭后将丢弃这次尚未应用到场景的顶点修改。确认关闭？')) return;
   onClose();
 };
 const applyToScene = () => {
   if (!sceneEdit || !geometry?.faces.length || draftDirty || faceDraft.length || triangulationError) return;
   try {
     sceneEdit.onApply(geometry);
   } catch (cause) {
     setError(cause instanceof Error ? cause.message : String(cause));
   }
 };
 const spatialPreview = geometry && (
   <div className={sceneEdit
     ? 'topo-stage'
     : previewLarge
       ? 'fixed inset-4 z-[205] flex flex-col rounded border border-neutral-600 bg-neutral-900 p-3 shadow-xl'
       : undefined}>
     <div className="topo-camera-bar" role="toolbar" aria-label="三维视图工具栏">
       {!sceneEdit && <button className={btn} onClick={()=>setPreviewLarge(value=>!value)} aria-pressed={previewLarge}>
         {previewLarge?'恢复小预览':'放大 3D 编辑'}</button>}
       <span className="topo-camera-label">观察角度</span>
       {([['front','正面'],['back','背面'],['side','侧面'],['top','俯视'],['bottom','仰视'],['angle','3/4'],['low','低角度']] as const).map(([direction,label])=>(
         <button key={direction} className={btn} onClick={()=>{setPreviewDirection(direction);setCameraRevision(n=>n+1)}}
           aria-pressed={previewDirection===direction} title={`切换到${label}机位`}>{label}</button>
       ))}
       <div className="topo-camera-actions">
         <button className={btn} onClick={()=>setCameraRevision(n=>n+1)} title="返回当前预设机位">重置视角</button>
         <button className={btn} aria-pressed={!showCage} onClick={()=>setShowCage(v=>!v)}>{showCage?'成品预览':'显示布线'}</button>
         {showCage&&<label className="flex items-center gap-1 text-xs text-slate-300">
           <input aria-label="透视背面布线" type="checkbox" checked={xray} onChange={e=>setXray(e.target.checked)}/>X-Ray
         </label>}
       </div>
     </div>
     <div ref={previewRegionRef} aria-label="3D 旋转预览" className={previewLarge || sceneEdit ? 'min-h-0 w-full flex-1' : 'h-64 w-full'}>
       {active && <TracePreview mirrorTriangles={mirrorTriangles} symmetricLight={symmetricLight} optimizedTriangles={optimizedTriangles} vertexColors={qualityColors} references={references} data={geometry} direction={previewDirection} selected={selected} selectedFace={selectedFace} selectedFaces={selectedFaces} xray={xray} showCage={showCage} cameraRevision={cameraRevision}
  selectedEdge={selectedLoopEdge as [number,number]|null} onSelect={i=>{setSelected(i);if(i!==null){setSelectionExpanded(true);setToolPanel('model');setShowCage(true)}}} onMove={update}
  onSelectFace={(fi,additive)=>chooseFace(fi,additive)}
  onSelectEdge={(fi,slot)=>{chooseFace(fi);setSelectedEdgeSlot(slot);setToolPanel('topology');setShowCage(true)}}
  onStartMove={remember}/>}
     </div>
     <div className="topo-stage-foot">
       <span>{showCage?'编辑布线':'成品预览'} · {selectedSummary}</span>
       <span>拖动空白旋转 · Shift + 点击多选 · Esc 清空选择</span>
     </div>
     {triangulationError && <p role="alert" className="text-amber-300">面暂不可三角化，预览仅显示点和线。{triangulationError}</p>}
   </div>
 );
 return <div ref={dialogRef} onPointerDownCapture={protectDraft} onClickCapture={protectDraftClick} onKeyDownCapture={historyKey} className="topo-shell fixed inset-0 z-[200] flex flex-col overflow-hidden" data-topology-workbench="true" role="dialog" aria-modal="true" aria-label={sceneEdit ? "场景顶点编辑" : "顶点参考对照"}>
  <fieldset disabled={loading} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><header className="topo-header">
  <div className="topo-header-title">
    <h2 className="truncate" title={sceneEdit?.name}>{sceneEdit ? sceneEdit.name : '顶点参考对照'}</h2>
    <p>
      <span className={'topo-status-dot'+(dirty||draftDirty||faceDraft.length?' is-dirty':'')}/>
      {sceneEdit ? (dirty?'待应用到场景':'模型已同步') : (dirty||referenceDirty?'有未保存修改':'参考编辑模式')}
      {geometry?` · ${geometry.vertices.length} 顶点 / ${geometry.faces.length} 面`:''}
    </p>
  </div>
  {sceneEdit ? <div className="topo-mode-switch" role="group" aria-label="编辑视图模式">
    <button className={btn} onClick={()=>setProjectSpatialView(true)} aria-pressed={projectSpatialView}>3D 编辑</button>
    <button className={btn} onClick={()=>setProjectSpatialView(false)} aria-pressed={!projectSpatialView}>正交编辑</button>
  </div>:
  <div className="topo-header-actions">
    {backup&&<button className={btn} disabled={dirty||referenceDirty||draftDirty||faceDraft.length>0} onClick={restoreBackup}>恢复新建前状态</button>}
    <button className={btn} disabled={dirty||draftDirty||faceDraft.length>0||!!backup} onClick={newMesh}>新建空网格</button>
    <label className={btn+' cursor-pointer'}>导入参考图<input aria-label="导入参考图" type="file" accept="image/png,image/jpeg,image/webp" disabled={referenceDirty} className="hidden" onChange={loadImage}/></label>
    <label className={btn+' cursor-pointer'}>导入顶点 JSON<input aria-label="导入顶点 JSON" type="file" accept="application/json,.json" disabled={dirty||draftDirty||faceDraft.length>0} className="hidden" onChange={loadMesh}/></label>
    <button className={btn} disabled={!geometry} onClick={save}>保存顶点 JSON</button>
    <button className={btn} disabled={!geometry?.faces.length} onClick={exportGlb}>导出 GLB</button>
  </div>}
  <button className={btn} disabled={!geometry||draftDirty||faceDraft.length>0} aria-pressed={calibrationMode} onClick={()=>setCalibrationMode(v=>!v)}>{calibrationMode?'返回建模':'正侧校准'}</button>
  <button className={btn} disabled={!geometry?.faces.length||draftDirty||faceDraft.length>0||Boolean(triangulationError)} onClick={openExhibition}>在 RoomBoy 展览馆查看</button>
  <div className="topo-header-actions" role="group" aria-label="编辑历史">
    <button className={btn} disabled={!past.length||draftDirty||faceDraft.length>0} onClick={undoMesh} title="Ctrl+Z">撤销</button>
    <button className={btn} disabled={!future.length||draftDirty||faceDraft.length>0} onClick={redoMesh} title="Ctrl+Shift+Z / Ctrl+Y">重做</button>
  </div>
  {sceneEdit&&<button className={btn+' topo-primary'} disabled={!dirty||!geometry?.faces.length||draftDirty||faceDraft.length>0||Boolean(triangulationError)}
     onClick={applyToScene}>应用到场景</button>}
  <button className={btn+' !px-3'} data-trace-close onClick={closeEditor}
    aria-label={sceneEdit?'关闭场景顶点编辑':'关闭顶点参考对照'} title="关闭">×</button>
</header>
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row"><div className="topo-viewport flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden p-2 lg:min-h-0 lg:p-3">
   {geometry&&<div className={calibrationMode?"min-h-0 flex-1 overflow-auto":"hidden"}><CalibrationWorkbench mesh={geometry} selected={selected} onSelect={id=>setSelected(id)} onFit={(id,v)=>{remember();update(id,v)}}/></div>}
   {calibrationMode ? null : sceneEdit && projectSpatialView ? spatialPreview : <>
   <div className="mb-2 flex flex-wrap gap-2">{views.map(v=><button key={v.id} className={btn+(view===v.id?' !border-blue-400 !bg-blue-900':'')} onClick={()=>{setView(v.id);setSelected(null)}} aria-pressed={view===v.id}>{v.label}</button>)}</div>
   <div className="mb-2 flex flex-wrap items-center gap-2">{([['select','选择/移动'],['point','放置顶点'],['face','连接成面']] as const).map(([id,label])=><button key={id} className={btn+(mode===id?' !border-blue-400 !bg-blue-900':'')} disabled={!geometry||(faceDraft.length>0&&id!=='face')} onClick={()=>{setMode(id)}} aria-pressed={mode===id}>{label}</button>)}{mode==='select'&&<label>拖动约束 <select aria-label="拖动约束" className="bg-neutral-800 p-1" value={constraint} onChange={e=>setConstraint(e.target.value as typeof constraint)}><option value="both">横竖均可</option><option value="horizontal">仅水平</option><option value="vertical">仅垂直</option></select></label>}{mode==='point'&&<label>隐藏轴坐标（{view==='side'?'X':view==='top'||view==='bottom'?'Y':'Z'}）<input aria-label={`顶点 新顶点隐藏轴坐标（${view==='side'?'X':view==='top'||view==='bottom'?'Y':'Z'}）`} className="ml-2 w-24 bg-neutral-800 p-1" type="text" inputMode="decimal" data-trace-draft="true" data-dirty={depthText!==String(depth)} value={depthText} onChange={e=>{setDepthText(e.target.value);setDraftDirty(e.target.value!==String(depth))}} onBlur={()=>{const n=Number(depthText);if(depthText.trim()!==''&&Number.isFinite(n)){setDepth(n);setDepthText(String(n));setDraftDirty(false)}else setError('隐藏轴坐标无效，请输入有限数字后再放点')}}/></label>}{mode==='face'&&<><span>待连接：{faceDraft.join(' → ')||'无'}（尚未保存）</span><button className={btn} disabled={selected===null||faceDraft.includes(selected)} onClick={()=>selected!==null&&setFaceDraft(old=>[...old,selected])}>添加选中点</button><button className={btn} disabled={!faceDraft.length} onClick={()=>setFaceDraft(old=>old.slice(0,-1))}>撤销上一个点</button><button className={btn} disabled={!faceDraft.length} onClick={()=>setFaceDraft([])}>清空待连接</button><button className={btn} disabled={faceDraft.length<3} onClick={finishFace}>完成面</button></>}</div><div className="min-h-[300px] flex-1 overflow-auto bg-neutral-800"><svg ref={svg} onPointerDown={canvasPoint} viewBox="0 0 1000 1000" className="mx-auto block h-full max-h-[min(80vh,900px)] w-full touch-none select-none" onPointerMove={pointer} onPointerUp={()=>setDrag(false)} onPointerCancel={()=>setDrag(false)}><defs><clipPath id="trace-crop"><rect width="1000" height="1000"/></clipPath></defs><rect width="1000" height="1000" fill="#e9e9e9"/>{image&&<g clipPath="url(#trace-crop)" opacity={opacity}><image href={image} x={grid?-(cell%3)*1000:0} y={grid?-Math.floor(cell/3)*1000:0} width={grid?3000:1000} height={grid?3000:1000} preserveAspectRatio="xMidYMid meet"/></g>}
    {geometry&&<g>{edges.map(([a,b])=>{const A=screen(geometry.vertices[a]),B=screen(geometry.vertices[b]),key=a<b?`${a}:${b}`:`${b}:${a}`,quad=edgeToQuad.get(key),active=!!selectedLoopEdge&&key===(selectedLoopEdge[0]<selectedLoopEdge[1]?`${selectedLoopEdge[0]}:${selectedLoopEdge[1]}`:`${selectedLoopEdge[1]}:${selectedLoopEdge[0]}`);return <line key={`${a}-${b}`} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={active?'#00a4e4':'#ff791a'} strokeWidth={active?7:5} className={quad?'cursor-crosshair':''} onPointerDown={e=>{if(!quad||mode!=='select')return;e.stopPropagation();chooseFace(quad.face);setSelectedEdgeSlot(quad.slot);setToolPanel('topology');setLoopInfo('')}}/>})}{geometry.vertices.map((p,i)=>{if(!showAll&&!visible.has(i)&&selected!==i)return null;const [x,y]=screen(p);return <g key={i} onPointerDown={e=>{e.stopPropagation();dragRecorded.current=false;if(mode==='face'){setSelected(i);setFaceDraft(old=>old.includes(i)||old.length>=64?old:[...old,i])}else if(mode==='select'){e.currentTarget.setPointerCapture(e.pointerId);setSelected(i);setSelectionExpanded(true);setDrag(true)}}}><circle cx={x} cy={y} r={selected===i?8:5} fill={selected===i?'#ed2d2d':'#0964ef'} stroke="white" strokeWidth="1.5"/>{showLabels&&<text x={x+7} y={y-6} fontSize="15" fill="#132d65" stroke="white" strokeWidth=".8" paintOrder="stroke">{i}</text>}</g>})}</g>}</svg></div>
   </>}
  </div>
  <aside className={'topo-inspector min-h-0 min-w-0 w-full shrink-0 border-t border-neutral-800 text-sm lg:border-l lg:border-t-0'+(inspectorExpanded?' is-expanded':'')}>{(error||loopInfo||dirty||referenceDirty||draftDirty||faceDraft.length>0)&&<div className="topo-inspector-feedback space-y-2">
    {error&&<p role="alert" className="topo-message is-error">{error}</p>}
    {!error&&loopInfo&&<p role="status" className="topo-message">{loopInfo}</p>}
    {faceDraft.length>0&&<p className="topo-message is-warning">正在连接控制面：已选 {faceDraft.length} 个顶点，请完成或清空。</p>}
    {!faceDraft.length&&(dirty||referenceDirty||draftDirty)&&<p className="topo-helptext">
      {sceneEdit?'当前修改尚未应用，关闭会丢失修改。':'当前工作区有未保存修改，请保存 JSON。'}
    </p>}
  </div>}{referenceDirty&&<button className={btn} onClick={undoReference}>撤销参考更改</button>}{!(sceneEdit && projectSpatialView) && <details className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3 text-xs text-neutral-300">
  <summary className="cursor-pointer font-medium text-neutral-200">参考图与正交视图参数</summary>
  <div className="mt-3 space-y-2"><p className="text-neutral-300">正交投影的顶点会覆盖在参考图上。拖动只修改当前视图的两个坐标，第三个坐标保留。</p><label className="flex gap-2"><input type="checkbox" checked={grid} disabled={!imageSquare} onChange={e=>{setGrid(e.target.checked);setReferenceDirty(true)}}/>参考图为 3×3 九宫格</label><label className="flex gap-2"><input type="checkbox" checked={showAll} onChange={e=>{setShowAll(e.target.checked);setReferenceDirty(true)}}/>前后点线同时显示</label><label className="flex gap-2"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>显示顶点编号</label><label className="block">参考透明度 <input className="w-full" type="range" min="0" max="1" step=".01" value={opacity} onChange={e=>{setOpacity(+e.target.value);setReferenceDirty(true)}}/></label><label className="block">模型比例 <input className="w-full" type="range" min="50" max="700" value={scale} onChange={e=>setScale(+e.target.value)}/></label><div className="grid grid-cols-2 gap-2">{[['水平中心',cx,setCx],['垂直中心',cy,setCy]].map(([label,val,setter])=><label key={String(label)}>{String(label)}<input className="w-full bg-neutral-800 p-1" type="number" value={val as number} onChange={e=>(setter as (v:number)=>void)(+e.target.value)}/></label>)}</div></div></details>}
  {geometry?<><section className="topo-inspector-card topo-selection-card text-sm space-y-2">
  <div className="topo-inspector-heading">
    <div className="min-w-0">
      <strong>当前选择</strong>
      <div className="topo-eyebrow truncate">{selectedSummary}</div>
    </div>
    <button type="button" className={btn+' !px-2 !py-1 !text-xs'} aria-expanded={selectionExpanded}
      onClick={()=>setSelectionExpanded(v=>!v)}>{selectionExpanded?'收起精确选择':'展开精确选择'}</button>
  </div>
  {selectionExpanded&&<div className="topo-selection-details space-y-2">
  <p className="topo-helptext">可在画布点选元素，或输入编号精确定位。</p>
  <div className="grid grid-cols-2 gap-2">
    <label className="text-xs text-neutral-400">控制面编号
      <input aria-label="控制面编号" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-sm text-neutral-100" type="number"
        min="0" max={Math.max(0,geometry.faces.length-1)} value={selectedFace??''}
        onChange={e=>{if(e.target.value===''){clearFaces();return}const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<geometry.faces.length)chooseFace(n)}}/>
    </label>
    <label className="text-xs text-neutral-400">顶点编号
      <input aria-label="选择顶点编号" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-sm text-neutral-100" type="number"
        min="0" max={Math.max(0,geometry.vertices.length-1)} value={selected??''}
        onChange={e=>{if(e.target.value===''){setSelected(null);return}const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<geometry.vertices.length){setSelected(n);setShowCage(true);setToolPanel('model')}}}/>
    </label>
  </div>
  {selectedFace!==null&&geometry.faces[selectedFace]&&
    <div className="truncate text-xs text-sky-300" title={geometry.faces[selectedFace].join(' → ')}>
      面 #{selectedFace}：{geometry.faces[selectedFace].join(' → ')}
      {selectedFaces.length>1?` · 共选 ${selectedFaces.length} 面`:''}
    </div>}
  {selected!==null&&geometry.vertices[selected]&&<div className="space-y-2 rounded-lg border border-neutral-800 p-2">
    <div className="text-xs text-sky-200">顶点 #{selected} · 精确坐标{edited.includes(selected)?'（已修改）':''}</div>
    <div className="grid grid-cols-3 gap-2">
      {(['X','Y','Z'] as const).map((axis,i)=><CoordinateInput key={`${selected}:${axis}`} axis={axis}
        value={geometry.vertices[selected][i]} onDraft={setDraftDirty}
        onCommit={n=>{const v=[...geometry.vertices[selected]] as V;v[i]=n;remember();update(selected,v)}}/>)}
    </div>
    {symmetryAxes.length>0&&<p className="text-xs text-neutral-500">对称编辑：{symmetryAxes.join(', ').toUpperCase()}</p>}
  </div>}
  <button className="text-xs text-neutral-400 hover:text-white" onClick={()=>setAdvancedOpen(v=>!v)}
    aria-expanded={advancedOpen}>{advancedOpen?'收起高级操作 −':'高级操作与来源 +'} </button>
  {advancedOpen&&<div className="space-y-2 rounded-lg border border-neutral-800 p-2 text-xs text-neutral-400">
    {selectedFace!==null&&<button className={btn+' w-full'} disabled={faceDraft.length>0}
      onClick={deleteFace}>删除选中控制面（不自动补洞）</button>}
    {selected!==null&&<button className={btn+' w-full'}
      disabled={faceDraft.length>0||geometry.faces.some(f=>f.includes(selected))}
      onClick={deleteVertex}>删除未引用顶点</button>}
    {selected!==null&&geometry.faces.some(f=>f.includes(selected))&&<p>顶点仍被控制面引用，无法直接删除。</p>}
    {selected!==null&&(()=>{const tags=(sourceMetadata.meta as any)?.tags,tag=Array.isArray(tags)?tags[selected]:null;
      return tag?<p>顶点来源：{String(tag.source??'未记录')}{tag.depth?` · ${String(tag.depth)}`:''}</p>:<p>此顶点暂无参考来源记录。</p>})()}
    <p>正交视图按面绕序近似隐藏背面；可在 3D 视图检查遮挡。</p>
  </div>}
  </div>}
</section><section className="topo-inspector-card topo-tools-panel space-y-3">
  <div className="topo-inspector-heading">
    <h3>建模操作</h3>
    <button type="button" className={btn+' !px-2 !py-1 !text-xs'} aria-pressed={inspectorExpanded}
      onClick={()=>setInspectorExpanded(v=>!v)}>{inspectorExpanded?'返回画布布局':'展开工具区'}</button>
  </div>
  <div className="topo-tool-tabs" role="group" aria-label="建模工具分类">
    {([['topology','布线'],['model','塑形'],['paint','配色'],['inspect','检查'],['reference','参考图']] as const).map(([id,label],i)=>
      <button key={id} aria-label={label} aria-pressed={toolPanel===id} className="topo-tab"
        onClick={()=>{setToolPanel(id);setLoopInfo('');if(id==='topology'||id==='model')setShowCage(true);if(id==='paint')setShowCage(false)}}>
        <span className="topo-tab-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{label}
      </button>)}
  </div>
  <div ref={toolScrollRef} className="topo-tool-content" data-topology-scroll="true" tabIndex={0} aria-label="当前工具参数">
    <p className="topo-tool-description">{tabDetails[toolPanel]}</p>
  {toolPanel==='reference'&&referencePanel}
   {toolPanel==='topology'&&<div className="space-y-3">
    {isBaseBox&&<details className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-amber-200">快捷示例 · 3×3 魔方环切</summary>
      <div className="mt-3 space-y-2">
        <p className="topo-helptext">在基础立方体上执行六次真实环切，生成共享顶点的 3×3 网格。</p>
        <button className={btn+' w-full'} onClick={makeRubik} disabled={draftDirty||faceDraft.length>0}>六次环切 · 生成魔方</button>
      </div>
    </details>}
    <p className="topo-helptext">点击橙色边线或输入面编号，再调整切割比例。</p>
    {selectedLoopFace?.length===4?
      <label className="block text-xs">起始面 #{selectedFace} · 边
        <select aria-label="布线起始边" className="mt-1 w-full rounded bg-neutral-800 p-2" value={selectedEdgeSlot} onChange={e=>setSelectedEdgeSlot(Number(e.target.value))}>
          {selectedLoopFace.map((id,i)=><option key={i} value={i}>边 {i+1} · {id} → {selectedLoopFace[(i+1)%4]}</option>)}
        </select>
      </label>:<p className="topo-empty-state">尚未选中四边面。在画布上选择一条橙色边线。</p>}
    <label className="block text-xs">切割比例：{Math.round(loopFraction*100)}%
      <input aria-label="布线位置" className="mt-1 w-full" type="range" min=".05" max=".95" step=".05" value={loopFraction} onChange={e=>setLoopFraction(Number(e.target.value))}/>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <button className={btn+' !bg-sky-900'} disabled={!selectedLoopFace||selectedLoopFace.length!==4||faceDraft.length>0||draftDirty} onClick={addEdgeLoop}>连续环线</button>
      <button className={btn} disabled={!selectedLoopFace||selectedLoopFace.length!==4||faceDraft.length>0||draftDirty} onClick={addLocalCut}>局部切割</button>
    </div>
    <p className="topo-helptext">局部切割仅影响选中的面，并自动修复相邻共享边。</p>
    <KnifePanel mesh={geometry} selectedFace={selectedFace} selectedVertex={selected} locked={locked.length>0} disabled={draftDirty||faceDraft.length>0||loading||symmetryAxes.length>0} onApply={(next,label)=>operateMesh(()=>next,label)}/>
  </div>}
  {toolPanel==='model'&&<div className="space-y-3">
    <p className="topo-helptext">选顶点移动位置；选面进行内插或挤出。每步均可撤销。</p>
    {selectedFaces.length>1&&<p className="text-xs text-amber-300">已选择 {selectedFaces.length} 面。内插/挤出只对最后选中的主面操作；批量配色请切换配色页签。</p>}
    <details className="rounded-lg border border-neutral-700 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-200">区域锁定 · {locked.length} 点</summary>
      <div className="space-y-2 mt-2">
        <p className="topo-helptext">锁定选中顶点或选中控制面的全部顶点。锁定期间禁止修改连接关系、撤销及重做；允许未锁定点塑形。仅在本次编辑会话有效。</p>
        <button className={btn+' w-full'} disabled={selected===null&&selectedFace===null&&!selectedFaces.length} onClick={()=>{const faces=selectedFaces.length?selectedFaces:selectedFace===null?[]:[selectedFace];setLocked(old=>[...new Set([...old,...(selected===null?[]:[selected]),...faces.flatMap(i=>geometry.faces[i]??[])])].sort((a,b)=>a-b));setError('')}}>锁定当前选择</button>
        <div className="max-h-24 overflow-auto flex flex-wrap gap-1" aria-label="锁定顶点列表">{locked.map(i=><button key={i} title="点击解锁" className={btn} onClick={()=>setLocked(old=>old.filter(x=>x!==i))}>#{i} ×</button>)}</div>
        <button className={btn+' w-full'} disabled={!locked.length} onClick={()=>{setLocked([]);setError('')}}>解除全部锁定</button>
      </div>
    </details>
    <details className="rounded-lg border border-neutral-700 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-200">顶点沿边滑动</summary>
      <div className="space-y-2 mt-2">
        <p className="topo-helptext">选中一个顶点，沿现有相邻边移动；保持连接关系，路径为原始边线的直线段。不能保证整个曲面完全不变形。</p>
        <p>当前顶点：{selected===null?'未选择':'#'+selected}</p>
        <label>相邻目标点<select aria-label="滑动目标点" className="w-full" value={slideTarget} onChange={e=>setSlideTarget(e.target.value)}>
          <option value="">请选择</option>{selected!==null&&[...new Set(geometry.faces.flatMap(f=>f.flatMap((id,i)=>id===selected?[f[(i+1)%f.length],f[(i+f.length-1)%f.length]]:[])))].map(i=><option key={i} value={i}>#{i}</option>)}</select></label>
        <label>滑动比例 {Math.round(slideFraction*100)}%<input aria-label="沿边滑动比例" type="range" min="0.05" max=".95" step=".05" className="w-full" value={slideFraction} onChange={e=>setSlideFraction(+e.target.value)}/></label>
        <button className={btn+' w-full'} disabled={selected===null||slideTarget===''||draftDirty||faceDraft.length>0} onClick={()=>{if(selected!==null)operateMesh(()=>{if(symmetryAxes.length)throw Error('沿边滑动暂不支持镜像，请关闭对称编辑');return slideOnEdge(geometry,selected,Number(slideTarget),slideFraction)},'沿边滑动完成')}}>应用沿边滑动</button>
      </div>
    </details>

    <details className="rounded-lg border border-neutral-700 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-200">整条环线滑动 · 连续边链</summary>
      <div className="mt-2 space-y-2">
        <p className="topo-helptext">沿现有四边面条带连续移动一条边链。依次点选顶点或控制边构成连续路径，首个引导邻点决定左右滑动侧。共享顶点索引和所有面连接保持不变，跨三角面或存在引导歧义会拒绝操作。</p>
        <p>有序链：{loopChain.length?loopChain.map(id=>'#'+id).join(' → '):'尚未选择'}</p>
        <div className="flex flex-wrap gap-1">
          <button className={btn} disabled={selected===null} onClick={()=>{if(selected!==null&&!loopChain.includes(selected))setLoopChain(old=>[...old,selected])}}>追加当前顶点</button>
          <button className={btn} disabled={selectedFace===null} onClick={()=>{
            if(selectedFace===null)return;
            const face=geometry.faces[selectedFace];
            const a=face[selectedEdgeSlot],b=face[(selectedEdgeSlot+1)%face.length];
            if(!loopChain.length){setLoopChain([a,b]);setLoopClosed(false);return}
            const tail=loopChain[loopChain.length-1];
            if(tail===a&&!loopChain.includes(b)){setLoopChain(old=>[...old,b]);return}
            if(tail===b&&!loopChain.includes(a)){setLoopChain(old=>[...old,a]);return}
            if((tail===a&&b===loopChain[0])||(tail===b&&a===loopChain[0])){setLoopClosed(true);return}
            setError('新边必须从当前链的末端继续连接，且不能重复中间顶点');
          }}>追加选中控制边</button>
          <button className={btn} disabled={!loopChain.length} onClick={()=>{setLoopChain(old=>old.slice(0,-1));setLoopClosed(false)}}>退回一个顶点</button>
          <button className={btn} disabled={!loopChain.length} onClick={()=>{setLoopChain([]);setLoopGuide('');setLoopClosed(false)}}>清空边链</button>
        </div>
        <label className="flex items-center gap-2"><input aria-label="环线闭合" type="checkbox" checked={loopClosed} onChange={e=>setLoopClosed(e.target.checked)}/> 将首尾连接为闭合环</label>
        <label>引导邻点（决定滑动侧）
          <select aria-label="环线引导顶点编号" className="mt-1 w-full" value={loopGuide} onChange={e=>setLoopGuide(e.target.value)}>
            <option value="">先选择边链与引导侧</option>
            {loopChain.length>0&&[...new Set(geometry.faces.flatMap(f=>f.flatMap((id,i)=>id===loopChain[0]?[f[(i+1)%f.length],f[(i+f.length-1)%f.length]]:[])))].filter(id=>!loopChain.includes(id)).map(id=><option value={id} key={id}>#{id}</option>)}
          </select>
        </label>
        <label>沿引导边滑动 {Math.round(ringSlideFraction*100)}%
          <input aria-label="整条环线滑动比例" className="w-full" type="range" min=".05" max=".95" step=".05" value={ringSlideFraction} onChange={e=>setRingSlideFraction(Number(e.target.value))}/>
        </label>
        <label className="flex items-center gap-2"><input aria-label="环线 X 镜像滑动" type="checkbox" checked={loopMirror} onChange={e=>setLoopMirror(e.target.checked)}/> 同步镜像 X 另一半</label>
        {loopPreview.error&&<p role="alert" className="text-amber-300">{loopPreview.error}</p>}
        {loopPreview.result&&<p className="topo-helptext" aria-label="环线滑动预估偏差">预估移动 {loopPreview.result.report.movedVertices} 点 · 最大位移 {loopPreview.result.report.maxDisplacement.toFixed(4)} · 最大面法线偏角 {loopPreview.result.report.maxNormalDeviationDegrees.toFixed(2)}° · 最小面积比 {loopPreview.result.report.minFaceAreaRatio.toFixed(3)}。这是原始边弦插值，不保证曲面严格不变。</p>}
        <button className={btn+' w-full'} disabled={!loopPreview.result||draftDirty||faceDraft.length>0} onClick={()=>{
          if(loopPreview.result)operateMesh(()=>loopPreview.result!.mesh,'连续环线滑动完成');
        }}>应用整条环线滑动</button>
      </div>
    </details>
    <ProfileCalibrationPanel mesh={geometry} selected={selected} disabled={draftDirty||faceDraft.length>0||loading} onApply={next=>operateMesh(()=>next,'局部截面校准')}/>
    <label className="block text-xs">内插收缩 {Math.round(insetFraction*100)}%
      <input aria-label="面内插比例" className="w-full" type="range" min=".05" max=".85" step=".05" value={insetFraction} onChange={e=>setInsetFraction(Number(e.target.value))}/>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||faceDraft.length>0||draftDirty} onClick={addInset}>面内插 · Inset</button>
    <label className="block text-xs">法线挤出距离
      <input aria-label="挤出距离" type="number" step=".05" min="-100" max="100" className="mt-1 w-full rounded bg-neutral-800 p-2" value={extrudeDistance} onChange={e=>setExtrudeDistance(Number(e.target.value))}/>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||faceDraft.length>0||draftDirty} onClick={addExtrude}>面挤出 · Extrude</button>
    <details className="rounded-lg border border-neutral-700 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-200">顶点对称设置 · X/Y/Z</summary>
      <div className="space-y-2 p-1">
      <div className="text-xs font-medium text-neutral-200">对称顶点编辑 · 实时</div>
      <div className="grid grid-cols-3 gap-2">
        {(['x','y','z'] as const).map(axis=><label key={axis} className="flex cursor-pointer items-center justify-center gap-1.5 rounded border border-neutral-700 px-2 py-2 text-xs">
          <input type="checkbox" aria-label={`对称 ${axis.toUpperCase()}`} checked={symmetryAxes.includes(axis)}
            onChange={e=>setSymmetryAxes(old=>e.target.checked?[...old,axis]:old.filter(a=>a!==axis))}/>
          {axis.toUpperCase()}
        </label>)}
      </div>
      <p className="text-xs text-neutral-500">围绕 X/Y/Z=0 镜像移动已有对称点；中线自动约束，不会生成多余顶点。没有对称点时仅移动当前点。</p>
    </div>
    </details>
    <details className="rounded border border-neutral-700 p-2 text-xs"><summary className="cursor-pointer">X=0 半模型镜像</summary>
      <p className="my-2 text-neutral-400">要求网格在 X 坐标单侧，且中心线顶点在 X=0。</p>
      <button className={btn+' w-full'} disabled={faceDraft.length>0||draftDirty} onClick={addMirror}>镜像并焊接中心线</button>
    </details>
  </div>}
  {toolPanel==='paint'&&<div className="space-y-3">
    <p className="topo-helptext">Shift + 点击可多选面，也可按共面或颜色批量选取。</p>
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-400">{selectedFaces.length?`将编辑 ${selectedFaces.length} 个控制面`:'请先在画布选面'}</span>
      <button className={btn+' !py-1 !px-2 !text-xs'} disabled={!selectedFaces.length} onClick={clearFaces}>清空选择</button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <button className={btn} disabled={selectedFace===null} onClick={()=>chooseFaceGroup('plane')}>选择同一平面</button>
      <button className={btn} disabled={selectedFace===null||!geometry.faceColors} onClick={()=>chooseFaceGroup('color')}>选择相同颜色</button>
    </div>
    <div className="topo-color-picker">
      {Object.entries(RUBIK_FACE_COLORS).map(([name,color])=>
        <button key={name} aria-label={`涂色 ${name}`}
          aria-pressed={selectedFace!==null&&geometry.faceColors?.[selectedFace]===color}
          title={`将已选控制面涂为${RUBIK_COLOR_LABELS[name as keyof typeof RUBIK_FACE_COLORS]}`}
          className="topo-color-swatch" disabled={selectedFace===null||draftDirty} onClick={()=>paintSelectedFace(color)}>
          <span className="topo-color-disc" style={{backgroundColor:color}} aria-hidden="true"/>
          <span>{RUBIK_COLOR_LABELS[name as keyof typeof RUBIK_FACE_COLORS]}</span>
        </button>)}
    </div>
    <label className="flex items-center gap-2 text-xs">自选颜色
      <input aria-label="自定义面颜色" type="color" value={paintColor} onChange={e=>setPaintColor(e.target.value)}/>
      <span>{paintColor}</span>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||draftDirty} onClick={()=>paintSelectedFace(paintColor)}>应用到已选面</button>
    <details className="rounded-lg border border-neutral-700 p-2 text-xs text-slate-400">
      <summary className="cursor-pointer">更多配色操作</summary>
      <p className="topo-helptext mt-2">清空后将还原为普通控制网格，可通过撤销恢复。</p>
      <button className={btn+' topo-danger mt-2 w-full'} disabled={!geometry.faceColors||draftDirty}
        onClick={removeFaceColors}>清空全部面颜色</button>
    </details>
  </div>}
  {toolPanel==='inspect'&&<div className="space-y-3 text-xs">
    <div className="topo-mini-stats">
      <div><strong>{geometry.vertices.length}</strong><span>控制顶点</span></div>
      <div><strong>{geometry.faces.length}</strong><span>控制面</span></div>
      <div><strong>{meshQuality?.error?'—':meshQuality?.edges??'—'}</strong><span>共享边</span></div>
    </div>
    <div className={meshQuality?.error?'topo-message is-error':'topo-message'}>
      <strong>{meshQuality?.error?'拓扑检查失败':'基础拓扑检查通过'}</strong>
      <p className="mt-1">{meshQuality?.error||`开放边：${meshQuality?.boundaryEdges??'—'} · 已着色面：${geometry.faceColors?.length??0} · 修改顶点：${edited.length}`}</p>
    </div>
    <p className="topo-helptext">检查共享边、面绕序与非流形结构。可旋转三维画面或打开 X-Ray 检查背面。</p>
    <details open className="rounded border border-neutral-700 p-2 space-y-2"><summary>渲染网格镜像检查</summary><label className="flex gap-2"><input type="checkbox" checked={mirrorTriangles} onChange={e=>setMirrorTriangles(e.target.checked)}/>镜像三角化预览</label><label className="flex gap-2"><input type="checkbox" checked={symmetricLight} onChange={e=>setSymmetricLight(e.target.checked)}/>对称光照检查</label><p>镜像顶点 {renderMirrorReport?.matchedVertices??'—'} / {geometry.vertices.length} · 配对控制面 {renderMirrorReport?.pairedFaces??'—'} / {geometry.faces.length}</p><p>{renderMirrorReport?.unmatchedTriangles!=null?'镜像缺失三角面 '+renderMirrorReport.unmatchedTriangles:'非完整对称网格或无法三角化'}</p>{!!renderMirrorReport?.unresolvedFaces.length&&<p>需人工检查控制面：{renderMirrorReport.unresolvedFaces.slice(0,20).join(', ')}</p>}<p className="topo-helptext">仅完整 X 轴对称网格自动配对；跨中心的面不强制新增顶点。导出默认启用镜像约束。</p></details>
    <SurfaceQualityPanel mesh={geometry} onFace={chooseFace} onVertex={id=>{clearFaces();setSelected(id);setShowCage(true)}} optimized={optimizedTriangles} onOptimize={setOptimizedTriangles} onColors={setQualityColors}/>
    <details className="rounded-lg border border-neutral-700 p-2 text-xs text-slate-400">
      <summary className="cursor-pointer">尚未支持的高级功能</summary>
      <p className="topo-helptext mt-2">后续包括真实边倒角、任意多边面自由刀切、桥接和可转动魔方层组。</p>
    </details>
  </div>}
  </div>
</section></>:<p className="text-amber-300">请先导入含 vertices 和 faces 的网格 JSON。</p>}
  {!sceneEdit && geometry && <>
    <button className={btn} onClick={() => setPreview(value => !value)} aria-expanded={preview}>
      {preview ? '收起 3D 预览' : '显示 3D 预览'}
    </button>
    {preview && spatialPreview}
  </>}
  {sceneEdit && !projectSpatialView && triangulationError && <p role="alert" className="text-amber-300">{triangulationError}</p>}
{!imageSquare&&<p className="text-amber-300">参考图非正方形，已保持原始比例并关闭九宫格切分。</p>}{!sceneEdit && <p className="text-neutral-400">按顺序连接顶点时须自行保证轮廓及绕序；未使用的点也可以保存。模型与参考需先手动调整比例和中心。GLB 导出按控制面投影耳切，退化或自相交面会阻止导出；参考图及各视角的标定参数会随 JSON 保存。</p>}</aside></div></fieldset>{loading&&<div className="absolute inset-0 z-[210] flex items-center justify-center bg-black/60 text-white" role="status">加载中，暂不能编辑…</div>}</div>;
}
