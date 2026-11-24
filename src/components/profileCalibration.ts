import type {ControlMesh} from '../types';
export type Axis=0|1|2;
export type ProfileOptions={along:Axis;depth:Axis;start:number;end:number;points:number[];bulge:number;strength:number;mode:'fit'|'raise'|'lower';mirrorX:boolean};
export type ProfileChange={id:number;t:number;before:number;chord:number;target:number;after:number};
export function calibrateProfile(mesh:ControlMesh,o:ProfileOptions){
 const {along,depth,start,end,points,bulge,strength,mode,mirrorX}=o;
 if(along===depth||![0,1,2].includes(along)||![0,1,2].includes(depth))throw Error('横向轴与深度轴必须不同');
 if(!Number.isFinite(bulge)||!Number.isFinite(strength)||strength<0||strength>1)throw Error('无效弧度或强度');
 const a=mesh.vertices[start],b=mesh.vertices[end],ids=[...new Set(points)];
 if(!a||!b||start===end||!ids.length||ids.some(id=>!Number.isInteger(id)||!mesh.vertices[id]||id===start||id===end))throw Error('请选择两个不同基准点和内部控制点');
 const span=b[along]-a[along];if(Math.abs(span)<1e-8)throw Error('基准点在横向轴上重合');
 const changes:ProfileChange[]=[];const vertices=mesh.vertices.map(v=>[...v] as typeof v);
 const fixed=new Set([start,end]);
 if(mirrorX&&depth===0)throw Error('X镜像时请使用Y或Z深度轴');
 const mirror=(id:number)=>{const p=mesh.vertices[id];return mesh.vertices.findIndex(v=>Math.hypot(v[0]+p[0],v[1]-p[1],v[2]-p[2])<1e-5)};
 if(mirrorX){for(const id of [start,end]){const m=mirror(id);if(m<0)throw Error('基准点缺少镜像对应点');fixed.add(m)}}
 const proposed=new Map<number,ProfileChange>();
 for(const id of ids){
  const v=mesh.vertices[id],t=(v[along]-a[along])/span;
  if(t<=0||t>=1)throw Error('控制点必须在基准点之间，不允许外推');
  const chord=a[depth]+(b[depth]-a[depth])*t,target=chord+4*bulge*t*(1-t),before=v[depth];
  const desired=mode==='raise'?Math.max(before,target):mode==='lower'?Math.min(before,target):target;
  const after=before+(desired-before)*strength;
  const put=(i:number)=>{if(fixed.has(i))throw Error('不能修改基准点');const old=proposed.get(i);if(old&&Math.abs(old.after-after)>1e-7)throw Error('镜像目标冲突');proposed.set(i,{id:i,t,before:mesh.vertices[i][depth],chord,target,after})};
  put(id);if(mirrorX){const m=mirror(id);if(m<0)throw Error('控制点缺少镜像对应点');if(m!==id)put(m)}
 }
 for(const c of proposed.values()){vertices[c.id][depth]=c.after;changes.push(c)}
 // Reject face collapse and normal reversal relative to the source cage.
 const normal=(vs:ControlMesh['vertices'],face:number[])=>{const n=[0,0,0];for(let i=0;i<face.length;i++){const a=vs[face[i]],b=vs[face[(i+1)%face.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1])}return n};
 for(const [i,f] of mesh.faces.entries()){if(!f.some(id=>proposed.has(id)))continue;const n=normal(mesh.vertices,f),q=normal(vertices,f);if(Math.hypot(...q)<1e-9||n.reduce((s,x,j)=>s+x*q[j],0)<=0)throw Error('校准会导致控制面退化或翻转：#'+i)}
 return {mesh:{...mesh,vertices},changes};
}

