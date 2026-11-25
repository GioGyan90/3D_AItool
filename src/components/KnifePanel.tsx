import {useState,useMemo,useEffect} from 'react';
import type {ControlMesh} from '../types';
import {knifeCut,dissolveEdge,mergeEdgeVertices,type KnifePoint,type KnifeStep} from './knifeTopology';
type Props={mesh:ControlMesh;selectedFace:number|null;selectedVertex:number|null;locked:boolean;disabled:boolean;onApply:(mesh:ControlMesh,label:string)=>void;onPreview:(segments:[number,number,number][])=>void};
const btn='topo-button rounded border px-2 py-1 text-xs disabled:opacity-40';
function Endpoint({face,value,onChange,label}:{face:number[];value:KnifePoint|null;onChange:(p:KnifePoint|null)=>void;label:string}){
 const encoded=value?'vertex' in value?'v:'+value.vertex:'e:'+value.edge.join(':'):'';
 return <div className="space-y-1"><label>{label}<select aria-label={label} className="w-full bg-neutral-800 p-1" value={encoded} onChange={e=>{const [kind,a,b]=e.target.value.split(':');onChange(kind==='v'?{vertex:Number(a)}:kind==='e'?{edge:[Number(a),Number(b)],fraction:.5}:null)}}>
 <option value="">请选择端点</option>{face.map((id,i)=><option key={'v'+id} value={'v:'+id}>顶点 #{id}</option>)}{face.map((id,i)=><option key={'e'+i} value={'e:'+id+':'+face[(i+1)%face.length]}>边 #{id} → #{face[(i+1)%face.length]}</option>)}
 </select></label>{value&&'edge' in value&&<label>边内比例 {Math.round(value.fraction*100)}%<input aria-label={label+'比例'} className="w-full" type="range" min=".02" max=".98" step=".01" value={value.fraction} onChange={e=>onChange({...value,fraction:+e.target.value})}/></label>}</div>;
}
export function KnifePanel({mesh,selectedFace,selectedVertex,locked,disabled,onApply,onPreview}:Props){
 const [steps,setSteps]=useState<KnifeStep[]>([]),[from,setFrom]=useState<KnifePoint|null>(null),[to,setTo]=useState<KnifePoint|null>(null);
 const [edge,setEdge]=useState(''),[angle,setAngle]=useState(5),[keep,setKeep]=useState('');
 const face=selectedFace===null?[]:mesh.faces[selectedFace]??[];
 useEffect(()=>{setSteps([]);setFrom(null);setTo(null);setEdge('');setKeep('')},[mesh]);
 useEffect(()=>{const last=steps.at(-1)?.to;const f=selectedFace===null?[]:mesh.faces[selectedFace]??[];
 if(last&&'vertex' in last&&f.includes(last.vertex))setFrom(last);
 else if(last&&'edge' in last){const [a,b]=last.edge;const i=f.findIndex((v,i)=>v===a&&f[(i+1)%f.length]===b||v===b&&f[(i+1)%f.length]===a);setFrom(i<0?null:{edge:[f[i],f[(i+1)%f.length]],fraction:f[i]===a?last.fraction:1-last.fraction});}
 else setFrom(null);setTo(null);setEdge('')
 },[selectedFace]);
 useEffect(()=>{setKeep('')},[selectedVertex]);
 const preview=useMemo(()=>{try{return steps.length?{mesh:knifeCut(mesh,steps),error:''}:null}catch(e){return {mesh:null,error:String(e)}}},[mesh,steps]);
 const segments=useMemo(()=>{
 const position=(p:KnifePoint):[number,number,number]=>{if('vertex' in p)return mesh.vertices[p.vertex];const [a,b]=p.edge;if(!mesh.vertices[a]||!mesh.vertices[b])return undefined as unknown as [number,number,number];return mesh.vertices[a].map((v,i)=>v*(1-p.fraction)+mesh.vertices[b][i]*p.fraction) as [number,number,number]};
 return [...steps,...(selectedFace!==null&&from&&to?[{face:selectedFace,from,to}]:[])].flatMap(s=>{const a=position(s.from),b=position(s.to);return a&&b?[a,b]:[]});
 },[mesh,steps,selectedFace,from,to]);
 useEffect(()=>{onPreview(segments);return()=>onPreview([])},[segments,onPreview]);
 const blocked=locked||disabled;
 const neighbors=selectedVertex===null?[]:[...new Set(mesh.faces.flatMap(f=>f.flatMap((v,i)=>v===selectedVertex?[f[(i+1)%f.length],f[(i+f.length-1)%f.length]]:[])))];
 const dissolve=useMemo(()=>{if(!edge)return null;try{const [a,b]=edge.split(':').map(Number);return {mesh:dissolveEdge(mesh,a,b,angle),error:''}}catch(e){return {mesh:null,error:String(e)}}},[mesh,edge,angle]);
 const merge=useMemo(()=>{if(selectedVertex===null||keep==='')return null;try{return {mesh:mergeEdgeVertices(mesh,selectedVertex,Number(keep)),error:''}}catch(e){return {mesh:null,error:String(e)}}},[mesh,selectedVertex,keep]);
 return <section aria-label="自由拓扑编辑" className="space-y-2">
 {blocked&&<p className="text-amber-300 text-xs">请先解除区域锁定、关闭对称编辑并完成当前坐标或面草稿。</p>}
 <details className="rounded border border-neutral-700 p-2 space-y-2"><summary>自由刀切 · 连续路径</summary>
 <p className="topo-helptext">绿色线段为三维路径预览，不写入模型。逐面选择切割起点和终点。切换到相邻控制面时自动继承上一段终点，反向共享边自动转换比例。每个原始控制面最多切一次；可在已有顶点结束。</p>
 <p>当前控制面：{selectedFace===null?'未选中':'#'+selectedFace}</p>
 <Endpoint face={face} label="刀切起点" value={from} onChange={setFrom}/><Endpoint face={face} label="刀切终点" value={to} onChange={setTo}/>
 <button className={btn} disabled={blocked||selectedFace===null||!from||!to} onClick={()=>{if(selectedFace!==null&&from&&to){setSteps(old=>[...old,{face:selectedFace,from,to}]);setFrom(null);setTo(null)}}}>加入切割路径</button>
 <p>路径段数：{steps.length} · {steps.map(s=>'#'+s.face).join(' → ')}</p>
 <div className="flex gap-1"><button className={btn} disabled={!steps.length} onClick={()=>setSteps(old=>old.slice(0,-1))}>撤回末段</button><button className={btn} disabled={!steps.length} onClick={()=>setSteps([])}>清空路径</button></div>
 {preview?.error&&<p role="alert">{preview.error}</p>}{preview?.mesh&&<p>预检通过：{preview.mesh.vertices.length} 顶点 / {preview.mesh.faces.length} 面</p>}
 <button className={btn+' w-full'} disabled={blocked||!preview?.mesh} onClick={()=>{if(preview?.mesh)onApply(preview.mesh,'自由刀切完成')}}>应用自由刀切</button>
 </details>
 <details className="rounded border border-neutral-700 p-2 space-y-2"><summary>共享边溶解</summary><label>选中面的共享边<select aria-label="溶解边" className="w-full bg-neutral-800 p-1" value={edge} onChange={e=>setEdge(e.target.value)}><option value="">请选择</option>{face.map((a,i)=><option key={i} value={a+':'+face[(i+1)%face.length]}>#{a} → #{face[(i+1)%face.length]}</option>)}</select></label>
 <label>最大法线夹角 {angle}°<input aria-label="溶解夹角容差" type="range" min="0" max="30" step="1" className="w-full" value={angle} onChange={e=>setAngle(+e.target.value)}/></label>
 {dissolve?.error&&<p role="alert">{dissolve.error}</p>}<button className={btn+' w-full'} disabled={blocked||!dissolve?.mesh} onClick={()=>{if(dissolve?.mesh)onApply(dissolve.mesh,'共享边溶解完成')}}>应用共享边溶解</button>
 <p className="topo-helptext">保留边界和原顶点，不跨不同颜色的面合并；保护硬边。</p></details>
 <details className="rounded border border-neutral-700 p-2 space-y-2"><summary>相邻顶点合并</summary><p>移除顶点：{selectedVertex===null?'未选中':'#'+selectedVertex}</p>
 <label>保留端点<select aria-label="合并保留顶点" className="w-full bg-neutral-800 p-1" value={keep} onChange={e=>setKeep(e.target.value)}><option value="">请选择</option>{neighbors.map(i=><option key={i} value={i}>#{i}</option>)}</select></label>
 {merge?.error&&<p role="alert">{merge.error}</p>}<button className={btn+' w-full'} disabled={blocked||!merge?.mesh} onClick={()=>{if(merge?.mesh)onApply(merge.mesh,'相邻顶点合并完成')}}>应用顶点合并</button><p className="topo-helptext">保留指定端点的坐标；删除退化面并重新编号。操作可撤销。</p></details>
 </section>;
}
