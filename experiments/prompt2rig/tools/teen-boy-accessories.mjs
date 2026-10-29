import * as THREE from 'three';
function geometry(p,ix){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));let volume=0;for(let i=0;i<ix.length;i+=3){const a=new THREE.Vector3().fromArray(p,ix[i]*3),b=new THREE.Vector3().fromArray(p,ix[i+1]*3),c=new THREE.Vector3().fromArray(p,ix[i+2]*3);volume+=a.dot(b.cross(c))/6;}if(volume<0)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;}
function add(model,g,bone,color,label,id,offset){const count=g.attributes.position.count,si=new Uint16Array(count*4),sw=new Float32Array(count*4);if(bone!==null){for(let i=0;i<count;i++){si[i*4]=bone;sw[i*4]=1;}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));}g.computeBoundingBox();g.computeBoundingSphere();return model.add(g,new THREE.MeshStandardMaterial({name:id,color,roughness:.9}),label,id,offset,'new accessory fitted to source preset');}
// Keep original lower-shirt vertices; interpolate cuts and bone weights at the removed collar.
export function clipGeometry(g,distance){const attrs=['position','normal','uv','skinIndex','skinWeight'].filter(k=>g.attributes[k]),vertices=[],ix=[],cache=new Map();
 const read=id=>Object.fromEntries(attrs.map(k=>[k,Array.from({length:g.attributes[k].itemSize},(_,j)=>g.attributes[k].getComponent(id,j))]));
 const lerp=(a,b,t)=>{const out={};for(const k of attrs)if(!['skinIndex','skinWeight'].includes(k))out[k]=a[k].map((v,j)=>v+(b[k][j]-v)*t);const weights=new Map();for(const [v,f]of [[a,1-t],[b,t]])for(let j=0;j<4;j++)weights.set(v.skinIndex[j],(weights.get(v.skinIndex[j])||0)+v.skinWeight[j]*f);const sorted=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((n,[,w])=>n+w,0);out.skinIndex=Array.from({length:4},(_,j)=>sorted[j]?.[0]||0);out.skinWeight=Array.from({length:4},(_,j)=>(sorted[j]?.[1]||0)/sum);return out;};
 const vertex=v=>{const key=attrs.flatMap(k=>v[k]).map(x=>Math.round(x*1e7)).join(',');if(!cache.has(key)){cache.set(key,vertices.length);vertices.push(v);}return cache.get(key);};
 for(let i=0;i<g.index.count;i+=3){const tri=[0,1,2].map(j=>read(g.index.getX(i+j))),polygon=[];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],da=distance(a.position),db=distance(b.position),ia=da>=0,ib=db>=0;if(ia)polygon.push(a);if(ia!==ib)polygon.push(lerp(a,b,da/(da-db)));}for(let j=1;j<polygon.length-1;j++)ix.push(vertex(polygon[0]),vertex(polygon[j]),vertex(polygon[j+1]));}
 const out=new THREE.BufferGeometry();for(const k of attrs){const a=g.attributes[k];out.setAttribute(k,new THREE.BufferAttribute(new a.array.constructor(vertices.flatMap(v=>v[k])),a.itemSize));}out.setIndex(ix);out.computeVertexNormals();out.computeBoundingBox();out.computeBoundingSphere();return out;}
