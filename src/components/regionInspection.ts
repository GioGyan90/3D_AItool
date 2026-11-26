import type {ControlMesh} from '../types';
type V=[number,number,number];
export type InspectionMode='isolate'|'ghost'|'contrast';
export type RegionInspection={faces:number[];mode:InspectionMode;opacity:number;folds:boolean};
const key=(a:number,b:number)=>a<b?a+':'+b:b+':'+a;
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a:V):V|null=>{const n=Math.hypot(...a);return n>1e-12?a.map(v=>v/n) as V:null};
export function regionFaces(mesh:ControlMesh,ids:number[]):number[]{return [...new Set(ids.filter(i=>Number.isInteger(i)&&i>=0&&i<mesh.faces.length))].sort((a,b)=>a-b)}
export function growRegion(mesh:ControlMesh,ids:number[]):number[]{
 const picked=new Set(regionFaces(mesh,ids)),edges=new Set<string>();
 for(const i of picked)mesh.faces[i].forEach((a,j,f)=>edges.add(key(a,f[(j+1)%f.length])));
 return mesh.faces.flatMap((f,i)=>picked.has(i)||f.some((a,j)=>edges.has(key(a,f[(j+1)%f.length])))?[i]:[]);
}
export function regionVertices(mesh:ControlMesh,ids:number[]):number[]{return [...new Set(regionFaces(mesh,ids).flatMap(i=>mesh.faces[i]))].sort((a,b)=>a-b)}
export function partitionRegionTriangles(mesh:ControlMesh,indices:number[],ids:number[]){
 const selected=new Set(regionFaces(mesh,ids)),target:number[]=[],context:number[]=[];let offset=0;
 for(const [i,f] of mesh.faces.entries()){const count=3*(f.length-2);(selected.has(i)?target:context).push(...indices.slice(offset,offset+count));offset+=count;}
 if(offset!==indices.length)throw Error('三角化索引数量与控制面不一致');
 return {target,context};
}
export function regionFolds(mesh:ControlMesh,ids:number[]){
 const selected=new Set(regionFaces(mesh,ids)),owners=new Map<string,{face:number;a:number;b:number}[]>();
 const normals=mesh.faces.map(f=>{const n:V=[0,0,0];for(let j=0;j<f.length;j++){const a=mesh.vertices[f[j]],b=mesh.vertices[f[(j+1)%f.length]];const c=cross(a,b);for(let k=0;k<3;k++)n[k]+=c[k]}return unit(n)});
 mesh.faces.forEach((f,i)=>f.forEach((a,j)=>{const b=f[(j+1)%f.length],k=key(a,b);owners.set(k,[...(owners.get(k)??[]),{face:i,a,b}])}));
 const out:{a:number;b:number;faces:[number,number];degrees:number;boundary:boolean}[]=[];
 for(const pair of owners.values()){if(pair.length!==2)continue;const [l,r]=pair;if(!selected.has(l.face)&&!selected.has(r.face))continue;
 const n=normals[l.face],m=normals[r.face],e=unit(sub(mesh.vertices[l.b],mesh.vertices[l.a]));if(!n||!m||!e||l.a!==r.b||l.b!==r.a)continue;
 out.push({a:l.a,b:l.b,faces:[l.face,r.face],degrees:Math.atan2(dot(e,cross(n,m)),dot(n,m))*180/Math.PI,boundary:!selected.has(l.face)||!selected.has(r.face)});
 }
 return out.sort((a,b)=>a.degrees-b.degrees);
}
