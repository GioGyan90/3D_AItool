import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {TracePreview} from './TracePreview';
import {triangulateFaces} from './traceGeometry';
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
const btn='rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40';
const MAX_VERTICES=5000,MAX_FACES=10000,MAX_REFERENCES=30000,MAX_FILE=10*1024*1024,MAX_IMAGE=5*1024*1024;
const readGeometry=(d:any):Geometry=>{let raw=d.vertices??d.verts,faces=Array.isArray(d.control)?d.control:d.faces;if(!Array.isArray(raw)||!Array.isArray(faces))throw Error('需要 vertices/verts 和 faces/control 数组');if(raw.length&&typeof raw[0]==='number'){if(raw.length%3)throw Error('顶点坐标数量不是 3 的倍数');raw=Array.from({length:raw.length/3},(_,i)=>raw.slice(3*i,3*i+3))}if(raw.length>MAX_VERTICES||faces.length>MAX_FACES||faces.reduce((n:number,f:any)=>n+(Array.isArray(f)?f.length:0),0)>MAX_REFERENCES)throw Error('超过限制：最多 5000 顶点、10000 控制面及 30000 个面顶点引用');if(raw.some((v:any)=>!Array.isArray(v)||v.length!==3||v.some((x:any)=>typeof x!=='number'||!Number.isFinite(x))))throw Error('顶点应是有限的 [x,y,z] 坐标');if(faces.some((f:any)=>!Array.isArray(f)||f.length<3||f.length>64||f.some((i:any)=>!Number.isInteger(i)||i<0||i>=raw.length)))throw Error('控制面索引无效');if(d.faceColors!==undefined&&(!Array.isArray(d.faceColors)||d.faceColors.length!==faces.length||d.faceColors.some((c:unknown)=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))))throw Error('逐面颜色必须与控制面数量一致且为 #RRGGBB');return {vertices:raw.map((v:number[])=>[...v] as V),faces:faces.map((f:number[])=>[...f]),...(d.faceColors?{faceColors:[...d.faceColors]}:{})}};

function CoordinateInput({axis,value,onCommit,onDraft}:{axis:string,value:number,onCommit:(n:number)=>void,onDraft:(dirty:boolean)=>void}){const [draft,setDraft]=useState(String(value));const editing=useRef(false);useEffect(()=>{if(!editing.current)setDraft(String(value))},[value]);return <label>{axis}<input aria-label={`顶点 ${axis}`} className="w-full bg-neutral-800 p-1" type="text" inputMode="decimal" data-trace-draft="true" data-dirty={draft!==String(value)} value={draft} onFocus={()=>{editing.current=true}} onChange={e=>{setDraft(e.target.value);onDraft(e.target.value!==String(value))}} onBlur={()=>{editing.current=false;const n=Number(draft);if(draft.trim()!==''&&Number.isFinite(n)){if(n!==value)onCommit(n);setDraft(String(n))}else {onDraft(true);return}onDraft(false)}} onKeyDown={e=>{if(e.key==='Enter'&&draft.trim()!==''&&Number.isFinite(Number(draft)))e.currentTarget.blur()}}/></label>}

