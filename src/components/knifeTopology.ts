import * as T from 'three';
import type {ControlMesh} from '../types';
import {validateControlTopology} from './meshTopology';
import {triangulateFaces} from './traceGeometry';
type V=[number,number,number];
export type KnifePoint={vertex:number}|{edge:[number,number];fraction:number};
export type KnifeStep={face:number;from:KnifePoint;to:KnifePoint};
const key=(a:number,b:number)=>a<b?a+':'+b:b+':'+a;
const normal=(v:V[],f:number[])=>{const n=new T.Vector3(),o=new T.Vector3(...v[f[0]]);f.forEach((id,i)=>n.add(new T.Vector3(...v[id]).sub(o).cross(new T.Vector3(...v[f[(i+1)%f.length]]).sub(o))));return n;};
const finish=(mesh:ControlMesh)=>{validateControlTopology(mesh);triangulateFaces(mesh.vertices,mesh.faces,false,false);return mesh;};
function path(f:number[],a:number,b:number){const out=[f[a]];while(a!==b){a=(a+1)%f.length;out.push(f[a])}return out;}
/** A continuous path of one chord per original polygon. No mesh mutation on failure. */
export function knifeCut(mesh:ControlMesh,steps:KnifeStep[]):ControlMesh{
 validateControlTopology(mesh);triangulateFaces(mesh.vertices,mesh.faces,false,false);
 if(!steps.length||steps.length>1000||new Set(steps.map(s=>s.face)).size!==steps.length)throw Error('需要连续路径，每个控制面最多切割一次');
 const vertices=mesh.vertices.map(v=>[...v] as V),cuts=new Map<string,{id:number;t:number}>();
 const resolve=(f:number[],p:KnifePoint)=>{
  if('vertex' in p){if(!f.includes(p.vertex))throw Error('端点不在控制面');return p.vertex;}
  const [a,b]=p.edge,t=p.fraction;
  if(!f.some((v,i)=>key(v,f[(i+1)%f.length])===key(a,b)))throw Error('端点不在控制面边线');
  if(!Number.isFinite(t)||t<=.01||t>=.99)throw Error('边内比例须在 1%–99%');
  const k=key(a,b),sorted=a<b?t:1-t,old=cuts.get(k);
  if(old){if(Math.abs(old.t-sorted)>1e-8)throw Error('同一共享边的切点不一致');return old.id;}
  const id=vertices.length;vertices.push(mesh.vertices[a].map((x,i)=>x*(1-t)+mesh.vertices[b][i]*t) as V);cuts.set(k,{id,t:sorted});return id;
 };
 const pairs=new Map<number,[number,number]>();let last:number|undefined;
 for(const s of steps){const f=mesh.faces[s.face];if(!f)throw Error('控制面编号无效');const a=resolve(f,s.from),b=resolve(f,s.to);if(a===b||last!==undefined&&last!==a)throw Error('刀切路径不连续或端点重合');pairs.set(s.face,[a,b]);last=b;}
 const faces:number[][]=[],colors:string[]=[];
 const push=(i:number,...fs:number[][])=>{faces.push(...fs);if(mesh.faceColors)colors.push(...fs.map(()=>mesh.faceColors![i]));};
 mesh.faces.forEach((f,i)=>{
  const expanded=f.flatMap((a,j)=>{const c=cuts.get(key(a,f[(j+1)%f.length]));return c?[a,c.id]:[a]});
  const pair=pairs.get(i);
  if(!pair){
   // Keep neighbor polygon if triangulable. Otherwise split only its original
   // boundary triangles, retaining all shared edge points without a T-junction.
   try{triangulateFaces(vertices,[expanded],false,false);push(i,expanded);}
   catch(e){
    if(expanded.length===f.length)throw e;
    const tri=triangulateFaces(vertices,[f],false,false);
    for(let k=0;k<tri.length;k+=3){
     let parts=[tri.slice(k,k+3)];
     for(const [edge,c] of cuts){const [a,b]=edge.split(':').map(Number);parts=parts.flatMap(t=>{const j=t.findIndex((v,j)=>key(v,t[(j+1)%3])===key(a,b));return j<0?[t]:[[t[j],c.id,t[(j+2)%3]],[c.id,t[(j+1)%3],t[(j+2)%3]]];});}
     push(i,...parts);
    }
   }return;
  }
  const a=expanded.indexOf(pair[0]),b=expanded.indexOf(pair[1]);
  const left=path(expanded,a,b),right=path(expanded,b,a);
  if(left.length<3||right.length<3)throw Error('切割线与原边重合');
  const n=normal(vertices,expanded),l=normal(vertices,left),r=normal(vertices,right);
  if(l.dot(n)<=1e-12*n.lengthSq()||r.dot(n)<=1e-12*n.lengthSq())throw Error('切割线穿出控制面或产生退化面');
  // In dominant projection, internal chord must not cross the polygon boundary.
  const axis=Math.abs(n.x)>=Math.abs(n.y)&&Math.abs(n.x)>=Math.abs(n.z)?0:Math.abs(n.y)>=Math.abs(n.z)?1:2;
  const p=(id:number)=>[vertices[id][(axis+1)%3],vertices[id][(axis+2)%3]];
  const A=p(pair[0]),B=p(pair[1]),cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let j=0;j<expanded.length;j++){const u=expanded[j],v=expanded[(j+1)%expanded.length];if(pair.includes(u)||pair.includes(v))continue;const C=p(u),D=p(v);if(cross(A,B,C)*cross(A,B,D)<0&&cross(C,D,A)*cross(C,D,B)<0)throw Error('切割线穿过控制面边界');}
  const M=A.map((x,j)=>(x+B[j])/2);let inside=false;for(let j=0;j<expanded.length;j++){const C=p(expanded[j]),D=p(expanded[(j+1)%expanded.length]);if((C[1]>M[1])!==(D[1]>M[1])&&M[0]<(D[0]-C[0])*(M[1]-C[1])/(D[1]-C[1])+C[0])inside=!inside;}if(!inside)throw Error('切割线不在控制面内部');
  push(i,left,right);
 });
 return finish({vertices,faces,...(mesh.faceColors?{faceColors:colors}:{})});
}
export function dissolveEdge(mesh:ControlMesh,a:number,b:number,maxAngle=5):ControlMesh{
 validateControlTopology(mesh);
 if(!Number.isFinite(maxAngle)||maxAngle<0||maxAngle>30)throw Error('溶解法线容差须为 0–30°');
 const owners=mesh.faces.map((f,i)=>({f,i,slot:f.findIndex((v,j)=>key(v,f[(j+1)%f.length])===key(a,b))})).filter(x=>x.slot>=0);
 if(owners.length!==2)throw Error('只能溶解两个控制面之间的共享边');
 const [u,v]=owners;
 if(mesh.faceColors&&mesh.faceColors[u.i]!==mesh.faceColors[v.i])throw Error('不同材质颜色的面不能直接溶解');
 const n=normal(mesh.vertices,u.f),m=normal(mesh.vertices,v.f);
 if(!n.lengthSq()||!m.lengthSq()||n.angleTo(m)*180/Math.PI>maxAngle+1e-8)throw Error('相邻面夹角超过容差，保护硬边');
 const p=path(u.f,(u.slot+1)%u.f.length,u.slot),q=path(v.f,(v.slot+1)%v.f.length,v.slot);
 const merged=[...p,...q.slice(1,-1)];
 const faces=mesh.faces.flatMap((f,i)=>i===u.i?[merged]:i===v.i?[]:[[...f]]);
 return finish({vertices:mesh.vertices.map(v=>[...v] as V),faces,...(mesh.faceColors?{faceColors:mesh.faceColors.filter((_,i)=>i!==v.i)}:{})});
}
/** Collapse an existing edge into its specified surviving endpoint. */
export function mergeEdgeVertices(mesh:ControlMesh,remove:number,keep:number):ControlMesh{
 const before=validateControlTopology(mesh);
 if(remove===keep||!mesh.vertices[remove]||!mesh.vertices[keep]||!mesh.faces.some(f=>f.some((v,i)=>key(v,f[(i+1)%f.length])===key(remove,keep))))throw Error('仅支持相邻顶点沿现有边合并');
 const vertices=mesh.vertices.filter((_,i)=>i!==remove).map(v=>[...v] as V),faces:number[][]=[],colors:string[]=[];
 mesh.faces.forEach((f,i)=>{const mapped=f.map(id=>id===remove?keep:id),compact=mapped.filter((id,j)=>id!==mapped[(j+mapped.length-1)%mapped.length]);if(compact.length<3)return;if(new Set(compact).size!==compact.length)throw Error('合并导致非相邻重复顶点');const n=normal(mesh.vertices,f),m=normal(mesh.vertices,compact);if(n.dot(m)<=0)throw Error('合并导致控制面反转或退化');faces.push(compact.map(id=>id>remove?id-1:id));if(mesh.faceColors)colors.push(mesh.faceColors[i]);});
 const next=finish({vertices,faces,...(mesh.faceColors?{faceColors:colors}:{})});
 const after=validateControlTopology(next);
 if(new Set(faces.map(f=>[...f].sort((a,b)=>a-b).join(':'))).size!==faces.length)throw Error('合并产生重复控制面');
 if(mesh.vertices.length-before.edges+mesh.faces.length!==next.vertices.length-after.edges+next.faces.length)throw Error('合并改变网格拓扑类型');
 // A manifold vertex link is a single cycle (interior) or path (boundary).
 const links=vertices.map(()=>new Map<number,number[]>());
 for(const f of faces)for(let i=0;i<f.length;i++){const id=f[i],a=f[(i+f.length-1)%f.length],b=f[(i+1)%f.length],link=links[id];link.set(a,[...(link.get(a)??[]),b]);link.set(b,[...(link.get(b)??[]),a]);}
 for(const link of links){if(!link.size)continue;const degrees=[...link.values()].map(v=>v.length),ends=degrees.filter(d=>d===1).length;if(degrees.some(d=>d>2)||ends!==0&&ends!==2)throw Error('合并导致非流形顶点');const seen=new Set<number>(),queue=[[...link.keys()][0]];while(queue.length){const v=queue.pop()!;if(seen.has(v))continue;seen.add(v);queue.push(...(link.get(v)??[]))}if(seen.size!==link.size)throw Error('合并导致断开的顶点扇区');}
 if(before.boundaryEdges===0&&after.boundaryEdges!==0)throw Error('合并会破坏封闭网格');
 if(!faces.length)throw Error('合并将删除全部控制面');
 return next;
}
