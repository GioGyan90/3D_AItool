import type {ControlMesh} from '../types';

type V=[number,number,number];
export type LoopSlideOptions={closed?:boolean;mirrorX?:boolean};
export type LoopSlideReport={
  movedVertices:number;
  maxDisplacement:number;
  meanDisplacement:number;
  maxNormalDeviationDegrees:number;
  minFaceAreaRatio:number;
  guideVertices:number[];
};
const edge=(a:number,b:number)=>a<b?a+':'+b:b+':'+a;
const normal=(vertices:V[],face:number[]):V=>{
  const out:V=[0,0,0];
  for(let i=0;i<face.length;i++){
    const a=vertices[face[i]],b=vertices[face[(i+1)%face.length]];
    out[0]+=(a[1]-b[1])*(a[2]+b[2]);
    out[1]+=(a[2]-b[2])*(a[0]+b[0]);
    out[2]+=(a[0]-b[0])*(a[1]+b[1]);
  }
  return out;
};
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=(a:V)=>Math.hypot(...a);

/**
 * Slides a connected chain/cycle of existing edges toward the adjacent quad
 * strip chosen by the first transverse guide vertex.
 *
 * All pairs are solved from the ORIGINAL mesh and committed atomically. The
 * mesh's vertices/face indices remain stable; inconsistent, ambiguous and
 * face-flipping requests are rejected rather than silently remeshed.
 *
 * This is a chord-based guide slide. It preserves the original edge flow but
 * does not promise an exact constant-curvature surface.
 */
export function slideContinuousEdgeLoop(
  mesh:ControlMesh,vertexChain:number[],guideVertex:number,fraction:number,
  options:LoopSlideOptions={},
):{mesh:ControlMesh;report:LoopSlideReport}{
  if(!Number.isFinite(fraction)||fraction<=.01||fraction>=.99)
    throw Error('环线比例必须位于 1% 到 99% 之间');
  if(!Array.isArray(vertexChain))throw Error('需要连续的环线顶点');
  const loop=[...vertexChain];
  const repeated=loop.length>2&&loop[0]===loop[loop.length-1];
  if(repeated)loop.pop();
  const closed=options.closed||repeated;
  if(loop.length<(closed?3:2)||new Set(loop).size!==loop.length)
    throw Error('环线至少需要相连的两个顶点（闭合环至少三个），且不能重复');
  if(loop.some(id=>!Number.isInteger(id)||!mesh.vertices[id])||
     !Number.isInteger(guideVertex)||!mesh.vertices[guideVertex]||loop.includes(guideVertex))
    throw Error('环线或引导顶点编号无效');
  const owners=new Map<string,number[][]>();
  mesh.faces.forEach(face=>face.forEach((id,i)=>{
    const k=edge(id,face[(i+1)%face.length]);
    owners.set(k,[...(owners.get(k)??[]),face]);
  }));
  const targets=[guideVertex];
  const steps=closed?loop.length:loop.length-1;
  for(let i=0;i<steps;i++){
    const a=loop[i],b=loop[(i+1)%loop.length],want=targets[i];
    const possible=(owners.get(edge(a,b))??[]).flatMap(face=>{
      if(face.length!==4)return [];
      const ia=face.indexOf(a),ib=face.indexOf(b);
      if(ia<0||ib<0)return [];
      if(face[(ia+1)%4]===b){
        return face[(ia+3)%4]===want?[face[(ia+2)%4]]:[];
      }
      if(face[(ib+1)%4]===a){
        return face[(ib+2)%4]===want?[face[(ib+3)%4]]:[];
      }
      return [];
    });
    if(possible.length!==1)
      throw Error('环线在 #'+a+' → #'+b+' 处缺少唯一四边面引导；请选择另一侧邻点');
    const next=possible[0];
    if(closed&&i===steps-1){
      if(next!==targets[0])throw Error('闭合环线的引导侧无法连续闭合');
    }else targets.push(next);
  }
  if(targets.length!==loop.length||new Set(targets).size!==targets.length||
      targets.some(id=>loop.includes(id)))
    throw Error('引导侧存在交叉或重复顶点，已拒绝滑动');

  const movements=new Map<number,number>();
  const register=(source:number,to:number)=>{
    const previous=movements.get(source);
    if(previous!==undefined&&previous!==to)
      throw Error('镜像后目标冲突：环线可能跨越 X=0 中心线');
    movements.set(source,to);
  };
  loop.forEach((id,i)=>register(id,targets[i]));
  if(options.mirrorX){
    const mirror=(id:number)=>{
      const [x,y,z]=mesh.vertices[id];
      const matches:number[]=[];
      mesh.vertices.forEach((v,i)=>{
        if(Math.abs(v[0]+x)<1e-6&&Math.abs(v[1]-y)<1e-6&&Math.abs(v[2]-z)<1e-6)matches.push(i);
      });
      if(matches.length!==1)throw Error('X 对称点缺失或不唯一：#'+id);
      return matches[0];
    };
    loop.forEach((id,i)=>register(mirror(id),mirror(targets[i])));
  }
  const vertices:V[]=mesh.vertices.map(v=>[...v] as V);
  let total=0,maxDisplacement=0;
  for(const [source,target] of movements){
    const a=mesh.vertices[source],b=mesh.vertices[target];
    const next=a.map((v,i)=>v+(b[i]-v)*fraction) as V;
    const magnitude=Math.hypot(...a.map((v,i)=>next[i]-v));
    vertices[source]=next;
    total+=magnitude;maxDisplacement=Math.max(maxDisplacement,magnitude);
  }
  const affected=new Set(movements.keys());
  let maxNormalDeviationDegrees=0,minFaceAreaRatio=Infinity;
  for(const [fi,face] of mesh.faces.entries()){
    if(!face.some(id=>affected.has(id)))continue;
    const before=normal(mesh.vertices,face),after=normal(vertices,face);
    const oldLength=length(before),newLength=length(after);
    if(oldLength<1e-10||newLength<1e-9)
      throw Error('环线滑动导致控制面 #'+fi+' 退化');
    const cosine=Math.max(-1,Math.min(1,dot(before,after)/(oldLength*newLength)));
    if(cosine<=0)throw Error('环线滑动将翻转控制面 #'+fi);
    maxNormalDeviationDegrees=Math.max(maxNormalDeviationDegrees,Math.acos(cosine)*180/Math.PI);
    minFaceAreaRatio=Math.min(minFaceAreaRatio,newLength/oldLength);
  }
  return {
    mesh:{...mesh,vertices},
    report:{
      movedVertices:movements.size,
      maxDisplacement,
      meanDisplacement:total/movements.size,
      maxNormalDeviationDegrees,
      minFaceAreaRatio,
      guideVertices:targets,
    },
  };
}
