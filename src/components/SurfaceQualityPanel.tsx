import React,{useMemo,useState} from 'react';
import type {ControlMesh} from '../types';
import {surfaceQuality,vertexDisplacement,displacementColors} from './surfaceQuality';
type Props={mesh:ControlMesh;onFace:(id:number)=>void;onVertex:(id:number)=>void;optimized:boolean;onOptimize:(v:boolean)=>void;onColors:(v:string[]|undefined)=>void};
export function SurfaceQualityPanel({mesh,onFace,onVertex,optimized,onOptimize,onColors}:Props){
 const [flat,setFlat]=useState(1),[fold,setFold]=useState(35),[base,setBase]=useState<ControlMesh|null>(null),[error,setError]=useState('');
 const quality=useMemo(()=>surfaceQuality(mesh),[mesh]);
 const comparison=useMemo(()=>{try{return base?{data:vertexDisplacement(base,mesh),error:''}:null}catch(e){return {data:null,error:String(e)}}},[base,mesh]);
 const [heat,setHeat]=useState(false);
 React.useEffect(()=>{onColors(heat&&comparison?.data?displacementColors(comparison.data.values,comparison.data.max):undefined);return()=>onColors(undefined)},[heat,comparison,onColors]);
 const bad=quality.faces.filter(f=>f.degenerate||f.relative!==null&&f.relative*100>=flat).sort((a,b)=>(b.relative??Infinity)-(a.relative??Infinity));
 const edges=quality.edges.filter(e=>e.degrees>=fold).sort((a,b)=>b.degrees-a.degrees);
 const btn='topo-button rounded border px-2 py-1';
 return <section aria-label="曲面质量诊断" className="space-y-3">
 <details open className="rounded border border-neutral-700 p-2">
 <summary>控制面平整度检测</summary>
 <label>相对偏差阈值 (%)<input aria-label="平整度阈值" type="number" min="0" step=".1" value={flat} onChange={e=>setFlat(Math.max(0,Number(e.target.value)))} className="w-full"/></label>
 <p>超阈值或退化面：{bad.length} / {mesh.faces.length}</p>
 <div className="max-h-36 overflow-auto">{bad.slice(0,100).map(f=><button key={f.id} className={btn+' w-full text-left'} onClick={()=>onFace(f.id)}>面 #{f.id} · {f.degenerate?'退化':((f.relative??0)*100).toFixed(2)+'% · 距离 '+f.distance.toFixed(5)}</button>)}</div>
 <p className="topo-helptext">顶点到控制面中心 Newell 平面的最大距离 / 最长边；不是最佳拟合平面。</p>
 </details>
 <details open className="rounded border border-neutral-700 p-2">
 <summary>局部曲率连续性检测</summary>
 <label>相邻面法线夹角阈值 (°)<input aria-label="曲率夹角阈值" type="number" min="0" max="180" value={fold} onChange={e=>setFold(Math.max(0,Math.min(180,Number(e.target.value))))} className="w-full"/></label>
 <p>高转折共享边：{edges.length} / {quality.edges.length}</p>
 <div className="max-h-36 overflow-auto">{edges.slice(0,100).map(e=><button key={e.edge.join(':')} className={btn+' w-full text-left'} onClick={()=>onFace(e.faces[0])}>边 #{e.edge.join('–')} · {e.degrees.toFixed(1)}° · 面 {e.faces.join('/')}</button>)}</div>
 <p className="topo-helptext">法线夹角是曲率突变的代理指标；正常硬边也会被列出。</p>
 </details>
 <details open className="rounded border border-neutral-700 p-2"><summary>三角化对角线优化</summary>
 <label className="flex gap-2"><input type="checkbox" checked={optimized} onChange={e=>onOptimize(e.target.checked)}/>启用四边面优化预览</label>
 <p className="topo-helptext">仅严格凸四边面，比较三角面法线夹角及形状质量；不修改控制网格。仅预览，导出规则保持原样。</p></details>
 <details open className="rounded border border-neutral-700 p-2"><summary>顶点位移热力图</summary>
 <div className="flex flex-wrap gap-1"><button className={btn} onClick={()=>{setBase(JSON.parse(JSON.stringify(mesh)));setError('')}}>记录当前版本为基准</button><label className={btn+' cursor-pointer'}>导入基准 JSON<input aria-label="导入位移基准 JSON" className="hidden" type="file" accept=".json,application/json" onChange={async e=>{const el=e.currentTarget;try{const f=el.files?.[0];if(!f)return;if(f.size>10*1024*1024)throw Error('文件过大');const d=JSON.parse(await f.text());if(!Array.isArray(d.vertices)||d.vertices.some((v:unknown)=>!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))||!Array.isArray(d.faces))throw Error('需要有效控制网格');vertexDisplacement(d,mesh);setBase(d);setError('')}catch(e){setError(String(e))}finally{el.value=''}}}/></label></div>
 {error&&<p role="alert">{error}</p>}{comparison?.error&&<p role="alert">{comparison.error}</p>}
 {comparison?.data&&<><label className="flex gap-2"><input type="checkbox" checked={heat} onChange={e=>setHeat(e.target.checked)}/>显示位移热力图</label><p>移动 {comparison.data.moved} 点 · 最大 {comparison.data.max.toFixed(5)} · RMS {comparison.data.rms.toFixed(5)}</p><div className="h-2 rounded" style={{background:'linear-gradient(to right,#126bff,#00e5a0,#f4ef20,#ff2525)'}}/><p>蓝：零位移 · 红：本次最大位移</p><div className="max-h-32 overflow-auto">{comparison.data.values.map((v,i)=>({v,i})).filter(x=>x.v>1e-8).sort((a,b)=>b.v-a.v).slice(0,100).map(x=><button key={x.i} className={btn+' w-full text-left'} onClick={()=>onVertex(x.i)}>点 #{x.i} · {x.v.toFixed(5)}</button>)}</div></>}
 <p className="topo-helptext">仅比较编号与面连接相同的版本；基准保留至检查面板卸载。</p></details>
 </section>
}