const cropTop=(g,top)=>clipGeometry(g,p=>top-p[1]);
// Remove geometry under this fixed outfit, retaining a narrow overlap inside each hem.
// The cut follows the actual A-pose upper-arm axis, not a horizontal world-space crop.
export function removeCoveredBody(model,h){
 const rows=[],neck=model.bones[h.neck].getWorldPosition(new THREE.Vector3());
 for(const side of ['L','R']){
  const prefix=side==='L'?'left':'right',origin=model.bones[h[prefix+'UpperArm']].getWorldPosition(new THREE.Vector3()),axis=model.bones[h[prefix+'LowerArm']].getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const sleeve=model.parts.find(m=>m.name==='sleeve_'+side),p=sleeve.geometry.attributes.position;
  let hem=-Infinity;for(let i=0;i<p.count;i++)hem=Math.max(hem,new THREE.Vector3().fromBufferAttribute(p,i).sub(origin).dot(axis));
  const cut=hem-.009;
  for(const mesh of model.parts.filter(m=>m.name==='arm_'+side)){
   const before=mesh.geometry.index.count/3;mesh.geometry=clipGeometry(mesh.geometry,p=>new THREE.Vector3(...p).sub(origin).dot(axis)-cut);
   mesh.userData.provenance='source skin clipped inside sleeve';rows.push({part:mesh.name,before,after:mesh.geometry.index.count/3,origin:origin.toArray(),axis:axis.toArray(),cut,hem,overlap:.009});
  }
 }
 const mesh=model.parts.find(m=>m.name==='neck_scalp'),before=mesh.geometry.index.count/3;
 // Neck opening is lowest at the front; overlap is below the entire ribbing.
 const cut=neck.y-.009,collar=model.parts.find(m=>m.name==='tee_neck').geometry.attributes.position,cx=neck.x,cz=model.root.userData.shirtConstruction?.neckCenter?.[1]??neck.z+.014;
 const aperture=Array.from({length:32},(_,i)=>Math.hypot(collar.getX(i)-cx,collar.getZ(i)-cz));
 const neckDistance=p=>{const a=((Math.atan2(p[2]-cz,p[0]-cx)/(Math.PI*2))%1+1)%1*32,i=Math.floor(a),t=a-i,r=aperture[i]*(1-t)+aperture[(i+1)%32]*t-.002;return Math.min(p[1]-cut,Math.max(p[1]-(neck.y+.015),r-Math.hypot(p[0]-cx,p[2]-cz)));};
 mesh.geometry=clipGeometry(mesh.geometry,neckDistance);mesh.userData.provenance='source neck skin clipped inside crew neck';
 rows.push({part:mesh.name,before,after:mesh.geometry.index.count/3,cutY:cut,aperture:aperture.map(r=>r-.002),center:[cx,cz],clearAbove:neck.y+.015});
 return rows;
}
export function addBoyAccessories(model,h){const head=model.bones[h.head].getWorldPosition(new THREE.Vector3()),box=new THREE.Box3();for(const m of model.parts.filter(m=>m.name.startsWith('Hair')))box.union(m.geometry.boundingBox);const cx=head.x,cz=head.z-.005,base=box.max.y-.078,rx=Math.max(Math.abs(box.min.x-cx),Math.abs(box.max.x-cx))+.012,rz=.113;
 const arch=a=>{const d=Math.abs(Math.atan2(Math.sin(a-Math.PI/2),Math.cos(a-Math.PI/2)));return d<.46?.045*Math.sqrt(Math.max(0,1-(d/.46)**2)):0;};
 for(const hair of model.parts.filter(m=>m.name.startsWith('Hair'))){hair.geometry=clipGeometry(hair.geometry,p=>base+.012+arch(Math.atan2(p[2]-cz,p[0]-cx))-p[1]);hair.userData.provenance='source hair retained behind the cap adjustment opening';}
 const rings=[[0,1],[.045,.98],[.085,.8],[.115,.48],[.125,.12]],p=[],ix=[],n=24,layer=rings.length*n;
 for(const inner of [false,true])for(const [dy,r]of rings)for(let s=0;s<n;s++){const a=s/n*Math.PI*2,opening=arch(a)*Math.max(0,1-dy/.065),t=inner?.004:0;p.push(cx+(rx*r-t)*Math.cos(a),base+dy+opening-(inner?.004:0),cz+(rz*r-t)*Math.sin(a));}
 for(let l=0;l<2;l++)for(let r=0;r<rings.length-1;r++)for(let s=0;s<n;s++){const a=l*layer+r*n+s,b=l*layer+r*n+(s+1)%n;ix.push(...(l?[a,a+n,b,b,a+n,b+n]:[a,b,a+n,b,b+n,a+n]));}
 for(let s=0;s<n;s++){const a=s,b=(s+1)%n;ix.push(a,layer+a,b,b,layer+a,layer+b);}const outerTop=p.length/3;p.push(cx,base+.126,cz);const innerTop=p.length/3;p.push(cx,base+.122,cz);for(let s=0;s<n;s++){const u=(rings.length-1)*n+s,v=(rings.length-1)*n+(s+1)%n;ix.push(outerTop,u,v,innerTop,layer+v,layer+u);}add(model,geometry(p,ix),h.head,0xb34e4d,'反戴帽 · 帽冠','cap_crown',[0,.48,0]);
 const bp=[],bi=[],rows=[[-rz*.70,.088,base-.004],[-rz-.03,.102,base-.01],[-rz-.09,.085,base-.027],[-rz-.116,.04,base-.037]];for(const [z,w,y]of rows)for(const [dx,dy]of [[-1,-1],[1,-1],[1,1],[-1,1]])bp.push(cx+dx*w,y+dy*.003,cz+z);for(let r=0;r<rows.length-1;r++)for(let s=0;s<4;s++){const a=r*4+s,b=r*4+(s+1)%4;bi.push(a,b,a+4,b,b+4,a+4);}bi.push(0,2,1,0,3,2,12,13,14,12,14,15);add(model,geometry(bp,bi),h.head,0x9b4146,'反戴帽 · 后帽檐','cap_brim',[0,.43,-.21]);
 // A curved, contrasting strap sits outside the retained hair, with a separate buckle.
 let hairFront=cz+rz;for(const hair of model.parts.filter(m=>m.name.startsWith('Hair'))){const p=hair.geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-cx)<.05&&Math.abs(p.getY(i)-(base+.004))<.018)hairFront=Math.max(hairFront,p.getZ(i));}
 const sp=[],sx=[],segments=12,half=.052,front=hairFront+.008;
 for(let i=0;i<=segments;i++){const x=-half+i/segments*half*2,z=cz+rz-.004+(front-(cz+rz-.004))*(1-(x/half)**2);for(const[dy,dz]of [[-.008,-.003],[.008,-.003],[.008,.003],[-.008,.003]])sp.push(cx+x,base+.003+dy,z+dz);}
 for(let i=0;i<segments;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;sx.push(a,b,a+4,b,b+4,a+4);}sx.push(0,2,1,0,3,2,segments*4,segments*4+1,segments*4+2,segments*4,segments*4+2,segments*4+3);
 add(model,geometry(sp,sx),h.head,0x3a9599,'反戴帽 · 青绿调节带','cap_strap',[0,.42,.14]);
 const buckleX=cx-.022,buckleZ=cz+rz-.004+(front-(cz+rz-.004))*(1-(.022/half)**2)+.006,bp2=[],bi2=[];
 for(const[x,y,w,height]of [[-.010,0,.003,.024],[.010,0,.003,.024],[0,-.010,.022,.003],[0,.010,.022,.003],[0,0,.003,.019]]){const box=new THREE.BoxGeometry(w,height,.004);box.translate(buckleX+x,base+.003+y,buckleZ);const offset=bp2.length/3;bp2.push(...box.attributes.position.array);bi2.push(...Array.from(box.index.array,i=>i+offset));}
 add(model,geometry(bp2,bi2),h.head,0xe5c071,'反戴帽 · 黄铜带扣','cap_buckle',[0,.42,.16]);
 model.root.userData.capOpening={base,center:[cx,cz],halfAngle:.46,height:.045,hairFront,strapFront:front};
 const button=new THREE.SphereGeometry(.007,8,4);button.translate(cx,base+.125,cz);add(model,button,h.head,0x923f45,'反戴帽 · 顶扣','cap_button',[0,.51,0]);
 for(const [side,bone]of [['L',h.leftFoot],['R',h.rightFoot]]){const shoe=model.parts.find(m=>m.name==='shoe_'+side);if(!shoe)continue;const b=shoe.geometry.boundingBox,x=(b.min.x+b.max.x)/2,z=(b.min.z+b.max.z)/2,w=(b.max.x-b.min.x)/2+.003,d=(b.max.z-b.min.z)/2+.004,sp=[],si=[],count=12;for(const y of [.002,.019])for(let s=0;s<count;s++){const a=s/count*Math.PI*2;sp.push(x+w*Math.cos(a)*(Math.sin(a)>.2?1:.9),y,z+d*Math.sin(a));}for(let s=0;s<count;s++){const a=s,b=(s+1)%count;si.push(a,b,a+count,b,b+count,a+count);}for(const row of [0,1])for(let s=1;s<count-1;s++)si.push(...(row?[count,count+s,count+s+1]:[0,s+1,s]));add(model,geometry(sp,si),bone,0x3e7477,(side==='L'?'左':'右')+'鞋底','sole_'+side,[side==='L'?.21:-.21,-.25,.08]);}
}
