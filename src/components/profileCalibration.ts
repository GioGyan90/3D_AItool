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
