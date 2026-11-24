import React,{useState,useMemo,useEffect} from 'react';
import type {ControlMesh} from '../types';
import {calibrateProfile,type Axis,type ProfileOptions} from './profileCalibration';
type Props={mesh:ControlMesh;selected:number|null;disabled:boolean;onApply:(mesh:ControlMesh)=>void};
const btn='topo-button rounded border px-2 py-1 text-xs';
export function ProfileCalibrationPanel({mesh,selected,disabled,onApply}:Props){
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[points,setPoints]=useState('');
 const [along,setAlong]=useState<Axis>(0),[depth,setDepth]=useState<Axis>(2),[bulge,setBulge]=useState(.04),[strength,setStrength]=useState(1),[mode,setMode]=useState<ProfileOptions['mode']>('fit'),[mirrorX,setMirrorX]=useState(true);
 const key=JSON.stringify(mesh.faces);
 useEffect(()=>{setStart('');setEnd('');setPoints('')},[key]);
 const preview=useMemo(()=>{try{
  if(!start.trim()||!end.trim()||!points.trim())return {result:null,error:''};
  const tokens=points.trim().split(/[\s,，]+/);if(![start,end,...tokens].every(s=>/^\d+$/.test(s)))throw Error('编号必须为非负整数');
  return {result:calibrateProfile(mesh,{start:Number(start),end:Number(end),points:tokens.map(Number),along,depth,bulge,strength,mode,mirrorX}),error:''};
 }catch(e){return {result:null,error:String(e)}}},[mesh,start,end,points,along,depth,bulge,strength,mode,mirrorX]);
 const result=preview.result;
 const add=()=>{if(selected!==null)setPoints(old=>[...new Set([...old.split(/[\s,，]+/).filter(Boolean),String(selected)])].join(','))};
 const axes=['X','Y','Z'];
 const a=mesh.vertices[Number(start)],b=mesh.vertices[Number(end)];
 const samples=result&&a&&b?Array.from({length:41},(_,i)=>{let t=i/40;return [a[along]+(b[along]-a[along])*t,a[depth]+(b[depth]-a[depth])*t+4*bulge*t*(1-t)]}):[];
 const before=result?.changes.map(c=>[mesh.vertices[c.id][along],c.before])??[],after=result?.changes.map(c=>[mesh.vertices[c.id][along],c.after])??[];
 const all=[...samples,...before,...after],xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const px=(x:number)=>16+208*(x-xmin)/Math.max(1e-6,xmax-xmin),py=(y:number)=>112-96*(y-ymin)/Math.max(1e-6,ymax-ymin);
 return <details className="rounded-lg border border-neutral-700 p-2 text-xs">
  <summary className="cursor-pointer font-medium text-slate-200">局部曲面校准 · 截面</summary>
  <div className="space-y-2 mt-2">
   <p className="topo-helptext">选两个固定基准点及中间控制点。沿横向轴计算位置，仅修改深度轴；正弧度向深度正方向凸起，负弧度凹下。适合单条截面，不是完整曲面拟合。镜像点必须已经存在。</p>
   <div className="grid grid-cols-2 gap-2">{([['横向轴',along,setAlong],['深度轴',depth,setDepth]] as const).map(([label,v,set])=><label key={label}>{label}<select aria-label={label} className="w-full" value={v} onChange={e=>set(Number(e.target.value) as Axis)}>{axes.map((s,i)=><option key={s} value={i}>{s}</option>)}</select></label>)}</div>
   {([['起点',start,setStart],['终点',end,setEnd]] as const).map(([label,v,set])=><div key={label} className="flex gap-1 items-center"><label className="flex-1 min-w-0">{label}编号<input aria-label={'截面'+label+'编号'} type="text" inputMode="numeric" value={v} onChange={e=>set(e.target.value)} className="w-full"/></label><button className={btn} disabled={selected===null} onClick={()=>selected!==null&&set(String(selected))}>使用选中点</button></div>)}
   <label className="block">中间点编号（逗号分隔）<input aria-label="截面中间点编号" className="w-full" value={points} onChange={e=>setPoints(e.target.value)}/></label><button className={btn} disabled={selected===null} onClick={add}>追加选中点</button>
   <div className="grid grid-cols-2 gap-2"><label>截面弧度<input aria-label="截面弧度" type="number" step=".01" className="w-full" value={bulge} onChange={e=>setBulge(e.target.valueAsNumber)}/></label><label>校准方向<select aria-label="截面校准方向" value={mode} onChange={e=>setMode(e.target.value as ProfileOptions['mode'])} className="w-full"><option value="fit">贴合目标</option><option value="raise">仅向正方向修复</option><option value="lower">仅向负方向修复</option></select></label></div>
   <label>强度 {Math.round(strength*100)}%<input aria-label="截面校准强度" type="range" min="0" max="1" step=".05" value={strength} onChange={e=>setStrength(+e.target.value)} className="w-full"/></label>
   <label className="flex gap-2"><input type="checkbox" checked={mirrorX} onChange={e=>setMirrorX(e.target.checked)}/> 同时修正X镜像点</label>
   {preview.error&&<p role="alert" className="text-amber-300">{preview.error}</p>}
   {result&&<><svg viewBox="0 0 240 128" className="w-full bg-neutral-950 rounded" aria-label="截面校准预览"><polyline points={samples.map(p=>px(p[0])+','+py(p[1])).join(' ')} fill="none" stroke="#85d3a1" strokeWidth="1.5" strokeDasharray="4 3"/>{result.changes.map((c,i)=><g key={c.id}><line x1={px(before[i][0])} x2={px(after[i][0])} y1={py(before[i][1])} y2={py(after[i][1])} stroke="#93a5b6"/><circle cx={px(before[i][0])} cy={py(before[i][1])} r="3" fill="#fb9275"/><circle cx={px(after[i][0])} cy={py(after[i][1])} r="3" fill="#85d3a1"/></g>)}</svg><p>橙：原位置 · 绿：修正位置 · 虚线：目标截面</p><div className="max-h-32 overflow-auto">{result.changes.map(c=><div key={c.id}>#{c.id} {axes[depth]}：{c.before.toFixed(4)} → {c.after.toFixed(4)}（Δ {(c.after-c.before).toFixed(4)}）</div>)}</div></>}
   <button className={btn+' w-full'} disabled={disabled||!result} onClick={()=>result&&onApply(result.mesh)}>应用截面校准</button>
  </div>
 </details>
}