export function ReferenceTracing({onClose,active,sceneEdit}:ReferenceTracingProps){
 const [projectSpatialView, setProjectSpatialView] = useState(true);
 // An editor for a scene layer is mounted per session and edits its own copy.
 const [geometry, setGeometry] = useState<Geometry | null>(() => sceneEdit ? readGeometry(sceneEdit.mesh) : null);
 const [past,setPast]=useState<MeshHistory[]>([]);
 const [future,setFuture]=useState<MeshHistory[]>([]);
 const dragRecorded=useRef(false);
 const [insetFraction,setInsetFraction]=useState(.25);
 const [xray,setXray]=useState(false);
 const [showCage,setShowCage]=useState(!Boolean(sceneEdit?.mesh.faceColors?.length));
 const [extrudeDistance,setExtrudeDistance]=useState(.2);
 const [toolPanel,setToolPanel]=useState<'topology'|'model'|'paint'|'inspect'>('topology');
 const [paintColor,setPaintColor]=useState<string>(RUBIK_FACE_COLORS.right);
 const [selectedFaces,setSelectedFaces]=useState<number[]>([]);
 const [symmetryAxes,setSymmetryAxes]=useState<SymmetryAxis[]>([]);
 const [advancedOpen,setAdvancedOpen]=useState(false);
 const [view,setView]=useState<View>('front'),[sourceMetadata,setSourceMetadata]=useState<Record<string,unknown>>({}),[image,setImage]=useState(''),[grid,setGrid]=useState(true),[opacity,setOpacity]=useState(.6),[calibration,setCalibration]=useState(initialCalibration),[selected,setSelected]=useState<number|null>(null),[edited,setEdited]=useState<number[]>([]),[dirty,setDirty]=useState(false),[referenceDirty,setReferenceDirty]=useState(false),[draftDirty,setDraftDirty]=useState(false),[selectedFace,setSelectedFace]=useState<number|null>(null),[selectedEdgeSlot,setSelectedEdgeSlot]=useState(0),[loopFraction,setLoopFraction]=useState(.5),[loopInfo,setLoopInfo]=useState(''),[loading,setLoading]=useState(false),[imageSquare,setImageSquare]=useState(true),[mode,setMode]=useState<'select'|'point'|'face'>('select'),[constraint,setConstraint]=useState<'both'|'horizontal'|'vertical'>('both'),[depth,setDepth]=useState(0),[depthText,setDepthText]=useState('0'),[faceDraft,setFaceDraft]=useState<number[]>([]),[preview,setPreview]=useState(false),[previewLarge,setPreviewLarge]=useState(false),[previewDirection,setPreviewDirection]=useState('angle'),[error,setError]=useState(''),[drag,setDrag]=useState(false),[showLabels,setShowLabels]=useState(true),[showAll,setShowAll]=useState(false),[backup,setBackup]=useState<{geometry:Geometry|null,image:string,imageSquare:boolean,grid:boolean,opacity:number,calibration:Record<View,Calibration>,metadata:Record<string,unknown>,edited:number[],showAll:boolean}|null>(null);const dialogRef=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),busy=useRef(false),referenceBaseline=useRef({image:'',imageSquare:true,grid:true,opacity:.6,calibration:initialCalibration(),showAll:false});const start=()=>{if(busy.current)return false;busy.current=true;setLoading(true);return true};const stop=()=>{busy.current=false;setLoading(false)};
 useEffect(()=>{if(!referenceDirty&&!loading)referenceBaseline.current={image,imageSquare,grid,opacity,calibration,showAll}},[referenceDirty,loading,image,imageSquare,grid,opacity,calibration,showAll]);
 useEffect(()=>{if(!dirty&&!referenceDirty&&!draftDirty&&!faceDraft.length)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,referenceDirty,draftDirty,faceDraft.length]);
 const pendingDraft=()=>dialogRef.current?.querySelector<HTMLInputElement>('input[data-trace-draft="true"][data-dirty="true"]');
 const protectDraft=(e:React.PointerEvent<HTMLDivElement>)=>{const input=pendingDraft();if(!input||e.target===input||(e.target as Element).closest('[data-trace-close]'))return;const text=input.value.trim();if(!text||!Number.isFinite(Number(text))){e.preventDefault();e.stopPropagation();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus();return}if(document.activeElement===input)input.blur()};
 const protectDraftClick=(e:React.MouseEvent<HTMLDivElement>)=>{const input=pendingDraft();if(!input||e.target===input||(e.target as Element).closest('[data-trace-close]'))return;const text=input.value.trim();if(!text||!Number.isFinite(Number(text))){e.preventDefault();e.stopPropagation();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus()}};
 const protectDraftKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{if(e.key!=='Tab')return;const input=pendingDraft();if(input&&(!input.value.trim()||!Number.isFinite(Number(input.value)))){e.preventDefault();setError('坐标尚未完成：请输入有限数字，再切换或放点');input.focus()}};
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
   setSelectedEdgeSlot(0);setError('');
 };
 const chooseFaceGroup=(kind:'plane'|'color')=>{
   if(!geometry||selectedFace===null)return;
   const ids=kind==='plane'?findCoplanarFaceIds(geometry,selectedFace):
     findMatchingColorFaceIds(geometry,selectedFace);
   if(!ids.length){setError('没有找到满足条件的控制面');return;}
   setSelectedFaces(ids);
   setLoopInfo(`已选择 ${ids.length} 个${kind==='plane'?'共面':'同色'}控制面，可一次配色。`);
 };
 const clearFaces=()=>{setSelectedFace(null);setSelectedFaces([]);setError('')};
 const selectedLoopFace=selectedFace===null?null:geometry?.faces[selectedFace];
 const selectedLoopEdge=selectedLoopFace?.length===4?[selectedLoopFace[selectedEdgeSlot],selectedLoopFace[(selectedEdgeSlot+1)%4]]:null;
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
   setFuture(f=>[...f,snapshot()]);restoreSnapshot(past[past.length-1]);setPast(p=>p.slice(0,-1));};
 const redoMesh=()=>{if(!future.length||busy.current||draftDirty||faceDraft.length)return;
   setPast(p=>[...p,snapshot()]);restoreSnapshot(future[future.length-1]);setFuture(f=>f.slice(0,-1));};
 const historyKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{
   protectDraftKey(e);
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
   setDirty(true);
   setEdited(old=>[...new Set([...old,...result.changed])]);
   setGeometry(g=>g?{...g,vertices:moveWithSymmetry(g,id,v,symmetryAxes).vertices}:g);
 };
 const pointer=(e:React.PointerEvent<SVGSVGElement>)=>{if(!drag||selected===null||!geometry||!svg.current)return;const pt=svg.current.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.current.getScreenCTM()!.inverse()),original=project(geometry.vertices[selected],view),x=constraint==='vertical'?original[0]:(p.x-cx)/scale,y=constraint==='horizontal'?original[1]:(cy-p.y)/scale;if(!dragRecorded.current){remember();dragRecorded.current=true;}update(selected,replaceProjection(geometry.vertices[selected],view,x,y));};
 const readData=(file:File)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
 const imageInfo=(url:string)=>new Promise<boolean>((resolve,reject)=>{if(!/^data:image\/(png|jpeg|webp);base64,/i.test(url))return reject(Error('只支持 PNG、JPEG、WebP 参考图'));const im=new Image();im.onload=()=>{if(im.naturalWidth>8192||im.naturalHeight>8192||im.naturalWidth*im.naturalHeight>16000000)reject(Error('图片尺寸过大，最多 1600 万像素且边长不超过 8192'));else resolve(Math.abs(im.naturalWidth/im.naturalHeight-1)<.01)};im.onerror=()=>reject(Error('参考图无法读取'));im.src=url});
 const loadMesh=async(e:React.ChangeEvent<HTMLInputElement>)=>{const target=e.currentTarget,file=target.files?.[0];if(!file||dirty||draftDirty||faceDraft.length>0||!start()){target.value='';return}try{if(file.size>MAX_FILE)throw Error('JSON 超过 10 MB');const d=JSON.parse(await file.text()),next=readGeometry(d),ref=d.reference,hasRef=ref&&['image','grid','showAll','opacity','calibration'].some(k=>k in ref);if(referenceDirty&&hasRef)throw Error('当前参考图或标定尚未保存，不能被导入文件覆盖');let square=imageSquare;if(typeof ref?.image==='string'&&ref.image){if(ref.image.length>MAX_IMAGE*1.4)throw Error('JSON 中的参考图超过 5 MB');square=await imageInfo(ref.image)}const {vertices,verts,faces,control,faceColors,reference,...extra}=d;setGeometry(next);setPast([]);setFuture([]);setSourceMetadata(extra);if(ref){if(typeof ref.image==='string'){setImage(ref.image);setImageSquare(square)}if(typeof ref.grid==='boolean')setGrid(ref.grid&&square);if(typeof ref.showAll==='boolean')setShowAll(ref.showAll);if(Number.isFinite(ref.opacity))setOpacity(Math.max(0,Math.min(1,ref.opacity)));if(ref.calibration){const nextCal=initialCalibration();for(const v of views){const c=ref.calibration[v.id];if(c&&[c.cx,c.cy,c.scale].every(Number.isFinite)&&c.scale>=50&&c.scale<=700)nextCal[v.id]={cx:c.cx,cy:c.cy,scale:c.scale}}setCalibration(nextCal)}if(hasRef)setReferenceDirty(false)}setEdited(Array.isArray(ref?.editedVertexIds)?ref.editedVertexIds.filter((i:unknown)=>Number.isInteger(i)):[]);setDirty(false);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setError('')}catch(x){setError('载入失败：'+String(x))}finally{target.value='';stop()}};
 const undoReference=()=>{if(busy.current)return;const b=referenceBaseline.current;setImage(b.image);setImageSquare(b.imageSquare);setGrid(b.grid);setOpacity(b.opacity);setCalibration(b.calibration);setShowAll(b.showAll);setReferenceDirty(false);setError('')};
 const restoreBackup=()=>{if(!backup||dirty||referenceDirty||draftDirty||faceDraft.length>0||busy.current)return;setGeometry(backup.geometry);setPast([]);setFuture([]);setImage(backup.image);setImageSquare(backup.imageSquare);setGrid(backup.grid);setOpacity(backup.opacity);setCalibration(backup.calibration);setSourceMetadata(backup.metadata);setEdited(backup.edited);setShowAll(backup.showAll);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setMode('select');setDirty(false);setReferenceDirty(false);setBackup(null)};
 const loadImage=async(e:React.ChangeEvent<HTMLInputElement>)=>{const target=e.currentTarget,file=target.files?.[0];if(!file||referenceDirty||!start()){target.value='';return}try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('只支持 PNG、JPEG、WebP，不支持 SVG');if(file.size>MAX_IMAGE)throw Error('参考图超过 5 MB');const url=await readData(file),square=await imageInfo(url);setImage(url);setImageSquare(square);if(!square)setGrid(false);setReferenceDirty(true);setError('')}catch(e){setError('载入图片失败：'+String(e))}finally{target.value='';stop()}};
 const newMesh=()=>{if(dirty||draftDirty||faceDraft.length>0||backup||busy.current)return;if(geometry||image)setBackup({geometry,image,imageSquare,grid,opacity,calibration,metadata:sourceMetadata,edited,showAll});setGeometry({vertices:[],faces:[]});setPast([]);setFuture([]);setSourceMetadata({});setEdited([]);setDirty(true);setSelected(null);setSelectedFace(null);setSelectedFaces([]);setFaceDraft([]);setMode('point')};
 const canvasPoint=(e:React.PointerEvent<SVGSVGElement>)=>{if(mode!=='point'||!geometry||!svg.current||busy.current||geometry.vertices.length>=MAX_VERTICES)return;const pt=svg.current.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const depthValue=Number(depthText);if(depthText.trim()===''||!Number.isFinite(depthValue)){setError('隐藏轴坐标无效，请输入有限数字后再放点');return}const p=pt.matrixTransform(svg.current.getScreenCTM()!.inverse()),x=(p.x-cx)/scale,y=(cy-p.y)/scale,v=replaceProjection(view==='side'?[depthValue,0,0]:view==='top'||view==='bottom'?[0,depthValue,0]:[0,0,depthValue],view,x,y);setError('');remember();setGeometry(g=>g?{...g,vertices:[...g.vertices,v]}:g);setSourceMetadata(old=>{const m=old.meta;if(!m||typeof m!=='object')return old;const obj=m as Record<string,unknown>,tags=obj.tags;if(!Array.isArray(tags)||tags.length!==geometry.vertices.length)return old;return {...old,meta:{...obj,tags:[...tags,{source:'手工放置',view,depth:`用户指定隐藏轴 ${depthValue}`}]}}});setSelected(geometry.vertices.length);setEdited(old=>[...old,geometry.vertices.length]);setDirty(true)};
 const finishFace=()=>{if(!geometry||faceDraft.length<3||faceDraft.length>64)return;if(geometry.faces.length>=MAX_FACES||geometry.faces.reduce((n,f)=>n+f.length,0)+faceDraft.length>MAX_REFERENCES){setError('超过限制：最多 10000 控制面及 30000 个面顶点引用');return}const f=faceDraft;if(f.some(i=>!Number.isInteger(i)||i<0||i>=geometry.vertices.length)){setError('待连接顶点不属于当前网格');setFaceDraft([]);return}if(new Set(f).size!==f.length){setError('面不能重复引用顶点');return}let n=new THREE.Vector3();for(let i=0;i<f.length;i++){const a=geometry.vertices[f[i]],b=geometry.vertices[f[(i+1)%f.length]];n.x+=(a[1]-b[1])*(a[2]+b[2]);n.y+=(a[2]-b[2])*(a[0]+b[0]);n.z+=(a[0]-b[0])*(a[1]+b[1])}if(n.lengthSq()<1e-14){setError('面面积为零，请调整顶点');return}remember();setGeometry(g=>g?{...g,faces:[...g.faces,[...f]],...(g.faceColors?{faceColors:[...g.faceColors,'#aab3c3']}: {})}:g);setDirty(true);setFaceDraft([]);setError('')};
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
 const deleteVertex=()=>{if(!geometry||selected===null||faceDraft.length>0||geometry.faces.some(f=>f.includes(selected)))return;const oldCount=geometry.vertices.length;remember();setGeometry(g=>g?{...g,vertices:g.vertices.filter((_,i)=>i!==selected),faces:g.faces.map(f=>f.map(i=>i>selected?i-1:i))}:g);setSourceMetadata(old=>{const m=old.meta;if(!m||typeof m!=='object')return old;const obj=m as Record<string,unknown>,tags=obj.tags;if(!Array.isArray(tags)||tags.length>oldCount)return old;return {...old,meta:{...obj,tags:tags.filter((_,i)=>i!==selected)}}});setEdited(old=>old.filter(i=>i!==selected).map(i=>i>selected?i-1:i));setSelected(null);setDirty(true)};
 const deleteFace=()=>{if(!geometry||faceDraft.length>0||selectedFace===null||selectedFace<0||selectedFace>=geometry.faces.length)return;remember();setGeometry(g=>g?{...g,faces:g.faces.filter((_,i)=>i!==selectedFace),...(g.faceColors?{faceColors:g.faceColors.filter((_,i)=>i!==selectedFace)}:{})}:g);setSelectedFace(null);setSelectedFaces([]);setDirty(true)};
 const save=()=>{if(!geometry)return;download(new Blob([JSON.stringify({...sourceMetadata,...geometry,reference:{image,grid,opacity,calibration,showAll,editedVertexIds:edited}},null,2)],{type:'application/json'}),'vertex-cage.json');setDirty(false);setReferenceDirty(false)};
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
     ? 'flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900'
     : previewLarge
       ? 'fixed inset-4 z-[205] flex flex-col rounded border border-neutral-600 bg-neutral-900 p-3 shadow-xl'
       : undefined}>
     <div className="flex min-h-10 flex-wrap items-center gap-1 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2">
       {!sceneEdit && (
         <button className={btn} onClick={() => setPreviewLarge(value => !value)} aria-pressed={previewLarge}>
           {previewLarge ? '恢复小预览' : '放大3D编辑'}
         </button>
       )}
       {[['front', '正面'], ['back', '背面'], ['angle', '3/4'], ['low', '低角度']].map(([direction, label]) => (
         <button key={direction} className={btn+(previewDirection===direction?' !border-sky-500 !bg-sky-900':'')} onClick={() => setPreviewDirection(direction)} aria-pressed={previewDirection === direction}>
           {label}
         </button>
       ))}
       <button className={btn+' ml-auto'} aria-pressed={!showCage} onClick={()=>setShowCage(value=>!value)}>{showCage?'成品预览':'显示布线'}</button>
        {showCage&&<label className="ml-2 flex items-center gap-2 text-xs text-neutral-300"><input aria-label="透视背面布线" type="checkbox" checked={xray} onChange={e=>setXray(e.target.checked)}/>背面布线 X-Ray</label>}
     </div>
     <div aria-label="3D 旋转预览" className={previewLarge || sceneEdit ? 'min-h-0 w-full flex-1' : 'h-64 w-full'}>
       {active && <TracePreview data={geometry} direction={previewDirection} selected={selected} selectedFace={selectedFace} selectedFaces={selectedFaces} xray={xray} showCage={showCage}
  selectedEdge={selectedLoopEdge as [number,number]|null} onSelect={i=>{setSelected(i);if(i!==null){setToolPanel('model');setShowCage(true)}}} onMove={update}
  onSelectFace={(fi,additive)=>chooseFace(fi,additive)}
  onSelectEdge={(fi,slot)=>{chooseFace(fi);setSelectedEdgeSlot(slot);setToolPanel('topology');setShowCage(true)}}
  onStartMove={remember}/>}
     </div>
     <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-400">
  <span>{showCage?'编辑模式 · 点选顶点/边线/控制面':'成品模式 · 隐藏辅助线，仍可点选控制面'}</span>
  <span>Shift + 点击面：多选 · 鼠标拖动空白：旋转</span>
 </div>
     {triangulationError && <p role="alert" className="text-amber-300">面暂不可三角化，预览仅显示点和线。{triangulationError}</p>}
   </div>
 );
 return <div ref={dialogRef} onPointerDownCapture={protectDraft} onClickCapture={protectDraftClick} onKeyDownCapture={historyKey} className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-neutral-950 text-neutral-100" role="dialog" aria-modal="true" aria-label={sceneEdit ? "场景顶点编辑" : "顶点参考对照"}>
  <fieldset disabled={loading} className="flex min-h-0 flex-1 flex-col"><header className="flex flex-wrap items-center gap-2 border-b border-neutral-700 p-3"><h2 className="mr-auto font-semibold">{sceneEdit ? `编辑顶点 · ${sceneEdit.name}` : '顶点参考对照'}</h2>
    {sceneEdit ? <>
      <button className={btn} onClick={() => setProjectSpatialView(true)} aria-pressed={projectSpatialView}>3D 编辑</button>
      <button className={btn} onClick={() => setProjectSpatialView(false)} aria-pressed={!projectSpatialView}>正交编辑</button>
      <button className={btn+' border-blue-400 !bg-blue-900'} disabled={!dirty || !geometry?.faces.length || draftDirty || faceDraft.length > 0 || Boolean(triangulationError)} onClick={applyToScene}>应用到场景</button>
    </> : <>{backup&&<button className={btn} disabled={dirty||referenceDirty||draftDirty||faceDraft.length>0} onClick={restoreBackup}>恢复新建前状态</button>}<button className={btn} disabled={dirty||draftDirty||faceDraft.length>0||!!backup} onClick={newMesh}>新建空网格</button><label className={btn+' cursor-pointer'}>导入参考图<input aria-label="导入参考图" type="file" accept="image/png,image/jpeg,image/webp" disabled={referenceDirty} className="hidden" onChange={loadImage}/></label><label className={btn+' cursor-pointer'}>导入顶点 JSON<input aria-label="导入顶点 JSON" type="file" accept="application/json,.json" disabled={dirty||draftDirty||faceDraft.length>0} className="hidden" onChange={loadMesh}/></label><button className={btn} disabled={!geometry} onClick={save}>保存顶点 JSON</button><button className={btn} disabled={!geometry?.faces.length} onClick={exportGlb}>导出 GLB</button></>}
    <button className={btn} disabled={!past.length||draftDirty||faceDraft.length>0} onClick={undoMesh} title="Ctrl+Z">撤销</button><button className={btn} disabled={!future.length||draftDirty||faceDraft.length>0} onClick={redoMesh} title="Ctrl+Shift+Z / Ctrl+Y">重做</button><button className={btn} data-trace-close onClick={closeEditor} aria-label={sceneEdit ? '关闭场景顶点编辑' : '关闭顶点参考对照'}>×</button></header>
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row"><div className="flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden p-2 lg:min-h-0 lg:p-3">
   {sceneEdit && projectSpatialView ? spatialPreview : <>
   <div className="mb-2 flex flex-wrap gap-2">{views.map(v=><button key={v.id} className={btn+(view===v.id?' !border-blue-400 !bg-blue-900':'')} onClick={()=>{setView(v.id);setSelected(null)}} aria-pressed={view===v.id}>{v.label}</button>)}</div>
   <div className="mb-2 flex flex-wrap items-center gap-2">{([['select','选择/移动'],['point','放置顶点'],['face','连接成面']] as const).map(([id,label])=><button key={id} className={btn+(mode===id?' !border-blue-400 !bg-blue-900':'')} disabled={!geometry||(faceDraft.length>0&&id!=='face')} onClick={()=>{setMode(id)}} aria-pressed={mode===id}>{label}</button>)}{mode==='select'&&<label>拖动约束 <select aria-label="拖动约束" className="bg-neutral-800 p-1" value={constraint} onChange={e=>setConstraint(e.target.value as typeof constraint)}><option value="both">横竖均可</option><option value="horizontal">仅水平</option><option value="vertical">仅垂直</option></select></label>}{mode==='point'&&<label>隐藏轴坐标（{view==='side'?'X':view==='top'||view==='bottom'?'Y':'Z'}）<input aria-label={`顶点 新顶点隐藏轴坐标（${view==='side'?'X':view==='top'||view==='bottom'?'Y':'Z'}）`} className="ml-2 w-24 bg-neutral-800 p-1" type="text" inputMode="decimal" data-trace-draft="true" data-dirty={depthText!==String(depth)} value={depthText} onChange={e=>{setDepthText(e.target.value);setDraftDirty(e.target.value!==String(depth))}} onBlur={()=>{const n=Number(depthText);if(depthText.trim()!==''&&Number.isFinite(n)){setDepth(n);setDepthText(String(n));setDraftDirty(false)}else setError('隐藏轴坐标无效，请输入有限数字后再放点')}}/></label>}{mode==='face'&&<><span>待连接：{faceDraft.join(' → ')||'无'}（尚未保存）</span><button className={btn} disabled={selected===null||faceDraft.includes(selected)} onClick={()=>selected!==null&&setFaceDraft(old=>[...old,selected])}>添加选中点</button><button className={btn} disabled={!faceDraft.length} onClick={()=>setFaceDraft(old=>old.slice(0,-1))}>撤销上一个点</button><button className={btn} disabled={!faceDraft.length} onClick={()=>setFaceDraft([])}>清空待连接</button><button className={btn} disabled={faceDraft.length<3} onClick={finishFace}>完成面</button></>}</div><div className="min-h-[300px] flex-1 overflow-auto bg-neutral-800"><svg ref={svg} onPointerDown={canvasPoint} viewBox="0 0 1000 1000" className="mx-auto block h-full max-h-[min(80vh,900px)] w-full touch-none select-none" onPointerMove={pointer} onPointerUp={()=>setDrag(false)} onPointerCancel={()=>setDrag(false)}><defs><clipPath id="trace-crop"><rect width="1000" height="1000"/></clipPath></defs><rect width="1000" height="1000" fill="#e9e9e9"/>{image&&<g clipPath="url(#trace-crop)" opacity={opacity}><image href={image} x={grid?-(cell%3)*1000:0} y={grid?-Math.floor(cell/3)*1000:0} width={grid?3000:1000} height={grid?3000:1000} preserveAspectRatio="xMidYMid meet"/></g>}
    {geometry&&<g>{edges.map(([a,b])=>{const A=screen(geometry.vertices[a]),B=screen(geometry.vertices[b]),key=a<b?`${a}:${b}`:`${b}:${a}`,quad=edgeToQuad.get(key),active=!!selectedLoopEdge&&key===(selectedLoopEdge[0]<selectedLoopEdge[1]?`${selectedLoopEdge[0]}:${selectedLoopEdge[1]}`:`${selectedLoopEdge[1]}:${selectedLoopEdge[0]}`);return <line key={`${a}-${b}`} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={active?'#00a4e4':'#ff791a'} strokeWidth={active?7:5} className={quad?'cursor-crosshair':''} onPointerDown={e=>{if(!quad||mode!=='select')return;e.stopPropagation();chooseFace(quad.face);setSelectedEdgeSlot(quad.slot);setToolPanel('topology');setLoopInfo('')}}/>})}{geometry.vertices.map((p,i)=>{if(!showAll&&!visible.has(i)&&selected!==i)return null;const [x,y]=screen(p);return <g key={i} onPointerDown={e=>{e.stopPropagation();dragRecorded.current=false;if(mode==='face'){setSelected(i);setFaceDraft(old=>old.includes(i)||old.length>=64?old:[...old,i])}else if(mode==='select'){e.currentTarget.setPointerCapture(e.pointerId);setSelected(i);setDrag(true)}}}><circle cx={x} cy={y} r={selected===i?8:5} fill={selected===i?'#ed2d2d':'#0964ef'} stroke="white" strokeWidth="1.5"/>{showLabels&&<text x={x+7} y={y-6} fontSize="15" fill="#132d65" stroke="white" strokeWidth=".8" paintOrder="stroke">{i}</text>}</g>})}</g>}</svg></div>
   </>}
  </div>
  <aside className="min-h-0 w-full shrink-0 space-y-3 overflow-y-auto border-t border-neutral-800 bg-neutral-950 p-3 text-sm lg:w-[376px] lg:max-w-[376px] lg:border-l lg:border-t-0 lg:p-4 max-h-[42vh] lg:max-h-full">{(dirty||referenceDirty||draftDirty||faceDraft.length>0)&&<p className="text-amber-300">{sceneEdit ? '完成待连接的面后，点击「应用到场景」写入图层。' : '当前工作区有未保存修改或待连接的面；替换内容前请先完成或清空待连接，并保存 JSON。'}</p>}{referenceDirty&&<button className={btn} onClick={undoReference}>撤销参考更改</button>}{!(sceneEdit && projectSpatialView) && <><p className="text-neutral-300">正交投影的顶点会覆盖在参考图上。拖动只修改当前视图的两个坐标，第三个坐标保留。</p><label className="flex gap-2"><input type="checkbox" checked={grid} disabled={!imageSquare} onChange={e=>{setGrid(e.target.checked);setReferenceDirty(true)}}/>参考图为 3×3 九宫格</label><label className="flex gap-2"><input type="checkbox" checked={showAll} onChange={e=>{setShowAll(e.target.checked);setReferenceDirty(true)}}/>前后点线同时显示</label><label className="flex gap-2"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>显示顶点编号</label><label className="block">参考透明度 <input className="w-full" type="range" min="0" max="1" step=".01" value={opacity} onChange={e=>{setOpacity(+e.target.value);setReferenceDirty(true)}}/></label><label className="block">模型比例 <input className="w-full" type="range" min="50" max="700" value={scale} onChange={e=>setScale(+e.target.value)}/></label><div className="grid grid-cols-2 gap-2">{[['水平中心',cx,setCx],['垂直中心',cy,setCy]].map(([label,val,setter])=><label key={String(label)}>{String(label)}<input className="w-full bg-neutral-800 p-1" type="number" value={val as number} onChange={e=>(setter as (v:number)=>void)(+e.target.value)}/></label>)}</div></>}
  {geometry?<><section className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 space-y-3">
  <div className="flex justify-between gap-2"><h3 className="font-semibold text-sky-200">建模工具</h3><span className="text-xs text-neutral-400">按任务选择 · 逐步造型</span></div>
  <div className="grid grid-cols-4 gap-1 rounded bg-neutral-950 p-1">
   {([['topology','布线'],['model','塑形'],['paint','配色'],['inspect','检查']] as const).map(([id,label])=>
     <button key={id} aria-pressed={toolPanel===id} className={'rounded py-2 text-xs '+(toolPanel===id?'bg-sky-800 text-white':'text-neutral-400 hover:bg-neutral-800')} onClick={()=>setToolPanel(id)}>{label}</button>)}
  </div>
  {toolPanel==='topology'&&<div className="space-y-3">
    <div className="space-y-2 rounded border border-amber-700/40 bg-amber-950/20 p-3">
      <div className="font-medium text-amber-200">示例：单立方体 → 3×3 魔方</div>
      <p className="text-xs text-neutral-300">沿 X、Y、Z 各插入两条真实的连续环线，保持共享顶点，不创建 27 个独立立方体。</p>
      <button className={btn+' w-full border-amber-500/50 !bg-amber-900/30'} onClick={makeRubik} disabled={!isBaseBox||draftDirty||faceDraft.length>0}>六次环切 · 生成魔方</button>
      {!isBaseBox&&<p className="text-xs text-neutral-500">仅原始 8 顶点立方体可使用，避免覆盖已编辑几何体。</p>}
    </div>
    <p className="text-xs text-neutral-400">选择 3D 或正交视图中的边线，再调整切割位置。</p>
    {selectedLoopFace?.length===4?
      <label className="block text-xs">起始面 #{selectedFace} · 边
        <select aria-label="布线起始边" className="mt-1 w-full rounded bg-neutral-800 p-2" value={selectedEdgeSlot} onChange={e=>setSelectedEdgeSlot(Number(e.target.value))}>
          {selectedLoopFace.map((id,i)=><option key={i} value={i}>边 {i+1} · {id} → {selectedLoopFace[(i+1)%4]}</option>)}
        </select>
      </label>:<p className="text-xs text-amber-300">请选择一个四边面上的边线或输入控制面编号。</p>}
    <label className="block text-xs">切割比例：{Math.round(loopFraction*100)}%
      <input aria-label="布线位置" className="mt-1 w-full" type="range" min=".05" max=".95" step=".05" value={loopFraction} onChange={e=>setLoopFraction(Number(e.target.value))}/>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <button className={btn+' !bg-sky-900'} disabled={!selectedLoopFace||selectedLoopFace.length!==4||faceDraft.length>0||draftDirty} onClick={addEdgeLoop}>连续环线</button>
      <button className={btn} disabled={!selectedLoopFace||selectedLoopFace.length!==4||faceDraft.length>0||draftDirty} onClick={addLocalCut}>局部切割</button>
    </div>
    <p className="text-xs text-neutral-500">局部切割自动重构邻面，避免 T 型悬空端点。</p>
  </div>}
  {toolPanel==='model'&&<div className="space-y-3">
    <p className="text-xs text-neutral-400">选择一个控制面后执行操作，所有步骤可撤销。</p>
    <label className="block text-xs">内插收缩 {Math.round(insetFraction*100)}%
      <input aria-label="面内插比例" className="w-full" type="range" min=".05" max=".85" step=".05" value={insetFraction} onChange={e=>setInsetFraction(Number(e.target.value))}/>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||faceDraft.length>0||draftDirty} onClick={addInset}>面内插 · Inset</button>
    <label className="block text-xs">法线挤出距离
      <input aria-label="挤出距离" type="number" step=".05" min="-100" max="100" className="mt-1 w-full rounded bg-neutral-800 p-2" value={extrudeDistance} onChange={e=>setExtrudeDistance(Number(e.target.value))}/>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||faceDraft.length>0||draftDirty} onClick={addExtrude}>面挤出 · Extrude</button>
    <details className="rounded border border-neutral-700 p-2 text-xs"><summary className="cursor-pointer">X=0 半模型镜像</summary>
      <p className="my-2 text-neutral-400">要求网格在 X 坐标单侧，且中心线顶点在 X=0。</p>
      <button className={btn+' w-full'} disabled={faceDraft.length>0||draftDirty} onClick={addMirror}>镜像并焊接中心线</button>
    </details>
  </div>}
  {toolPanel==='paint'&&<div className="space-y-3">
    <p className="text-xs text-neutral-300">面颜色保留于控制网格与 JSON / GLB；彩色贴纸不增加控制面。</p>
    <div className="text-sm">{selectedFace===null?'请在 3D 视图中点选一个控制面':`当前选中控制面 #${selectedFace}`}</div>
    <div className="grid grid-cols-3 gap-2">
      {Object.entries(RUBIK_FACE_COLORS).map(([name,color])=>
        <button key={name} aria-label={`涂色 ${name}`} title={name} className="h-10 rounded border border-white/20 disabled:opacity-40" style={{backgroundColor:color}}
          disabled={selectedFace===null||draftDirty} onClick={()=>paintSelectedFace(color)}>
          {geometry.faceColors?.[selectedFace??-1]===color?'✓':''}
        </button>)}
    </div>
    <label className="flex items-center gap-2 text-xs">自选颜色
      <input aria-label="自定义面颜色" type="color" value={paintColor} onChange={e=>setPaintColor(e.target.value)}/>
      <span>{paintColor}</span>
    </label>
    <button className={btn+' w-full'} disabled={selectedFace===null||draftDirty} onClick={()=>paintSelectedFace(paintColor)}>应用到选中面</button>
    <button className={btn+' w-full'} disabled={!geometry.faceColors||draftDirty} onClick={removeFaceColors}>清空全部面颜色</button>
  </div>}
  {toolPanel==='inspect'&&<div className="space-y-2 text-xs">
    <p>顶点 <strong>{geometry.vertices.length}</strong> · 控制面 <strong>{geometry.faces.length}</strong></p>
    <p>已着色面 <strong>{geometry.faceColors?.length??0}</strong> · 已移动顶点 <strong>{edited.length}</strong></p>
    <p className="text-neutral-400">X-Ray 开关控制背面边线显示。有效几何体必须保留共享边与正确面绕序。</p>
    <p className="text-neutral-500">后续缺失：任意多边面刀切、边桥接、对称实时拖点、转动魔方层组与 UV。</p>
  </div>}
  {loopInfo&&<p role="status" className="rounded bg-sky-950/30 p-2 text-xs text-sky-300">{loopInfo}</p>}
