import * as T from 'three';
import type {ControlMesh} from '../types';
type V=ControlMesh['vertices'][number];
const vec=(v:V)=>new T.Vector3(...v);
const angle=(a:T.Vector3,b:T.Vector3)=>a.lengthSq()&&b.lengthSq()?a.angleTo(b)*180/Math.PI:180;
export function surfaceQuality(mesh:ControlMesh){
 const owners=new Map<string,{edge:[number,number];faces:number[]}>();
 const normals:T.Vector3[]=[];
 const faces=mesh.faces.map((f,id)=>{
  const p=f.map(i=>vec(mesh.vertices[i])),center=p.reduce((a,b)=>a.add(b),new T.Vector3()).multiplyScalar(1/p.length);
  const n=new T.Vector3();let scale=0;
  p.forEach((a,i)=>{const b=p[(i+1)%p.length];n.add(a.clone().sub(center).cross(b.clone().sub(center)));scale=Math.max(scale,a.distanceTo(b));const x=f[i],y=f[(i+1)%f.length],key=x<y?x+':'+y:y+':'+x;const entry=owners.get(key)??{edge:[Math.min(x,y),Math.max(x,y)] as [number,number],faces:[]};entry.faces.push(id);owners.set(key,entry)});
  const degenerate=!scale||n.length()<=1e-10*scale*scale;
  n.normalize();normals.push(n);
  const distance=Math.max(...p.map(a=>Math.abs(a.clone().sub(center).dot(n))));
  return {id,distance,relative:degenerate?null:distance/scale,degenerate};
 });
 const edges=[...owners.values()].filter(e=>e.faces.length===2).map(e=>({...e,degrees:angle(normals[e.faces[0]],normals[e.faces[1]])}));
 return {faces,edges};
}
// Index correspondence only: reject changed connectivity, never nearest-neighbor guess.
export function vertexDisplacement(base:ControlMesh,current:ControlMesh){
 if(base.vertices.length!==current.vertices.length||JSON.stringify(base.faces)!==JSON.stringify(current.faces))throw Error('版本控制网格连接或编号不同，无法安全逐点比较');
 const values=current.vertices.map((v,i)=>vec(v).distanceTo(vec(base.vertices[i])));
 const max=Math.max(0,...values),rms=Math.sqrt(values.reduce((s,v)=>s+v*v,0)/Math.max(1,values.length));
 return {values,max,rms,moved:values.filter(v=>v>1e-8).length};
}
export function displacementColors(values:number[],max:number):string[]{
 return values.map(v=>new T.Color().setHSL((1-Math.min(1,v/Math.max(max,1e-12)))*.62,.95,.52).getHexString()).map(c=>'#'+c);
}
// Validate both diagonals in the SAME dominant projection as the original ear cut.
// Only strictly convex quads qualify. Preserve polygon winding and vertex IDs.
export function optimizeQuad(vertices:V[],f:number[],original:number[]){
 if(f.length!==4||original.length!==6)return original;
 const p=f.map(i=>vec(vertices[i]));
 const n=new T.Vector3();for(let i=0;i<4;i++)n.add(p[i].clone().sub(p[0]).cross(p[(i+1)%4].clone().sub(p[0])));
 const axis=Math.abs(n.x)>=Math.abs(n.y)&&Math.abs(n.x)>=Math.abs(n.z)?0:Math.abs(n.y)>=Math.abs(n.z)?1:2;
 const q=p.map(a=>[a.getComponent((axis+1)%3),a.getComponent((axis+2)%3)]);
 const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const signs=q.map((a,i)=>cross(a,q[(i+1)%4],q[(i+2)%4]));
 const scale=Math.max(...p.map((a,i)=>a.distanceTo(p[(i+1)%4])));
 if(!signs.every(x=>x>1e-10*scale*scale)&&!signs.every(x=>x< -1e-10*scale*scale))return original;
 const score=(ids:number[])=>{
  const normals:T.Vector3[]=[];let min=Infinity;
  for(let i=0;i<6;i+=3){const [a,b,c]=ids.slice(i,i+3).map(j=>vec(vertices[j]));const u=b.clone().sub(a),v=c.clone().sub(a),normal=u.clone().cross(v);if(normal.dot(n)<=0)return Infinity;normals.push(normal);min=Math.min(min,2*Math.sqrt(3)*normal.length()/(u.lengthSq()+v.lengthSq()+b.distanceToSquared(c)))}
  return angle(normals[0],normals[1])+10*(1-min);
 };
 const a=[f[0],f[1],f[2],f[0],f[2],f[3]],b=[f[0],f[1],f[3],f[1],f[2],f[3]];
 const best=score(a)<score(b)?a:b;
 return score(best)+1e-7<score(original)?best:original;
}
