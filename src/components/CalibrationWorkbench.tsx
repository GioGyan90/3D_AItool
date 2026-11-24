import React,{useState,useRef} from 'react';
import {projectLandmark,fitLandmark,landmarkError,type Vec3,type Landmark,type CalibrationView,type ImageCalibration} from './referenceCalibration';
import type {ControlMesh} from '../types';
type Props={mesh:ControlMesh;selected:number|null;onSelect:(id:number)=>void;onFit:(id:number,v:Vec3)=>void};
type Ref={url:string;aspect:number;cal:ImageCalibration};
const initial=():Ref=>({url:'',aspect:1,cal:{cx:500,cy:500,scale:250,flip:false,rotation:0}});
const button='topo-button rounded border px-2 py-1 text-xs';
export function CalibrationWorkbench({mesh,selected,onSelect,onFit}:Props){
 const [refs,setRefs]=useState<Record<CalibrationView,Ref>>({front:initial(),side:initial()});
 const [targets,setTargets]=useState<Record<number,Landmark>>({});
 const [mark,setMark]=useState(false),[linked,setLinked]=useState(true),[opacity,setOpacity]=useState(.65),[error,setError]=useState('');
 const [showVertices,setShowVertices]=useState(true);
 const sequence=useRef({front:0,side:0});
 const target=selected===null?undefined:targets[selected];
 const current=selected===null?undefined:mesh.vertices[selected];
 const update=(view:CalibrationView,patch:Partial<ImageCalibration>)=>setRefs(old=>{
   const next={...old,[view]:{...old[view],cal:{...old[view].cal,...patch}}};
   if(linked){const other=view==='front'?'side':'front';const shared:Partial<ImageCalibration>={};if(patch.scale!==undefined)shared.scale=patch.scale;if(patch.cy!==undefined)shared.cy=patch.cy;next[other]={...old[other],cal:{...old[other].cal,...shared}};}return next;
 });
 const load=async(view:CalibrationView,file?:File)=>{
  if(!file)return;const token=++sequence.current[view];setError('');
  try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('仅支持5 MB以内 PNG/JPEG/WebP');
   const url=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('读取失败'));r.readAsDataURL(file)});
   const aspect=await new Promise<number>((resolve,reject)=>{const im=new Image();im.onload=()=>im.naturalWidth>8192||im.naturalHeight>8192||im.naturalWidth*im.naturalHeight>16000000?reject(Error('图片尺寸过大')):resolve(im.naturalWidth/im.naturalHeight);im.onerror=()=>reject(Error('图片无法解码'));im.src=url});
   if(token!==sequence.current[view])return;
   setRefs(old=>({...old,[view]:{...old[view],url,aspect}}));
   setTargets(old=>Object.fromEntries(Object.entries(old).map(([id,t])=>[id,{...t,[view]:undefined}])));
  }catch(e){setError(String(e))}
 };
 const edges=[...new Map(mesh.faces.flatMap(f=>f.map((a,i)=>{const b=f[(i+1)%f.length];return [a<b?a+':'+b:b+':'+a,[a,b]] as [string,number[]]}))).values()];
 const apply=()=>{if(!current||!target||selected===null)return;try{onFit(selected,fitLandmark(current,target,refs.front.cal,refs.side.cal));setError('')}catch(e){setError(String(e))}};
 const exportReport=()=>{const landmarks=Object.values(targets).filter(t=>mesh.vertices[t.vertex]).map(t=>({ ...t,position:mesh.vertices[t.vertex],errors:Object.fromEntries((['front','side'] as const).filter(v=>t[v]).map(v=>[v,landmarkError(mesh.vertices[t.vertex],t[v]!,v,refs[v].cal)]))}));const report={version:1,vertices:mesh.vertices,faces:mesh.faces,calibration:{front:refs.front.cal,side:refs.side.cal},landmarks};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='calibration-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <section className="space-y-2" aria-label="正侧双视图校准">
  <div className="flex flex-wrap gap-2 items-center"><label><input type="checkbox" checked={linked} onChange={e=>{setLinked(e.target.checked);if(e.target.checked)setRefs(old=>({...old,side:{...old.side,cal:{...old.side.cal,cy:old.front.cal.cy,scale:old.front.cal.scale}}}))}}/> 锁定共同高度与比例</label><label><input type="checkbox" checked={showVertices} onChange={e=>setShowVertices(e.target.checked)}/> 顶点</label><label>图片透明度 <input aria-label="校准图片透明度" type="range" min="0" max="1" step=".05" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label></div>
  <div className="flex flex-wrap items-center gap-2"><label>联动顶点 <input aria-label="校准顶点编号" type="number" min="0" max={mesh.vertices.length-1} value={selected??''} className="w-20 bg-neutral-800 p-1" onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&mesh.vertices[n])onSelect(n)}}/></label><button className={button} aria-pressed={mark} onClick={()=>setMark(v=>!v)} disabled={selected===null}>{mark?'退出标记':'标记目标位置'}</button><button className={button} disabled={!target||(!target.front&&!target.side)} onClick={apply}>按目标校准顶点</button><button className={button} disabled={selected===null} onClick={()=>{if(selected!==null)setTargets(old=>{const n={...old};delete n[selected];return n})}}>清除当前目标</button><button className={button} onClick={exportReport}>导出误差报告</button></div>
  <p className="text-xs text-neutral-400">正面横轴为 X，侧面横轴为 Z（鼻朝右）。标定参数作用于网格投影而非改变网格；目标高度不一致时拒绝拟合。目标误差单位为画板像素（1000×1000），不是原图像素。</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{(['front','side'] as const).map(view=>{
   const ref=refs[view],c=ref.cal,points=mesh.vertices.map(v=>projectLandmark(v,view,c)),label=view==='front'?'正面':'侧面',goal=target?.[view],q=selected===null?undefined:points[selected],err=current&&goal?landmarkError(current,goal,view,c):null;
   return <div key={view} className="min-w-0 rounded border border-neutral-700 p-2 space-y-1">
    <div className="flex flex-wrap gap-2 items-center"><strong>{label}</strong><label className={button+' cursor-pointer'}>上传{label}图<input aria-label={'上传校准'+label+'图'} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void load(view,e.target.files?.[0]);e.target.value=''}}/></label><label><input type="checkbox" checked={c.flip} onChange={e=>update(view,{flip:e.target.checked})}/> 翻转投影</label></div>
    <div className="grid grid-cols-4 gap-1">{(['cx','cy','scale','rotation'] as const).map((key,i)=><label key={key} className="text-xs">{['中心X','中心Y','比例','角度'][i]}<input aria-label={label+'校准'+key} type="number" step={key==='rotation'?1:5} value={c[key]} className="w-full bg-neutral-800 p-1" onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&(key!=='scale'||n>0))update(view,{[key]:n})}}/></label>)}</div>
    <svg viewBox="0 0 1000 1000" className="block w-full bg-neutral-900 touch-none" aria-label={label+'校准画板'} onPointerDown={e=>{
     const svg=e.currentTarget,p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const pt=p.matrixTransform(svg.getScreenCTM()!.inverse());
     if(mark&&selected!==null){setTargets(old=>({...old,[selected]:{...old[selected],vertex:selected,[view]:[pt.x,pt.y]}}));return}
     let best=-1,dist=22;points.forEach((p,i)=>{const d=Math.hypot(p[0]-pt.x,p[1]-pt.y);if(d<dist){best=i;dist=d}});if(best>=0)onSelect(best);
    }}>
     {ref.url&&<image href={ref.url} x={ref.aspect>=1?0:(1000-1000*ref.aspect)/2} y={ref.aspect<=1?0:(1000-1000/ref.aspect)/2} width={ref.aspect>=1?1000:1000*ref.aspect} height={ref.aspect<=1?1000:1000/ref.aspect} opacity={opacity}/>}
     <path d={'M0 '+c.cy+' H1000 M'+c.cx+' 0 V1000'} stroke="#7c8b98" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none"/>
     {edges.map(([a,b])=><line key={a+':'+b} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} stroke="#ffae54" strokeWidth="2.5" pointerEvents="none"/>)}
     {showVertices&&points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===selected?9:4} fill={i===selected?'#ffffff':'#62caff'} pointerEvents="none"/>)}
     {q&&<text x={q[0]+12} y={q[1]-12} fontSize="20" fill="#fff" pointerEvents="none">#{selected}</text>}
     {goal&&q&&<g pointerEvents="none"><line x1={q[0]} y1={q[1]} x2={goal[0]} y2={goal[1]} stroke="#ff6262" strokeWidth="4"/><circle cx={goal[0]} cy={goal[1]} r="9" fill="none" stroke="#ff6262" strokeWidth="3"/></g>}
    </svg><p className="text-xs">{err?'偏差 '+err.pixels.toFixed(2)+' px · ΔX '+err.dx.toFixed(2)+' · ΔY '+err.dy.toFixed(2):'选择顶点后标记参考目标'}</p>
   </div>
  })}</div>
 </section>
}
