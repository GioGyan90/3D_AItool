import * as THREE from 'three';
import {clipGeometry} from './teen-boy-accessories.mjs';
const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const vec=(g,i)=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i);
function compact(g,indices){const used=[...new Set(indices)],map=new Map(used.map((id,i)=>[id,i])),out=new THREE.BufferGeometry();for(const [key,a]of Object.entries(g.attributes)){const values=new a.array.constructor(used.length*a.itemSize);for(let i=0;i<used.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(used[i],k);out.setAttribute(key,new THREE.BufferAttribute(values,a.itemSize));}out.setIndex(indices.map(i=>map.get(i)));out.computeBoundingBox();out.computeBoundingSphere();return out;}
// Split long edges once, sharing midpoint IDs with neighboring triangles.
export function refine(g,minY=1.23,maxLength=.035){
 const values=Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)])),midpoints=new Map(),out=[];
 const edge=(a,b)=>a<b?a+','+b:b+','+a;
 for(let i=0;i<g.index.count;i+=3)for(let k=0;k<3;k++){const a=g.index.getX(i+k),b=g.index.getX(i+(k+1)%3),va=vec(g,a),vb=vec(g,b);if(Math.max(va.y,vb.y)<minY||va.distanceTo(vb)<maxLength)continue;const key=edge(a,b);if(midpoints.has(key))continue;const id=values.position.length/3;midpoints.set(key,id);for(const [name,attr]of Object.entries(g.attributes)){if(name==='skinIndex'||name==='skinWeight')continue;for(let c=0;c<attr.itemSize;c++)values[name].push((attr.getComponent(a,c)+attr.getComponent(b,c))/2);}const weights=new Map();for(const v of [a,b])for(let c=0;c<4;c++){const j=g.attributes.skinIndex.getComponent(v,c);weights.set(j,(weights.get(j)||0)+g.attributes.skinWeight.getComponent(v,c)/2);}const list=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=list.reduce((n,[,w])=>n+w,0);for(let c=0;c<4;c++){values.skinIndex.push(list[c]?.[0]||0);values.skinWeight.push((list[c]?.[1]||0)/sum);}}
 for(let i=0;i<g.index.count;i+=3){let ids=[0,1,2].map(k=>g.index.getX(i+k)),mids=ids.map((a,k)=>midpoints.get(edge(a,ids[(k+1)%3]))),count=mids.filter(i=>i!==undefined).length;if(!count){out.push(...ids);continue;}if(count===3){const[a,b,c]=ids,[ab,bc,ca]=mids;out.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);continue;}let start=count===1?mids.findIndex(i=>i!==undefined):mids.findIndex((m,k)=>m!==undefined&&mids[(k+1)%3]!==undefined);ids=[...ids.slice(start),...ids.slice(0,start)];mids=[...mids.slice(start),...mids.slice(0,start)];const[a,b,c]=ids,[ab,bc]=mids;if(count===1)out.push(a,ab,c,ab,b,c);else out.push(b,bc,ab,a,ab,c,ab,bc,c);}
 const result=new THREE.BufferGeometry();for(const[name,a]of Object.entries(g.attributes))result.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(values[name]),a.itemSize));result.setIndex(out);return result;
}
// Split only genuine sharp folds. Averaging opposing armpit faces through one
// vertex normal can point that normal through the cloth even at the rest pose.
function creaseNormals(g){
 const faces=[],around=new Map(),key=i=>vec(g,i).toArray().map(v=>Math.round(v*1e6)).join(',');
 for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k)),[a,b,c]=ids,n=new THREE.Vector3().crossVectors(vec(g,b).sub(vec(g,a)),vec(g,c).sub(vec(g,a))),id=faces.length;faces.push({ids,normal:n.clone().normalize(),area:n});for(const v of ids){const k=key(v);if(!around.has(k))around.set(k,[]);around.get(k).push(id);}}
 const values=Object.fromEntries(Object.keys(g.attributes).map(k=>[k,[]])),indices=[],cache=new Map(),threshold=Math.cos(70*Math.PI/180);
 for(let f=0;f<faces.length;f++)for(const original of faces[f].ids){const neighbors=[...new Set(around.get(key(original)))].filter(j=>faces[j].normal.dot(faces[f].normal)>=threshold),k=original+':'+neighbors.join(','),n=neighbors.reduce((v,j)=>v.add(faces[j].area),new THREE.Vector3()).normalize();if(!cache.has(k)){cache.set(k,values.position.length/3);for(const[name,a]of Object.entries(g.attributes))for(let c=0;c<a.itemSize;c++)values[name].push(name==='normal'?n.getComponent(c):a.getComponent(original,c));}indices.push(cache.get(k));}
 const out=new THREE.BufferGeometry();for(const[name,a]of Object.entries(g.attributes))out.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(values[name]),a.itemSize));out.setIndex(indices);return out;
}
export function buildFittedTee(model,h,template){
 const original=model.parts.filter(m=>/^(shirt_torso|sleeve_[LR])$/.test(m.name)),hem=Math.min(...original.map(m=>m.geometry.boundingBox.min.y)),neck=model.bones[h.neck].getWorldPosition(new THREE.Vector3()),centers={},axes={},hems={};
 for(const side of ['L','R']){const prefix=side==='L'?'left':'right',origin=model.bones[h[prefix+'UpperArm']].getWorldPosition(new THREE.Vector3()),axis=model.bones[h[prefix+'LowerArm']].getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),sleeve=original.find(m=>m.name==='sleeve_'+side);centers[side]=origin;axes[side]=axis;hems[side]=Math.max(...Array.from({length:sleeve.geometry.attributes.position.count},(_,i)=>vec(sleeve.geometry,i).sub(origin).dot(axis)));}
 let g=template.clone();const p=g.attributes.position,n=g.attributes.normal;
 // Expand using smooth torso/arm fields; raw skin-normal extrusion would
 // amplify nipples and small creases into folded garment triangles.
 for(let i=0;i<p.count;i++){const v=vec(g,i),side=v.x>=neck.x?'L':'R',origin=centers[side],axis=axes[side],axial=v.clone().sub(origin).dot(axis),center=origin.clone().addScaledVector(axis,axial),arm=v.clone().sub(center).multiplyScalar(.20).add(v),torso=v.clone();torso.x=neck.x+(v.x-neck.x)*1.12;torso.z=.005+(v.z-.005)*1.14;const blend=smooth(.10,.18,Math.abs(v.x-neck.x));v.copy(torso).lerp(arm,blend);p.setXYZ(i,...v.toArray());}
 g.computeVertexNormals();
 g=clipGeometry(g,p=>p[1]-hem);
 const top=neck.y+.006;g=clipGeometry(g,p=>top-p[1]);
 for(const side of ['L','R']){const sign=side==='L'?1:-1,origin=centers[side],axis=axes[side],torso=Math.abs(origin.x)+.014;g=clipGeometry(g,p=>Math.max(torso-sign*p[0],hems[side]-new THREE.Vector3(...p).sub(origin).dot(axis)));}
 g=refine(g);g=refine(g);
 // Preserve native body weighting below the shoulder band. Support the deltoid
 // by the clavicle rather than averaging one long panel between chest and arm.
 let pos=g.attributes.position;const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
 for(let i=0;i<pos.count;i++){
  const v=vec(g,i),side=v.x>=neck.x?'L':'R',prefix=side==='L'?'left':'right',origin=centers[side],axis=axes[side],band=smooth(origin.y-.115,origin.y-.06,v.y);if(!band)continue;
  const x=Math.abs(v.x-neck.x),axial=v.clone().sub(origin).dot(axis),arm=Math.max(smooth(-.06,.18,axial)*smooth(.09,.15,x),smooth(.12,.19,x)*.58),clavicle=(1-arm)*smooth(.055,.13,x),weights=new Map();
  for(let k=0;k<4;k++){const j=si.getComponent(i,k);weights.set(j,(weights.get(j)||0)+sw.getComponent(i,k)*(1-band));}
  for(const[j,w]of [[h.upperChest,1-arm-clavicle],[h[prefix+'Shoulder'],clavicle],[h[prefix+'UpperArm'],arm]])weights.set(j,(weights.get(j)||0)+w*band);
  const list=[...weights].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=list.reduce((n,[,w])=>n+w,0);for(let k=0;k<4;k++){si.setComponent(i,k,list[k]?.[0]||0);sw.setComponent(i,k,(list[k]?.[1]||0)/sum);}
 }
 // Normals are computed on the complete garment before semantic splitting.
 g=creaseNormals(g);pos=g.attributes.position;
 for(const m of original){m.removeFromParent();model.parts.splice(model.parts.indexOf(m),1);}
 const groups=new Map();for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k)),center=ids.reduce((v,id)=>v.addScaledVector(vec(g,id),1/3),new THREE.Vector3()),side=center.x>=neck.x?'L':'R',origin=centers[side],id=center.y>origin.y-.17&&Math.abs(center.x-neck.x)>Math.abs(origin.x-neck.x)+.012?'sleeve_'+side:center.y>origin.y-.025?'tee_yoke':'shirt_torso';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(...ids);}
 const labels={shirt_torso:'T 恤躯干',sleeve_L:'左短袖',sleeve_R:'右短袖',tee_yoke:'连续肩腋补片'};
 for(const[id,indices]of groups)model.add(compact(g,indices),new THREE.MeshStandardMaterial({name:id,color:0xf0ece0,roughness:.9,side:THREE.FrontSide}),labels[id],id,id.includes('sleeve')?[id.endsWith('L')?.22:-.22,.05,0]:[0,.07,.1],'same source body topology fitted as a continuous shirt');
 // Build ribbing from the actual boundary of the new neckline.
 const edgeCount=new Map();for(let i=0;i<g.index.count;i+=3)for(let k=0;k<3;k++){const a=g.index.getX(i+k),b=g.index.getX(i+(k+1)%3);if(Math.abs(pos.getY(a)-top)>1e-6||Math.abs(pos.getY(b)-top)>1e-6)continue;const key=[a,b].sort((a,b)=>a-b).join(',');if(!edgeCount.has(key))edgeCount.set(key,{a,b,count:0});edgeCount.get(key).count++;}
 const boundary=[...new Set([...edgeCount.values()].filter(e=>e.count===1).flatMap(e=>[e.a,e.b]))].map(i=>vec(g,i)).sort((a,b)=>Math.atan2(a.z-neck.z,a.x-neck.x)-Math.atan2(b.z-neck.z,b.x-neck.x));
 const sectors=32,cp=[],ci=[];const radius=a=>{const ux=Math.cos(a),uz=Math.sin(a),hits=[];for(let i=0;i<boundary.length;i++){const p=boundary[i],q=boundary[(i+1)%boundary.length],ax=p.x-neck.x,az=p.z-neck.z,dx=q.x-p.x,dz=q.z-p.z,den=ux*dz-uz*dx;if(Math.abs(den)<1e-10)continue;const r=(ax*dz-az*dx)/den,t=(ax*uz-az*ux)/den;if(r>0&&t>=0&&t<=1)hits.push(r);}return hits.length?Math.max(...hits):.06;};
 for(const outer of [false,true])for(let i=0;i<sectors;i++){const a=i/sectors*Math.PI*2,r=radius(a)+(outer?.003:-.004);cp.push(neck.x+r*Math.cos(a),top+.001,neck.z+r*Math.sin(a));}
 for(let i=0;i<sectors;i++){const j=(i+1)%sectors;ci.push(i,j,i+sectors,j,j+sectors,i+sectors);}
 const rib=new THREE.BufferGeometry();rib.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));rib.setIndex(ci);rib.computeVertexNormals();rib.computeBoundingBox();rib.computeBoundingSphere();const joints=new Uint16Array(cp.length/3*4),weights=new Float32Array(joints.length);for(let i=0;i<cp.length/3;i++){joints[i*4]=h.upperChest;weights[i*4]=1;}rib.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));rib.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));model.add(rib,new THREE.MeshStandardMaterial({name:'tee_neck',color:0x386e70,roughness:.9}),'T 恤圆领','tee_neck',[0,.07,.1],'ribbing fitted to the source body neckline');
 model.root.userData.shoulderRhythm=true;
 return {hemY:hem,neckY:top,continuousTemplate:true,neckCenter:[neck.x,neck.z],neckRadius:Array.from({length:32},(_,i)=>radius(i/32*Math.PI*2))};
}
