import type {ControlMesh} from '../types';
type V=[number,number,number];
export type InspectionMode='isolate'|'ghost'|'contrast';
export type RegionInspection={faces:number[];mode:InspectionMode;opacity:number;folds:boolean;section?:SectionSettings};
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

export type SectionSettings={azimuth:number;elevation:number;position:number;clip:boolean;reverse:boolean};
export const defaultSection:SectionSettings={azimuth:0,elevation:90,position:.5,clip:false,reverse:false};
export function sectionPlane(mesh:ControlMesh,ids:number[],s:SectionSettings){
 const az=s.azimuth*Math.PI/180,el=s.elevation*Math.PI/180;
 const normal:V=[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)];
 const points=regionVertices(mesh,ids).map(i=>dot(mesh.vertices[i],normal));
 if(!points.length)return null;
 const min=Math.min(...points),max=Math.max(...points),offset=min+(max-min)*Math.max(0,Math.min(1,s.position));
 return {normal,offset,min,max};
}
export function sectionSegments(vertices:V[],indices:number[],normal:V,offset:number):[V,V][]{
 const n=unit(normal);if(!n||!Number.isFinite(offset))return [];
 const distances=vertices.map(v=>dot(v,n)-offset),extent=Math.max(1,...distances.map(Math.abs)),eps=extent*1e-8;
 const unique=new Map<string,[V,V]>();
 const pointKey=(p:V)=>p.map(x=>Math.round(x/eps)).join(',');
 for(let i=0;i+2<indices.length;i+=3){
   const ids=indices.slice(i,i+3),d=ids.map(j=>distances[j]);if(d.every(x=>Math.abs(x)<=eps))continue;
   const hits=new Map<string,V>();const add=(p:V)=>hits.set(pointKey(p),p);
   for(let j=0;j<3;j++){const k=(j+1)%3,a=vertices[ids[j]],b=vertices[ids[k]],da=d[j],db=d[k];if(Math.abs(da)<=eps)add(a);if(da*db<0&&Math.abs(da)>eps&&Math.abs(db)>eps){const t=da/(da-db);add(a.map((x,k)=>x+(b[k]-x)*t) as V)}}
   const p=[...hits.values()];if(p.length===2){const k=p.map(pointKey).sort().join('|');unique.set(k,[p[0],p[1]])}
 }
 return [...unique.values()];
}
export function sectionProfile(segments:[V,V][],normal:V){
 const n=unit(normal)??[0,1,0] as V,ref:V=Math.abs(n[1])>.9?[0,0,1]:[0,1,0];
 const u=unit(cross(n,ref))??[1,0,0] as V,v=cross(u,n);
 return segments.map(pair=>pair.map(p=>[dot(p,u),dot(p,v)] as [number,number]) as [[number,number],[number,number]]);
}
export type NamedInspectionRegion={name:string;faces:number[]};
export function readInspectionRegions(mesh:ControlMesh,value:unknown):NamedInspectionRegion[]{
 const payload=value as {topology?:unknown;regions?:unknown};
 if(!payload||payload.topology!==JSON.stringify(mesh.faces)||!Array.isArray(payload.regions)||payload.regions.length>100)throw Error('区域文件与当前控制面拓扑不匹配');
 const out:NamedInspectionRegion[]=[],names=new Set<string>();
 for(const item of payload.regions){if(!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||!Array.isArray(item.faces)||!item.faces.length||item.faces.some((i:unknown)=>typeof i!=='number'||!Number.isInteger(i)||i<0||i>=mesh.faces.length)||names.has(item.name))throw Error('区域文件包含无效或重复名称/面编号');names.add(item.name);out.push({name:item.name,faces:regionFaces(mesh,item.faces)})}
 return out;
}

export function regionDimensions(mesh:ControlMesh,ids:number[]){
 const vertices=regionVertices(mesh,ids).map(i=>mesh.vertices[i]);if(!vertices.length)return null;
 const bounds=(points:V[])=>[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k]))) as V;
 const size=bounds(vertices),whole=bounds(mesh.vertices);
 return {size,whole,ratios:size.map((n,k)=>whole[k]>1e-12?n/whole[k]:null)};
}
export function landmarkMeasurement(mesh:ControlMesh,a:number,b:number){
 if(!Number.isInteger(a)||!Number.isInteger(b)||!mesh.vertices[a]||!mesh.vertices[b])return null;
 const delta=sub(mesh.vertices[b],mesh.vertices[a]);return {delta,distance:Math.hypot(...delta)};
}
export function alignedSectionProfiles(current:[V,V][],baseline:[V,V][],normal:V){
 const now=sectionProfile(current,normal),before=sectionProfile(baseline,normal),all=[...now,...before].flat();
 if(!all.length)return {now:[],before:[],scale:1};
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const scale=Math.min(270/Math.max(.001,xmax-xmin),100/Math.max(.001,ymax-ymin));
 const project=([x,y]:[number,number]):[number,number]=>[150+(x-(xmin+xmax)/2)*scale,60-(y-(ymin+ymax)/2)*scale];
 return {now:now.map(p=>p.map(project)),before:before.map(p=>p.map(project)),scale};
}
