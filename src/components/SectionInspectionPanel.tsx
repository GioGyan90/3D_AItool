import React,{useMemo} from 'react';
import type {ControlMesh} from '../types';
import {triangulateFaces} from './traceGeometry';
import {defaultSection,partitionRegionTriangles,sectionPlane,sectionSegments,alignedSectionProfiles,type RegionInspection,type SectionSettings} from './regionInspection';
export function SectionInspectionPanel({mesh,inspection,onChange,optimized,mirror,baseline}:{mesh:ControlMesh;inspection:RegionInspection;onChange:(s:SectionSettings|undefined)=>void;optimized:boolean;mirror:boolean;baseline?:ControlMesh}){
 const s=inspection.section;
 const report=useMemo(()=>{
  if(!s)return null;
  try{const {target}=partitionRegionTriangles(mesh,triangulateFaces(mesh.vertices,mesh.faces,optimized,mirror),inspection.faces);
   const plane=sectionPlane(mesh,inspection.faces,s);if(!plane)return null;
   const segments=sectionSegments(mesh.vertices,target,plane.normal,plane.offset);
   const previous=baseline?sectionSegments(baseline.vertices,partitionRegionTriangles(baseline,triangulateFaces(baseline.vertices,baseline.faces,optimized,mirror),inspection.faces).target,plane.normal,plane.offset):[];
   const samples=[.2,.35,.5,.65,.8].map(position=>{const p=sectionPlane(mesh,inspection.faces,{...s,position})!;const lines=sectionSegments(mesh.vertices,target,p.normal,p.offset);return {position,count:lines.length,length:lines.reduce((sum,[a,b])=>sum+Math.hypot(...a.map((x,i)=>x-b[i])),0)}});
   const aligned=alignedSectionProfiles(segments,previous,plane.normal);
   return {plane,segments,samples,lines:aligned.now,previous:aligned.before,scale:aligned.scale};
  }catch{return null}
 },[mesh,inspection.faces,s,optimized,mirror,baseline]);
 const update=(patch:Partial<SectionSettings>)=>{if(s)onChange({...s,...patch})};
 return <div className="w-full border-t border-neutral-600 pt-2 space-y-2">
  <label><input type="checkbox" checked={!!s} onChange={e=>onChange(e.target.checked?{...defaultSection}:undefined)}/> 局部剖切分析</label>
  {s&&<>
   <div className="flex flex-wrap gap-1">
   {([['横截面',0,90],['矢状面',90,0],['冠状面',0,0]] as const).map(([name,azimuth,elevation])=><button key={name} className="topo-button border px-2 py-1" onClick={()=>update({azimuth,elevation})}>{name}</button>)}
   </div>
   <label>方位角 {s.azimuth}° <input aria-label="剖切方位角" type="range" min="-180" max="180" step="5" value={s.azimuth} onChange={e=>update({azimuth:+e.target.value})}/></label>
   <label>仰角 {s.elevation}° <input aria-label="剖切仰角" type="range" min="-90" max="90" step="5" value={s.elevation} onChange={e=>update({elevation:+e.target.value})}/></label>
   <label>截面位置 {Math.round(s.position*100)}% <input aria-label="剖切位置" type="range" min="0" max="1" step=".01" value={s.position} onChange={e=>update({position:+e.target.value})}/></label>
   <div className="flex gap-3"><label><input type="checkbox" checked={s.clip} onChange={e=>update({clip:e.target.checked})}/> 隐藏截面一侧</label><label><input type="checkbox" checked={s.reverse} onChange={e=>update({reverse:e.target.checked})}/> 反向剖切</label></div>
   {report?<><svg role="img" aria-label="局部截面轮廓" viewBox="0 0 300 120" className="w-full max-h-32 bg-neutral-900 rounded">
     {report.previous.map(([a,b],i)=><line key={'before'+i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#75d5ff" strokeWidth="1.5" strokeDasharray="4 2"/>)}
     {report.lines.map(([a,b],i)=><line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#ffdf56" strokeWidth="1.8"/>)}
   </svg><p>平面偏移 {report.plane.offset.toFixed(3)} · {report.segments.length} 段交线 · {report.scale.toFixed(1)} SVG 单位 / 模型单位{baseline?'（蓝虚线：基线；黄实线：当前；同一世界截面、统一比例）':'（自动缩放）'}</p>
   <div className="grid grid-cols-5 gap-1" aria-label="连续截面采样">{report.samples.map(p=><div key={p.position} className="rounded bg-neutral-900 p-1 text-center">{Math.round(p.position*100)}%<br/>{p.length.toFixed(3)}</div>)}</div>
   <p className="text-neutral-400">采样值为截面线段总长，不代表曲率；完全共面三角形不重复计入。</p></>:<p role="alert">无法取得有效三角化截面。</p>}
  </>}
 </div>
}
