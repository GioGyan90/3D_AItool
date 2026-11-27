import type {ControlMesh} from '../types';
import {validateControlTopology} from './meshTopology';
import {triangulateFaces} from './traceGeometry';
type Edge=[number,number];
type P=[number,number];
type V=[number,number,number];
const same=(e:Edge,f:Edge)=>e[0]===f[0]&&e[1]===f[1]||e[0]===f[1]&&e[1]===f[0];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
const turn=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function patch(mesh:ControlMesh,edge:Edge){
 const owners: {id:number;ring:number[]}[]=[];
 mesh.faces.forEach((f,id)=>{const slot=f.findIndex((a,k)=>same([a,f[(k+1)%f.length]],edge));if(slot>=0)owners.push({id,ring:[...f.slice(slot),...f.slice(0,slot)]})});
 if(owners.length!==2||owners.some(o=>o.ring.length!==4))throw Error('边线重连需要两个相邻四边面');
 const [left,right]=owners;const [a,b,c,d]=left.ring;const [bb,aa,e,f]=right.ring;
 if(a!==aa||b!==bb)throw Error('共享边绕序不一致');
 const cycle=[b,c,d,a,e,f];
 if(new Set(cycle).size!==6)throw Error('相邻四边面必须构成六点边界');
 if(mesh.faceColors&&mesh.faceColors[left.id]!==mesh.faceColors[right.id])throw Error('不能跨不同面颜色重连');
 return {owners,cycle};
}
export function quadReconnectChoices(mesh:ControlMesh,edge:Edge):Edge[]{
 const {cycle}=patch(mesh,edge);
 return [[cycle[1],cycle[4]],[cycle[2],cycle[5]]];
}
function reconnectPatch(mesh:ControlMesh,edge:Edge,target:Edge){
 const {owners,cycle}=patch(mesh,edge);
 const index=[1,2].find(i=>same([cycle[i],cycle[i+3]],target));
 if(index===undefined)throw Error('请选择六点边界的另一条对角线');
 const ring=[...cycle.slice(index),...cycle.slice(0,index)];
 const faces=[ring.slice(0,4),[...ring.slice(3),ring[0]]];
 const origin=mesh.vertices[cycle[0]],v=cycle.map(i=>sub(mesh.vertices[i],origin));
 const n=v.reduce<V>((s,p,i)=>{const c=cross3(p,v[(i+1)%v.length]);return [s[0]+c[0],s[1]+c[1],s[2]+c[2]]},[0,0,0]);
 const size=Math.max(...v.map(p=>Math.hypot(...p)));
 const eps=Math.max(size*size*1e-10,1e-20),coordEps=Math.max(size*1e-10,1e-12);
 const axis=[0,1,2].reduce((a,b)=>Math.abs(n[b])>Math.abs(n[a])?b:a);
 if(Math.abs(n[axis])<=eps)throw Error('六点边界投影退化');
 const project=(id:number):P=>{const p=sub(mesh.vertices[id],origin);return [p[(axis+1)%3],p[(axis+2)%3]*Math.sign(n[axis])]};
 const p=cycle.map(project);
 const on=(a:P,b:P,c:P)=>Math.abs(turn(a,b,c))<=eps&&c.every((x,k)=>x>=Math.min(a[k],b[k])-coordEps&&x<=Math.max(a[k],b[k])+coordEps);
 const intersects=(a:P,b:P,c:P,d:P)=>{const t=[turn(a,b,c),turn(a,b,d),turn(c,d,a),turn(c,d,b)];return (t[0]*t[1]<-eps*eps&&t[2]*t[3]<-eps*eps)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)};
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
  if(j===i+1||(i===0&&j===5))continue;
  if(intersects(p[i],p[(i+1)%6],p[j],p[(j+1)%6]))throw Error('六点边界投影自交');
 }
 const A=project(ring[0]),B=project(ring[3]);
 for(let i=0;i<6;i++){
  const a=cycle[i],b=cycle[(i+1)%6];
  if(a===ring[0]||a===ring[3]||b===ring[0]||b===ring[3]){
   const other=a===ring[0]||a===ring[3]?b:a;
   if(on(A,B,project(other)))throw Error('新边与边界重叠');
  }else if(intersects(A,B,p[i],p[(i+1)%6]))throw Error('新边穿过局部边界');
 }
 const mid:P=[(A[0]+B[0])/2,(A[1]+B[1])/2];
 let inside=false;
 for(let i=0,j=5;i<6;j=i++){
  const a=p[i],b=p[j];
  if((a[1]>mid[1])!==(b[1]>mid[1])&&mid[0]<(b[0]-a[0])*(mid[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 if(!inside)throw Error('新边位于局部边界外');
 for(const f of faces){
  const q=f.map(project);
  if(q.reduce((s,a,i)=>s+a[0]*q[(i+1)%q.length][1]-a[1]*q[(i+1)%q.length][0],0)<=eps)throw Error('新面投影绕序退化');
 }
 const tri=triangulateFaces(mesh.vertices,faces,false,false);
 const unit=n.map(x=>x/Math.hypot(...n)) as V;
 for(let i=0;i<tri.length;i+=3){
  const [a,b,c]=tri.slice(i,i+3).map(id=>mesh.vertices[id]);
  if(dot(cross3(sub(b,a),sub(c,a)),unit)<=eps)throw Error('新面三角形翻转或退化');
 }
 return {ids:owners.map(o=>o.id),faces};
}
/** Rotate a shared quad edge without moving vertices or changing face count.
 * Conservative local projection guard; full mesh self-intersection and
 * silhouette/shape QA still required. X reflection is an atomic two-patch edit.
 */
export function reconnectQuadEdge(mesh:ControlMesh,edge:Edge,target:Edge,mirrorX=false):ControlMesh{
 const before=validateControlTopology(mesh);
 const first=reconnectPatch(mesh,edge,target),edits=[first];
 if(mirrorX){
  const reflect=(id:number)=>{const [x,y,z]=mesh.vertices[id];const matches=mesh.vertices.flatMap((p,i)=>Math.hypot(p[0]+x,p[1]-y,p[2]-z)<=1e-6?[i]:[]);if(matches.length!==1)throw Error('镜像顶点缺失或不唯一');return matches[0]};
  const mirroredEdge=edge.map(reflect) as Edge,mirroredTarget=target.map(reflect) as Edge;
  const second=reconnectPatch(mesh,mirroredEdge,mirroredTarget);
  if(second.ids.some(i=>first.ids.includes(i)))throw Error('镜像区域重叠，请避开中心线');
  const sameLoop=(a:number[],b:number[])=>a.length===b.length&&a.some((_,k)=>a.every((v,i)=>v===b[(i+k)%b.length]));
  const check=(a:number[][],b:number[][])=>a.every(f=>b.some(g=>sameLoop(f.map(reflect).reverse(),g)));
  if(!check(first.ids.map(i=>mesh.faces[i]),second.ids.map(i=>mesh.faces[i]))||!check(first.faces,second.faces))throw Error('镜像区域连接不对称');
  edits.push(second);
 }
 const faces=mesh.faces.map(f=>[...f]);
 for(const e of edits)e.ids.forEach((id,i)=>{faces[id]=e.faces[i]});
 const next={...mesh,vertices:mesh.vertices.map(p=>[...p] as V),faces};
 const after=validateControlTopology(next);
 if(after.edges!==before.edges||after.boundaryEdges!==before.boundaryEdges)throw Error('重连改变了边界或边数');
 return next;
}
