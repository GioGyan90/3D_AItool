import type {ControlMesh} from '../types';

type V = [number,number,number];
export type SymmetryAxis = 'x'|'y'|'z';
const EPS=1e-6;

function facePlane(mesh:ControlMesh, faceIndex:number) {
  const f=mesh.faces[faceIndex];if(!f||f.length<3)return null;
  const n:V=[0,0,0],center:V=[0,0,0];
  f.forEach((id,i)=>{
    const a=mesh.vertices[id], b=mesh.vertices[f[(i+1)%f.length]];
    for(let k=0;k<3;k++)center[k]+=a[k]/f.length;
    n[0]+=(a[1]-b[1])*(a[2]+b[2]);
    n[1]+=(a[2]-b[2])*(a[0]+b[0]);
    n[2]+=(a[0]-b[0])*(a[1]+b[1]);
  });
  const length=Math.hypot(...n);
  if(length<EPS)return null;
  for(let k=0;k<3;k++)n[k]/=length;
  return {normal:n,offset:n.reduce((sum,v,k)=>sum+v*center[k],0)};
}

/** Co-planar faces of the same orientation. A Rubik side selects exactly nine faces. */
export function findCoplanarFaceIds(mesh:ControlMesh, seed:number, tolerance=1e-5):number[]{
  const original=facePlane(mesh,seed);
  if(!original)return [];
  return mesh.faces.flatMap((_,i)=>{
    const f=facePlane(mesh,i);
    if(!f || f.normal.reduce((dot,v,k)=>dot+v*original.normal[k],0)<1-tolerance ||
       Math.abs(f.offset-original.offset)>tolerance)return [];
    return [i];
  });
}
export function findMatchingColorFaceIds(mesh:ControlMesh, seed:number):number[]{
  const color=mesh.faceColors?.[seed];
  if(!color)return [];
  return mesh.faceColors!.flatMap((c,i)=>c.toLowerCase()===color.toLowerCase()?[i]:[]);
}

/** Move one shared vertex and optional mirrored counterparts; never add vertices. */
export function moveWithSymmetry(
  mesh:ControlMesh,index:number,position:V,axes:SymmetryAxis[],tolerance=1e-5,
):{vertices:V[]; changed:number[]; unmatched:number}{
  const original=mesh.vertices[index];
  if(!original||position.some(n=>!Number.isFinite(n)))throw Error('需要有效的控制顶点和新坐标。');
  const unique=[...new Set(axes)];
  const axisIds=unique.map(a=>({x:0,y:1,z:2})[a]);
  const next=mesh.vertices.map(v=>[...v] as V);
  const moves=new Map<number,V>();
  // Center seam is pinned to its active mirror plane instead of detaching.
  const constrained=[...position] as V;
  axisIds.forEach(k=>{if(Math.abs(original[k])<tolerance)constrained[k]=0});
  moves.set(index,constrained);
  let unmatched=0;
  for(let mask=1;mask<2**axisIds.length;mask++){
    const source=[...original] as V,target=[...constrained] as V;
    for(let j=0;j<axisIds.length;j++){
      if(mask & (1<<j)){source[axisIds[j]]*=-1;target[axisIds[j]]*=-1;}
    }
    const found=mesh.vertices.findIndex(v=>v.every((value,k)=>Math.abs(value-source[k])<=tolerance));
    if(found<0){unmatched++;continue;}
    // Do not overwrite center-seam vertices with differing mirror transforms.
    if(!moves.has(found))moves.set(found,target);
  }
  for(const [i,v] of moves)next[i]=v;
  return {vertices:next,changed:[...moves.keys()],unmatched};
}

/** Stable batch color change; preserves every face index and existing topology. */
export function paintFaces(mesh:ControlMesh,faceIds:number[],hex:string):ControlMesh{
  if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('请使用 #RRGGBB 颜色。');
  const selected=new Set(faceIds);
  if([...selected].some(i=>!Number.isInteger(i)||i<0||i>=mesh.faces.length))
    throw Error('选中的控制面索引无效。');
  if(!selected.size)return mesh;
  return {...mesh,faceColors:mesh.faces.map((_,i)=>selected.has(i)?hex:(mesh.faceColors?.[i]??'#aab3c3'))};
}
