import * as THREE from 'three';
import {refine} from './teen-shirt.mjs';
const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
// Keep the accepted shirt silhouette. Only the concealed trouser waist and its
// short transition band move inward; matching shirt weights keeps both layers together.
export function tuckCoveredTrouserWaist(model,h,hem){
 const cloth=model.parts.filter(m=>/^(shirt_torso|tee_yoke|sleeve_[LR])$/.test(m.name)),triangles=[];
 for(const m of cloth){const g=m.geometry,p=g.attributes.position;for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k)),v=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));triangles.push({g,ids,v,min:Math.min(...v.map(v=>v.y)),max:Math.max(...v.map(v=>v.y))});}}
 const cx=model.bones[h.neck].getWorldPosition(new THREE.Vector3()).x,cz=.005,padding=.007,lower=hem-.025,full=hem+.005,hip=model.parts.find(m=>m.name==='pants_hip');if(!hip)throw Error('Trouser waist part is missing');
 hip.geometry=refine(refine(hip.geometry,-Infinity,.025),-Infinity,.025);const g=hip.geometry,p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;let moved=0,maxInset=0,maxOutsideMovement=0;
 for(let i=0;i<p.count;i++){const original=new THREE.Vector3().fromBufferAttribute(p,i),blend=smooth(lower,full,original.y);if(!blend)continue;const dx=original.x-cx,dz=original.z-cz,r=Math.hypot(dx,dz);if(r<1e-7)continue;const direction=new THREE.Vector3(dx/r,0,dz/r),ray=new THREE.Ray(new THREE.Vector3(cx,Math.max(hem+.0002,original.y),cz),direction);let best=null,distance=-Infinity;
  for(const t of triangles){if(t.min>ray.origin.y||t.max<ray.origin.y)continue;const hit=ray.intersectTriangle(...t.v,false,new THREE.Vector3());if(!hit)continue;const d=hit.clone().sub(ray.origin).dot(direction);if(d>distance){distance=d;best={...t,point:hit};}}
  if(!best)throw Error('No shirt surface found at the trouser waist');const target=Math.min(r,Math.max(.025,distance-padding)),radius=r+(target-r)*blend;p.setXYZ(i,cx+direction.x*radius,original.y,cz+direction.z*radius);if(r-radius>1e-7)moved++;maxInset=Math.max(maxInset,r-radius);if(original.y<lower)maxOutsideMovement=Math.max(maxOutsideMovement,r-radius);
  const bary=THREE.Triangle.getBarycoord(best.point,...best.v,new THREE.Vector3()),weights=new Map();for(let k=0;k<4;k++){const j=si.getComponent(i,k);weights.set(j,(weights.get(j)||0)+sw.getComponent(i,k)*(1-blend));}for(let v=0;v<3;v++)for(let k=0;k<4;k++){const j=best.g.attributes.skinIndex.getComponent(best.ids[v],k),w=best.g.attributes.skinWeight.getComponent(best.ids[v],k)*bary.getComponent(v)*blend;weights.set(j,(weights.get(j)||0)+w);}
  const list=[...weights].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=list.reduce((n,[,w])=>n+w,0);for(let k=0;k<4;k++){si.setComponent(i,k,list[k]?.[0]||0);sw.setComponent(i,k,(list[k]?.[1]||0)/sum);}
 }
 g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();hip.userData.provenance='source trouser waist tucked beneath the fitted shirt';
 return {strategy:'tuck-covered-trouser-waist',shirtExpanded:false,modifiedPart:'pants_hip',hemY:hem,transitionStart:lower,fullyTuckedFrom:full,padding,movedVertices:moved,maxInset,maxOutsideMovement};
}