</section><div>顶点 {geometry.vertices.length} · 控制面 {geometry.faces.length}</div><label className="block">控制面编号<input aria-label="控制面编号" className="ml-2 w-20 bg-neutral-800 p-1" type="number" min="0" max={Math.max(0,geometry.faces.length-1)} value={selectedFace??''} onChange={e=>{if(e.target.value===''){setSelectedFace(null);return}const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<geometry.faces.length){setSelectedFace(n);setSelectedEdgeSlot(0)}}}/></label>{selectedFace!==null&&geometry.faces[selectedFace]&&<div>面 #{selectedFace}：{geometry.faces[selectedFace].join(' → ')} <button className={btn} disabled={faceDraft.length>0} title={faceDraft.length?"请先完成或清空待连接的面":"删除此控制面"} onClick={deleteFace}>删除此面</button></div>}<label className="block">选择顶点编号<input aria-label="选择顶点编号" className="ml-2 w-20 bg-neutral-800 p-1" type="number" min="0" max={geometry.vertices.length-1} value={selected??''} onChange={e=>{if(e.target.value===''){setSelected(null);return}const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<geometry.vertices.length)setSelected(n)}} /></label><p className="text-neutral-400">默认按控制面绕序近似隐藏背面，并非完整遮挡检测；隐藏或重叠的点可按编号选择。已修改 {edited.length} 点，原始来源记录保留但不代表修改后仍与原测点一致。</p>{selected!==null&&<><div>选中顶点 #{selected}{edited.includes(selected)?' · 已修改':''}</div><button className={btn} disabled={faceDraft.length>0||geometry.faces.some(f=>f.includes(selected))} title={faceDraft.length?'请先完成或清空待连接的面':geometry.faces.some(f=>f.includes(selected))?'该点仍被控制面引用，请先删除相关面':'删除未被引用的顶点'} onClick={deleteVertex}>删除未引用顶点</button>{geometry.faces.some(f=>f.includes(selected))&&<p className="text-neutral-400">该点仍被控制面引用，请先删除相关面。</p>}{(()=>{const tags=(sourceMetadata.meta as any)?.tags,tag=Array.isArray(tags)?tags[selected]:null;return tag?<dl className="break-words text-neutral-300"><dt>来源</dt><dd>{String(tag.source??'未记录')}{tag.row?` · ${tag.row}`:''}</dd>{Array.isArray(tag.frontPixel)&&<><dt>正面像素</dt><dd>{tag.frontPixel.join(', ')}</dd></>}{tag.depth&&<><dt>深度依据</dt><dd>{String(tag.depth)}</dd></>}</dl>:<p className="text-neutral-400">该点暂无参考来源记录。</p>})()}<div className="grid grid-cols-3 gap-2">{(['X','Y','Z'] as const).map((axis,i)=><CoordinateInput key={`${selected}:${axis}`} axis={axis} value={geometry.vertices[selected][i]} onDraft={setDraftDirty} onCommit={n=>{const v=[...geometry.vertices[selected]] as V;v[i]=n;remember();update(selected,v)}}/>)}</div></>}</>:<p className="text-amber-300">请先导入含 vertices 和 faces 的网格 JSON。</p>}
  {!sceneEdit && geometry && <>
    <button className={btn} onClick={() => setPreview(value => !value)} aria-expanded={preview}>
      {preview ? '收起 3D 预览' : '显示 3D 预览'}
    </button>
    {preview && spatialPreview}
  </>}
  {sceneEdit && !projectSpatialView && triangulationError && <p role="alert" className="text-amber-300">{triangulationError}</p>}
{!imageSquare&&<p className="text-amber-300">参考图非正方形，已保持原始比例并关闭九宫格切分。</p>}{!sceneEdit && <p className="text-neutral-400">按顺序连接顶点时须自行保证轮廓及绕序；未使用的点也可以保存。模型与参考需先手动调整比例和中心。GLB 导出按控制面投影耳切，退化或自相交面会阻止导出；参考图及各视角的标定参数会随 JSON 保存。</p>}{error&&<p className="text-red-400" role="alert">{error}</p>}</aside></div></fieldset>{loading&&<div className="absolute inset-0 z-[210] flex items-center justify-center bg-black/60 text-white" role="status">加载中，暂不能编辑…</div>}</div>;
}
