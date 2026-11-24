// Shared mirror-render contract, independent of THREE and control-mesh editing.
type Vertex=readonly number[];
export type MirrorReport={matchedVertices:number;pairedFaces:number;unmatchedTriangles:number|null;unresolvedFaces:number[]};
const key=(ids:readonly number[])=>[...ids].sort((a,b)=>a-b).join(':');
const oriented=(a:number[],b:number[])=>a.length===b.length&&a.some((_,k)=>a.every((x,i)=>x===b[(i+k)%b.length]));
const groups=(indices:number[])=>Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3));
export function mirrorTrianglesX(vertices:readonly Vertex[],faces:readonly number[][],source:readonly number[][],enabled=true){
 const output=source.map(t=>[...t]);
 const eps=1e-7;
 const buckets=new Map<string,number[]>();
 const cell=(p:Vertex)=>p.map(x=>Math.floor(x/eps));
 for(const [i,p] of vertices.entries()){const k=cell(p).join(':');const b=buckets.get(k)??[];b.push(i);buckets.set(k,b);}
 const mirror=vertices.map(p=>{
  const target=[-p[0],p[1],p[2]],c=cell(target),matches:number[]=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   for(const j of buckets.get([c[0]+x,c[1]+y,c[2]+z].join(':'))??[]){
    if(Math.hypot(...vertices[j].map((v,k)=>v-target[k]))<=eps)matches.push(j);
   }
  }
  return matches.length===1?matches[0]:-1;
 });
 for(let i=0;i<mirror.length;i++)if(mirror[i]>=0&&mirror[mirror[i]]!==i)mirror[i]=-1;
 const byFace=new Map<string,number[]>();
 faces.forEach((f,i)=>{const k=key(f),a=byFace.get(k)??[];a.push(i);byFace.set(k,a)});
 let pairedFaces=0;const unresolvedFaces:number[]=[];
 // Do not infer symmetry for a partially matched or ambiguous cage.
 const complete=mirror.every(i=>i>=0);
 if(complete){
  for(const [i,f] of faces.entries()){
   const reflected=f.map(id=>mirror[id]).reverse();
   const candidates=(byFace.get(key(reflected))??[]).filter(j=>oriented(reflected,faces[j]));
   if(candidates.length!==1){unresolvedFaces.push(i);continue}
   const j=candidates[0];
   if(j===i){
    const ts=groups(source[i]),set=new Set(ts.map(key));
    if(ts.some(t=>!set.has(key(t.map(id=>mirror[id])))))unresolvedFaces.push(i);
    continue; // Some center-spanning polygons cannot be mirrored without adding vertices.
   }
   if(i>j)continue;
   if(source[i].length!==3*(f.length-2)||source[j].length!==3*(faces[j].length-2)){unresolvedFaces.push(i,j);continue}
   pairedFaces+=2;
   if(enabled)output[j]=groups(source[i]).flatMap(([a,b,c])=>[mirror[a],mirror[c],mirror[b]]);
  }
 }
 const triangles=output.flatMap(groups),set=new Set(triangles.map(key));
 const unmatchedTriangles=complete?triangles.filter(t=>!set.has(key(t.map(i=>mirror[i])))).length:null;
 const report:MirrorReport={matchedVertices:mirror.filter(i=>i>=0).length,pairedFaces,unmatchedTriangles,unresolvedFaces};
 return {indices:output.flat(),byFace:output,report};
}
