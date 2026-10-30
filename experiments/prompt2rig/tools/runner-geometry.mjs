import * as T from 'three';

export function compact(g,indices=Array.from(g.index.array)){
  const used=[...new Set(indices)],map=new Map(used.map((v,i)=>[v,i])),out=new T.BufferGeometry();
  for(const name of ['position','normal','uv','skinIndex','skinWeight']){
    const a=g.attributes[name];if(!a)continue;const values=name==='skinIndex'?new Uint16Array(used.length*a.itemSize):new Float32Array(used.length*a.itemSize);
    for(let i=0;i<used.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(used[i],k);
    out.setAttribute(name,new T.BufferAttribute(values,a.itemSize));
  }
  out.setIndex(indices.map(i=>map.get(i)));out.computeBoundingBox();out.computeBoundingSphere();return out;
}

// Clip complete triangles against signed pattern fields. Intersections share
// exactly the same attributes on both sides; never average joint IDs.
export function clip(g,fields){
  const names=Object.keys(g.attributes).filter(n=>['position','normal','uv','skinIndex','skinWeight'].includes(n));
  const vertex=i=>Object.fromEntries(names.map(n=>[n,Array.from({length:g.attributes[n].itemSize},(_,k)=>g.attributes[n].getComponent(i,k))]));
  const interpolate=(a,b,t)=>{
    const v={};for(const n of names)if(!n.startsWith('skin'))v[n]=a[n].map((x,k)=>x+(b[n][k]-x)*t);
    if(a.skinIndex){const weights=new Map();for(const [p,f]of [[a,1-t],[b,t]])p.skinIndex.forEach((j,k)=>weights.set(j,(weights.get(j)||0)+p.skinWeight[k]*f));const w=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=w.reduce((s,x)=>s+x[1],0);v.skinIndex=Array.from({length:4},(_,k)=>w[k]?.[0]||0);v.skinWeight=Array.from({length:4},(_,k)=>(w[k]?.[1]||0)/sum);}
    return v;
  };
  const values=Object.fromEntries(names.map(n=>[n,[]]));
  for(let i=0;i<g.index.count;i+=3){
    let poly=[0,1,2].map(k=>vertex(g.index.getX(i+k)));
    for(const field of fields){const next=[];for(let k=0;k<poly.length;k++){
      const a=poly[k],b=poly[(k+1)%poly.length],fa=field(...a.position),fb=field(...b.position);
      if(fa>=0)next.push(a);if((fa<0)!==(fb<0))next.push(interpolate(a,b,fa/(fa-fb)));
    }poly=next;if(poly.length<3)break;}
    for(let k=1;k<poly.length-1;k++){
      const tri=[poly[0],poly[k],poly[k+1]],a=new T.Vector3(...tri[0].position),b=new T.Vector3(...tri[1].position),c=new T.Vector3(...tri[2].position);
      if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)continue;
      for(const v of tri)for(const n of names)values[n].push(...v[n]);
    }
  }
  const out=new T.BufferGeometry();for(const n of names)out.setAttribute(n,new T.BufferAttribute(n==='skinIndex'?new Uint16Array(values[n]):new Float32Array(values[n]),g.attributes[n].itemSize));
  out.setIndex(Array.from({length:out.attributes.position.count},(_,i)=>i));out.computeBoundingBox();out.computeBoundingSphere();return out;
}

export function transform(g,fn){const p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);fn(v,i);p.setXYZ(i,...v.toArray());}g.computeBoundingBox();g.computeBoundingSphere();return g;}

export function assignRigid(g,joint){const p=g.attributes.position,si=new Uint16Array(p.count*4),sw=new Float32Array(p.count*4);for(let i=0;i<p.count;i++){si[i*4]=joint;sw[i*4]=1;}g.setAttribute('skinIndex',new T.BufferAttribute(si,4));g.setAttribute('skinWeight',new T.BufferAttribute(sw,4));return g;}

export function hullXZ(points){
  const p=[...new Map(points.map(v=>[v.x.toFixed(7)+','+v.z.toFixed(7),v.clone()])).values()].sort((a,b)=>a.x-b.x||a.z-b.z);
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),half=arr=>{const h=[];for(const v of arr){while(h.length>1&&cross(h.at(-2),h.at(-1),v)<=0)h.pop();h.push(v);}return h.slice(0,-1);};
  return [...half(p),...half([...p].reverse())];
}
