import React,{useState} from 'react';
import type {ControlMesh} from '../types';
import {regionDimensions,landmarkMeasurement} from './regionInspection';
export function RegionProportionPanel({mesh,faces,baseline,onCapture,onClear}:{mesh:ControlMesh;faces:number[];baseline?:ControlMesh;onCapture:()=>void;onClear:()=>void}){
 const [a,setA]=useState(''),[b,setB]=useState('');
 const dims=regionDimensions(mesh,faces),prev=baseline?regionDimensions(baseline,faces):null;
 const pair=a.trim()!==''&&b.trim()!==''?landmarkMeasurement(mesh,+a,+b):null,prior=baseline&&pair?landmarkMeasurement(baseline,+a,+b):null;
 return <details className="w-full border-t border-neutral-600 pt-2" open><summary className="cursor-pointer">局部比例与修形对照</summary>
 <div className="flex gap-2 flex-wrap my-2"><button className="topo-button border px-2 py-1" onClick={onCapture}>保存修形前基线</button><button className="topo-button border px-2 py-1" onClick={onClear} disabled={!baseline}>清除基线</button><span aria-live="polite">{baseline?'已保存同拓扑基线':'尚未保存基线'}</span></div>
 {dims&&<table className="w-full text-xs" aria-label="区域尺寸比例"><thead><tr><th>方向</th><th>区域尺寸</th><th>全模型占比</th><th>相对基线变化</th></tr></thead><tbody>{['X 宽度','Y 高度','Z 深度'].map((label,k)=><tr key={k}><td>{label}</td><td>{dims.size[k].toFixed(4)}</td><td>{dims.ratios[k]===null?'—':(dims.ratios[k]!*100).toFixed(1)+'%'}</td><td>{prev?(dims.size[k]-prev.size[k]).toFixed(4):'—'}</td></tr>)}</tbody></table>}
 <div className="flex flex-wrap gap-1 my-2"><label>标志点 A <input type="number" aria-label="测量顶点 A" min="0" max={mesh.vertices.length-1} value={a} onChange={e=>setA(e.target.value)} className="w-16 bg-neutral-800"/></label><label>B <input type="number" aria-label="测量顶点 B" min="0" max={mesh.vertices.length-1} value={b} onChange={e=>setB(e.target.value)} className="w-16 bg-neutral-800"/></label></div>
 {pair&&<div aria-label="标志点距离">距离 {pair.distance.toFixed(4)} · ΔXYZ {pair.delta.map(v=>v.toFixed(4)).join(' / ')}{prior&&' · 距离变化 '+(pair.distance-prior.distance).toFixed(4)}</div>}
 <p className="text-neutral-400">尺寸以模型单位计；轴向包围盒占比仅为几何指标，人体比例仍需结合标志点与参考图。</p></details>
}