export type ProfileJob=Omit<ProfileOptions,'strength'|'mode'> & {strength?:number;mode?:ProfileOptions['mode']};
// Explicit cross sections, never infer anatomical regions from a mesh.
// All proposals are evaluated against the original mesh, not sequentially.
export function calibrateProfiles(mesh:ControlMesh,jobs:ProfileJob[]){
 if(!jobs.length||jobs.length>100)throw Error('请选择1–100条截面');
 const vertices=mesh.vertices.map(v=>[...v] as typeof v),fixed=new Set<number>(),edits=new Map<string,{id:number;axis:Axis;after:number}>();
 for(const j of jobs){
  for(const id of [j.start,j.end]){
   fixed.add(id);
   if(j.mirrorX){const p=mesh.vertices[id];if(!p)throw Error('无效基准点');const i=mesh.vertices.findIndex(v=>Math.hypot(v[0]+p[0],v[1]-p[1],v[2]-p[2])<1e-5);if(i>=0)fixed.add(i);}
  }
  const r=calibrateProfile(mesh,{...j,strength:j.strength??1,mode:j.mode??'fit'});
  for(const c of r.changes){const key=c.id+':'+j.depth,old=edits.get(key);if(old&&Math.abs(old.after-c.after)>1e-7)throw Error('截面交叉处目标冲突：#'+c.id);edits.set(key,{id:c.id,axis:j.depth,after:c.after});}
 }
 for(const e of edits.values()){if(fixed.has(e.id)&&Math.abs(vertices[e.id][e.axis]-e.after)>1e-8)throw Error('其他截面的固定点不能移动：#'+e.id);vertices[e.id][e.axis]=e.after;}
 const normal=(vs:ControlMesh['vertices'],face:number[])=>{let n=[0,0,0];for(let i=0;i<face.length;i++){const a=vs[face[i]],b=vs[face[(i+1)%face.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}return n;};
 for(const [i,f] of mesh.faces.entries()){const a=normal(mesh.vertices,f),b=normal(vertices,f);if(Math.hypot(...b)<1e-9||a.reduce((s,x,j)=>s+x*b[j],0)<=0)throw Error('联合校准导致退化或反转：#'+i);}
 return {mesh:{...mesh,vertices},changes:[...edits.values()]};
}
// Candidate scan on an explicitly chosen cross section. Report signed deficit
// relative to a user-defined target, not a claim about the intended shape.
export function scanProfile(mesh:ControlMesh,o:Omit<ProfileOptions,'points'|'strength'|'mode'|'mirrorX'>,band:number,threshold:number){
 const a=mesh.vertices[o.start],b=mesh.vertices[o.end];if(!a||!b||o.along===o.depth||!Number.isFinite(band)||band<0||!Number.isFinite(threshold)||threshold<0)throw Error('无效扫描参数');
 const span=b[o.along]-a[o.along],other=([0,1,2] as Axis[]).find(x=>x!==o.along&&x!==o.depth)!;
 if(Math.abs(span)<1e-8)throw Error('基准点横向重合');
 // Only scan a connected component of the chosen slab, starting at the anchor.
 const candidates=new Map<number,{id:number;t:number;delta:number}>();
 for(const [id,v] of mesh.vertices.entries()){const t=(v[o.along]-a[o.along])/span;if(t<0||t>1)continue;const q=a[other]+(b[other]-a[other])*t;if(Math.abs(v[other]-q)>band)continue;const target=a[o.depth]+(b[o.depth]-a[o.depth])*t+4*o.bulge*t*(1-t);candidates.set(id,{id,t,delta:target-v[o.depth]});}
 const adjacency=new Map<number,Set<number>>();for(const f of mesh.faces)f.forEach((id,i)=>{const j=f[(i+1)%f.length];if(!candidates.has(id)||!candidates.has(j))return;if(!adjacency.has(id))adjacency.set(id,new Set());if(!adjacency.has(j))adjacency.set(j,new Set());adjacency.get(id)!.add(j);adjacency.get(j)!.add(id);});
 const visited=new Set([o.start]),todo=[o.start];while(todo.length){for(const id of adjacency.get(todo.pop()!)??[]){if(!visited.has(id)){visited.add(id);todo.push(id);}}}
 if(!visited.has(o.end))throw Error('截面带宽内未找到连通路径，请调整带宽或手动选择');
 return [...candidates.values()].filter(c=>visited.has(c.id)&&c.t>0&&c.t<1&&Math.abs(c.delta)>threshold).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
