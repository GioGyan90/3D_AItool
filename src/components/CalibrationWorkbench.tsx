import React,{useState,useRef,useMemo} from 'react';
import {projectionResiduals,residualColor,projectLandmark,fitLandmark,landmarkError,calibrateAnchors,edgeResidual,facingEdges,type Vec3,type CalibrationView,type ImageCalibration,type CalibrationSession} from './referenceCalibration';
import type {ControlMesh} from '../types';
type Props={mesh:ControlMesh;selected:number|null;onSelect:(id:number)=>void;onFit:(id:number,v:Vec3)=>void;session:CalibrationSession;setSession:React.Dispatch<React.SetStateAction<CalibrationSession>>};
const button='topo-button rounded border px-2 py-1 text-xs';
export function CalibrationWorkbench({mesh,selected,onSelect,onFit,session,setSession}:Props){
 const {refs,targets,anchors,linked}=session;
 const field=<K extends keyof CalibrationSession,>(key:K,action:React.SetStateAction<CalibrationSession[K]>)=>setSession(old=>({...old,[key]:typeof action==='function'?(action as (v:CalibrationSession[K])=>CalibrationSession[K])(old[key]):action}));
 const setRefs=(a:React.SetStateAction<CalibrationSession['refs']>)=>field('refs',a);
 const setTargets=(a:React.SetStateAction<CalibrationSession['targets']>)=>field('targets',a);
 const setAnchors=(a:React.SetStateAction<CalibrationSession['anchors']>)=>field('anchors',a);
 const setLinked=(a:boolean)=>field('linked',a);
 const [mark,setMark]=useState(false),[opacity,setOpacity]=useState(.65),[error,setError]=useState('');
 const [showVertices,setShowVertices]=useState(true);
 const [showResiduals,setShowResiduals]=useState(true),[residualThreshold,setResidualThreshold]=useState(5);
 const [showHidden,setShowHidden]=useState(false),[showTargets,setShowTargets]=useState(true),[zoom,setZoom]=useState(1);
 const [anchorMode,setAnchorMode]=useState(false);
 const solve=(view:CalibrationView)=>{
  try{
   const c=calibrateAnchors(mesh.vertices,view,Object.entries(anchors[view]).map(([vertex,pixel])=>({vertex:Number(vertex),pixel})),refs[view].cal.flip);
   // Independent image crops need independent origins and scales; shared world Y is enforced by fitting.
   setLinked(false);setRefs(old=>({...old,[view]:{...old[view],cal:c}}));setError('');
  }catch(e){setError(String(e))}
 };
 const facing=useMemo(()=>({front:facingEdges(mesh.vertices,mesh.faces,'front'),side:facingEdges(mesh.vertices,mesh.faces,'side')}),[mesh]);
 const targetEdges=(view:CalibrationView)=>edges.flatMap(([a,b])=>{
  const pa=targets[a]?.[view],pb=targets[b]?.[view];
  return pa&&pb?[{a,b,pa,pb,...edgeResidual(mesh.vertices[a],mesh.vertices[b],pa,pb,view,refs[view].cal)}]:[];
 });

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
   setTargets(old=>Object.fromEntries(Object.entries(old).map(([id,t])=>[id,{...t,[view]:undefined}])));setAnchors(old=>({...old,[view]:{}}));
  }catch(e){setError(String(e))}
 };
 const edges=[...new Map(mesh.faces.flatMap(f=>f.map((a,i)=>{const b=f[(i+1)%f.length];return [a<b?a+':'+b:b+':'+a,[a,b]] as [string,number[]]}))).values()];
 const apply=()=>{if(!current||!target||selected===null)return;try{onFit(selected,fitLandmark(current,target,refs.front.cal,refs.side.cal));setError('')}catch(e){setError(String(e))}};
 const exportReport=()=>{const landmarks=Object.values(targets).filter(t=>mesh.vertices[t.vertex]).map(t=>({ ...t,position:mesh.vertices[t.vertex],errors:Object.fromEntries((['front','side'] as const).filter(v=>t[v]).map(v=>[v,landmarkError(mesh.vertices[t.vertex],t[v]!,v,refs[v].cal)]))}));const report={version:2,vertices:mesh.vertices,faces:mesh.faces,calibration:{front:refs.front.cal,side:refs.side.cal},landmarks,anchors,edgeErrors:{front:targetEdges('front'),side:targetEdges('side')}};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='calibration-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <section className="space-y-2" aria-label="正侧双视图校准">
  <div className="flex flex-wrap gap-2 items-center"><label><input type="checkbox" checked={linked} onChange={e=>{setLinked(e.target.checked);if(e.target.checked)setRefs(old=>({...old,side:{...old.side,cal:{...old.side.cal,cy:old.front.cal.cy,scale:old.front.cal.scale}}}))}}/> 锁定共同高度与比例</label><label><input type="checkbox" checked={showVertices} onChange={e=>setShowVertices(e.target.checked)}/> 顶点</label><label>图片透明度 <input aria-label="校准图片透明度" type="range" min="0" max="1" step=".05" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label></div>
  <div className="flex flex-wrap items-center gap-2"><label>联动顶点 <input aria-label="校准顶点编号" type="number" min="0" max={mesh.vertices.length-1} value={selected??''} className="w-20 bg-neutral-800 p-1" onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&mesh.vertices[n])onSelect(n)}}/></label><button className={button} aria-pressed={mark} onClick={()=>{setMark(v=>!v);setAnchorMode(false)}} disabled={selected===null}>{mark?'退出标记':'标记目标位置'}</button><button className={button} disabled={!target||(!target.front&&!target.side)} onClick={apply}>按目标校准顶点</button><button className={button} disabled={selected===null} onClick={()=>{if(selected!==null)setTargets(old=>{const n={...old};delete n[selected];return n})}}>清除当前目标</button><button className={button} onClick={exportReport}>导出误差报告</button></div>
  <div className="flex flex-wrap gap-2 items-center">
  <button className={button} aria-pressed={anchorMode} onClick={()=>{setAnchorMode(v=>!v);setMark(false)}} disabled={selected===null}>{anchorMode?'退出基准点标记':'标记固定基准点'}</button>
  <label><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/> 显示背向边</label>
  <label><input type="checkbox" checked={showTargets} onChange={e=>setShowTargets(e.target.checked)}/> 目标线</label>
  <label><input type="checkbox" checked={showResiduals} onChange={e=>setShowResiduals(e.target.checked)}/> 全局投影误差图</label>
  <label>误差容差 (px) <input aria-label="投影误差容差" type="number" min="0.1" max="1000" step="1" value={residualThreshold} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=.1&&n<=1000)setResidualThreshold(n)}} className="w-16 bg-neutral-800 p-1"/></label>
  <label>局部放大 <input aria-label="校准局部放大" type="range" min="1" max="4" step=".25" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
  </div><p className="text-xs text-neutral-400">先选已认可的基准顶点，标记其原图位置，每个视图至少两个点后自动求解比例、旋转和中心。建议三至六个分散的基准点；不要用待修正的鼻部当基准。背向边过滤不是完整遮挡检测。</p>
  <p className="text-xs text-neutral-400">正面横轴为 X，侧面横轴为 Z（鼻朝右）。标定参数作用于网格投影而非改变网格；目标高度不一致时拒绝拟合。目标误差单位为画板像素（1000×1000），不是原图像素。</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{(['front','side'] as const).map(view=>{
   const ref=refs[view],c=ref.cal,points=mesh.vertices.map(v=>projectLandmark(v,view,c)),label=view==='front'?'正面':'侧面',goal=target?.[view],q=selected===null?undefined:points[selected],err=current&&goal?landmarkError(current,goal,view,c):null;
   const residual=projectionResiduals(mesh.vertices,Object.values(targets),view,c);
   const measured=targetEdges(view),anchorCount=Object.keys(anchors[view]).length,anchorErrors=Object.entries(anchors[view]).map(([id,p])=>mesh.vertices[+id]?landmarkError(mesh.vertices[+id],p,view,c).pixels:0),span=1000/zoom,focus=zoom===1?[500,500]:(q??[500,500]);
   return <div key={view} className="min-w-0 rounded border border-neutral-700 p-2 space-y-1">
    <div className="flex flex-wrap gap-2 items-center"><strong>{label}</strong><label className={button+' cursor-pointer'}>上传{label}图<input aria-label={'上传校准'+label+'图'} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void load(view,e.target.files?.[0]);e.target.value=''}}/></label><label><input type="checkbox" checked={c.flip} onChange={e=>update(view,{flip:e.target.checked})}/> 翻转投影</label></div>
    <div className="flex flex-wrap gap-2 items-center"><button className={button} disabled={anchorCount<2} onClick={()=>solve(view)}>自动标定{label}（{anchorCount}点）</button><button className={button} onClick={()=>setAnchors(old=>({...old,[view]:{}}))}>清除{label}基准</button><span className="text-xs">基准 RMS {anchorCount?Math.sqrt(anchorErrors.reduce((s,n)=>s+n*n,0)/anchorCount).toFixed(2):'—'} px</span></div>
    <div className="grid grid-cols-4 gap-1">{(['cx','cy','scale','rotation'] as const).map((key,i)=><label key={key} className="text-xs">{['中心X','中心Y','比例','角度'][i]}<input aria-label={label+'校准'+key} type="number" step={key==='rotation'?1:5} value={c[key]} className="w-full bg-neutral-800 p-1" onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&(key!=='scale'||n>0))update(view,{[key]:n})}}/></label>)}</div>
    <svg viewBox={`${focus[0]-span/2} ${focus[1]-span/2} ${span} ${span}`} className="block w-full bg-neutral-900 touch-none" aria-label={label+'校准画板'} onPointerDown={e=>{
     const svg=e.currentTarget,p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const pt=p.matrixTransform(svg.getScreenCTM()!.inverse());
     if(anchorMode&&selected!==null){setAnchors(old=>({...old,[view]:{...old[view],[selected]:[pt.x,pt.y]}}));return}
     if(mark&&selected!==null){setTargets(old=>({...old,[selected]:{...old[selected],vertex:selected,[view]:[pt.x,pt.y]}}));return}
     let best=-1,dist=22;points.forEach((p,i)=>{if(!showHidden&&!facing[view].points.has(i)&&i!==selected)return;const d=Math.hypot(p[0]-pt.x,p[1]-pt.y);if(d<dist){best=i;dist=d}});if(best>=0)onSelect(best);
    }}>
     {ref.url&&<image href={ref.url} x={ref.aspect>=1?0:(1000-1000*ref.aspect)/2} y={ref.aspect<=1?0:(1000-1000/ref.aspect)/2} width={ref.aspect>=1?1000:1000*ref.aspect} height={ref.aspect<=1?1000:1000/ref.aspect} opacity={opacity}/>}
     <path d={'M0 '+c.cy+' H1000 M'+c.cx+' 0 V1000'} stroke="#7c8b98" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none"/>
     {edges.filter(([a,b])=>showHidden||facing[view].edges.has(a<b?a+':'+b:b+':'+a)).map(([a,b])=><line key={a+':'+b} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} stroke="#ffae54" strokeWidth="2.5" pointerEvents="none"/>)}
     {showVertices&&points.map(([x,y],i)=>(showHidden||facing[view].points.has(i)||i===selected)&&<circle key={i} cx={x} cy={y} r={i===selected?9:4} fill={i===selected?'#ffffff':'#62caff'} pointerEvents="none"/>)}
     {q&&<text x={q[0]+12} y={q[1]-12} fontSize="20" fill="#fff" pointerEvents="none">#{selected}</text>}
     {Object.entries(anchors[view]).map(([id,p])=><g key={id} pointerEvents="none"><rect x={p[0]-5} y={p[1]-5} width="10" height="10" fill="#7bdc9a"/><text x={p[0]+9} y={p[1]-8} fontSize="15" fill="#7bdc9a">A{id}</text></g>)}
     {showTargets&&measured.map(e=><line key={e.a+':'+e.b} x1={e.pa[0]} y1={e.pa[1]} x2={e.pb[0]} y2={e.pb[1]} stroke="#a7f08d" strokeWidth="3" strokeDasharray="7 4" pointerEvents="none"/>)}
     {showTargets&&Object.entries(targets).map(([id,t])=>t[view]&&<circle key={id} cx={t[view]![0]} cy={t[view]![1]} r="5" fill="none" stroke="#a7f08d" strokeWidth="2" pointerEvents="none"/>)}
     {showResiduals&&residual.rows.map(r=><g key={'residual-'+r.id} pointerEvents="none" data-residual-vertex={r.id}><line x1={r.projected[0]} y1={r.projected[1]} x2={r.target[0]} y2={r.target[1]} stroke={residualColor(r.pixels,residualThreshold)} strokeWidth="3" vectorEffect="non-scaling-stroke"/><circle cx={r.target[0]} cy={r.target[1]} r={6/zoom} fill="none" stroke={residualColor(r.pixels,residualThreshold)} strokeWidth="2" vectorEffect="non-scaling-stroke"/></g>)}
     {!showResiduals&&goal&&q&&<g pointerEvents="none"><line x1={q[0]} y1={q[1]} x2={goal[0]} y2={goal[1]} stroke="#ff6262" strokeWidth="4"/><circle cx={goal[0]} cy={goal[1]} r="9" fill="none" stroke="#ff6262" strokeWidth="3"/></g>}
    </svg>
    {showResiduals&&<section aria-label={label+'全局投影误差'} className="space-y-1"><p>已测目标 {residual.count} / {mesh.vertices.length} · RMS {residual.count?residual.rms.toFixed(2):'—'} px · 最大 {residual.count?residual.max.toFixed(2):'—'} px</p><p className="text-xs"><span style={{color:'#65d995'}}>≤容差</span> / <span style={{color:'#ffcc66'}}>≤2倍容差</span> / <span style={{color:'#ff6666'}}>超2倍容差</span> · 未标记顶点不参与统计</p><div className="max-h-24 overflow-auto">{residual.rows.slice(0,100).map(r=><button key={r.id} className={button+' w-full text-left'} style={{color:residualColor(r.pixels,residualThreshold)}} onClick={()=>onSelect(r.id)}>#{r.id} · {r.pixels.toFixed(2)} px · ΔX {r.dx.toFixed(2)} / ΔY {r.dy.toFixed(2)}</button>)}</div></section>}
    <p className="text-xs">已标定边 {measured.length} · 最大角度偏差 {measured.length?Math.max(...measured.map(e=>e.angleError??0)).toFixed(1)+'°':'—'} · 最大长度偏差 {measured.length?Math.max(...measured.map(e=>Math.abs(e.lengthError))).toFixed(1)+' px':'—'}</p><p className="text-xs">{err?'偏差 '+err.pixels.toFixed(2)+' px · ΔX '+err.dx.toFixed(2)+' · ΔY '+err.dy.toFixed(2):'选择顶点后标记参考目标'}</p>
   </div>
  })}</div>
 </section>
}
