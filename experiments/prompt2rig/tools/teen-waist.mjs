import * as THREE from 'three';
const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
// Fit against the actual trouser waist, including triangle/plane intersections.
// A convex ellipse encloses the waist facets; extra clearance covers shirt chords.
export function trouserEnvelope(model,hem){
 const points=[],meshes=model.parts.filter(m=>m.name.startsWith('pants_')),top=Math.max(...meshes.map(m=>m.geometry.boundingBox.max.y)),bottom=hem-.03;
 for(const m of meshes){const g=m.geometry,p=g.attributes.position;for(let i=0;i<g.index.count;i+=3){const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i+k)));for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3];if(a.y>=bottom&&a.y<=top)points.push(a);if((a.y<bottom)!==(b.y<bottom))points.push(a.clone().lerp(b,(bottom-a.y)/(b.y-a.y)));}}}
 const box=new THREE.Box3().setFromPoints(points),center=box.getCenter(new THREE.Vector3()),rx=(box.max.x-box.min.x)/2,rz=(box.max.z-box.min.z)/2,scale=Math.max(...points.map(p=>Math.hypot((p.x-center.x)/rx,(p.z-center.z)/rz))),padding=.012;
 return {center:[center.x,center.z],radii:[rx*scale+padding,rz*scale+padding],padding,top,bottom,fullyFittedThrough:top+.015,blendThrough:top+.11};
}
export function fitShirtWaist(g,hips,waist){
 const p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,[cx,cz]=waist.center,[rx,rz]=waist.radii;
 for(let i=0;i<p.count;i++){const y=p.getY(i),blend=1-smooth(waist.fullyFittedThrough,waist.blendThrough,y);if(!blend)continue;
  const x=p.getX(i)-cx,z=p.getZ(i)-cz,r=Math.hypot(x/rx,z/rz);if(r>1e-9&&r<1){const amount=1+(1/r-1)*blend;p.setXYZ(i,cx+x*amount,y,cz+z*amount);}
  // The overlapping hem follows the pelvis; fade back to the native torso skin
  // field above the waistband so bending cannot pull the hem through the pants.
  const weights=new Map([[hips,blend]]);for(let k=0;k<4;k++){const j=si.getComponent(i,k);weights.set(j,(weights.get(j)||0)+sw.getComponent(i,k)*(1-blend));}
  const list=[...weights].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=list.reduce((n,[,w])=>n+w,0);for(let k=0;k<4;k++){si.setComponent(i,k,list[k]?.[0]||0);sw.setComponent(i,k,(list[k]?.[1]||0)/sum);}
 }
 return g;
}
