import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';
import {mergeVertices,mergeGeometries} from '../public/vendor/utils/BufferGeometryUtils.js';
import {MeshoptSimplifier} from '../public/vendor/meshopt/meshopt_simplifier.module.js';
import {reduceGeometry,modelStats} from '../public/lab/optimize.js';
import {readGLB,writeGLB,compressGLB} from '../public/lab/glb-codec.js';
import {compact,clip,transform,assignRigid,hullXZ,boundaryEdges} from './runner-geometry.mjs';

const source=process.env.RUNNER_SOURCE;
if(!source)throw Error('Set RUNNER_SOURCE to the reviewed Universal Base Characters directory (see SOURCES.md)');
const hashes={
  'Base Characters/Superhero_Female_FullBody.gltf':'215f2af81ad91eecfcee807bad19b541704b800844d997286b78d5dbed7a3b5e',
  'Base Characters/Superhero_Female_FullBody.bin':'3a8220a485b33d05d879115a50697728b45a151781106033afb8b8c243fca208',
  'Base Characters/T_Superhero_Female_Dark_BaseColor.png':'f958c18d562e8bc8ffdaf602b98df6ebb56c24d799c82047a05ca26343323a23',
  'Base Characters/T_Eye_Brown.png':'d2da8cd60909331fc3a6fb02572b4d33139a8f7f78f0448b04c147666955cd15',
  'Hairstyles/Origin/Hair_Buns.gltf':'2bb3593575e21c9af39a53e48c42c1314b0a894e9577f3f14abffcb145cd56c5',
  'Hairstyles/Origin/Hair_Buns.bin':'4f6d4c010201278483da8d6d46ec40e3beb8d9e679ec2139bed216c561bccd38',
  'License_Standard.txt':'e08f717c3cfd999f4b44f2be4522b11a3ac3c0e5b6364b3a8788d25d4c90ff94',
};
for(const [f,hash]of Object.entries(hashes))if(createHash('sha256').update(await fs.readFile(path.join(source,f))).digest('hex')!==hash)throw Error('Reviewed source hash differs: '+f);
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
async function untexturedGLTF(f){
  const j=JSON.parse(await fs.readFile(path.join(source,f),'utf8')),bin=new Uint8Array(await fs.readFile(path.join(source,path.dirname(f),j.buffers[0].uri)));
  j.buffers=[{byteLength:bin.length}];j.images=[];j.textures=[];j.materials=(j.materials||[]).map(m=>({name:m.name,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.85}}));
  for(const m of j.meshes)for(const p of m.primitives)for(const key of Object.keys(p.attributes))if(!['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'].includes(key))delete p.attributes[key];
  return (await parseCharacter(writeGLB(j,bin))).scene;
}
const base=await untexturedGLTF('Base Characters/Superhero_Female_FullBody.gltf'),hair=await untexturedGLTF('Hairstyles/Origin/Hair_Buns.gltf');
const body=base.getObjectByName('Superhero_Female'),sourceSkeleton=body.skeleton;
sourceSkeleton.pose();base.updateMatrixWorld(true);hair.updateMatrixWorld(true);
const originalBones=sourceSkeleton.bones;
const box=new T.Box3().setFromObject(body),barefootHeight=1.68,soleLift=.028,scale=barefootHeight/(box.max.y-box.min.y),offset=new T.Vector3(-(box.max.x+box.min.x)/2,-box.min.y,0);
const normalize=v=>v.add(offset).multiplyScalar(scale).add(new T.Vector3(0,soleLift,0));
const canonical={pelvis:'Hips',spine_01:'Spine',spine_02:'Spine1',spine_03:'Spine2',neck_01:'Neck',Head:'Head'};
for(const [s,c]of [['l','Left'],['r','Right']]){
  for(const [a,b]of Object.entries({clavicle:'Shoulder',upperarm:'Arm',lowerarm:'ForeArm',hand:'Hand',thigh:'UpLeg',calf:'Leg',foot:'Foot',ball:'ToeBase'}))canonical[a+'_'+s]=c+b;
  for(const f of ['thumb','index','middle','ring','pinky'])for(let i=1;i<=3;i++)canonical[f+'_0'+i+'_'+s]=c+'Hand'+f[0].toUpperCase()+f.slice(1)+i;
}
const joints=originalBones.map(b=>({source:b.name,name:canonical[b.name]?'mixamorig'+canonical[b.name]:'Runner_'+b.name,parent:originalBones.indexOf(b.parent),position:normalize(b.getWorldPosition(new T.Vector3()))}));
const at=n=>joints.find(b=>b.name==='mixamorig'+n).position;
function baked(mesh){
  const g=compact(mesh.geometry),p=g.attributes.position,n=g.attributes.normal;
  const skin=mesh.isSkinnedMesh?mesh.skeleton.bones.map((b,i)=>b.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix)):null;
  for(let i=0;i<p.count;i++){
    const pos=new T.Vector3().fromBufferAttribute(p,i),normal=new T.Vector3().fromBufferAttribute(n,i),v=new T.Vector3(),nv=new T.Vector3();
    if(skin){for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k),id=g.attributes.skinIndex.getComponent(i,k);if(w){v.addScaledVector(pos.clone().applyMatrix4(skin[id]),w);nv.addScaledVector(normal.clone().transformDirection(skin[id]),w);}}}
    else{v.copy(pos).applyMatrix4(mesh.matrixWorld);nv.copy(normal).transformDirection(mesh.matrixWorld);}
    normalize(v);p.setXYZ(i,...v.toArray());n.setXYZ(i,...nv.normalize().toArray());
  }
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
const bodyGeometry=baked(body),browGeometry=baked(base.getObjectByName('Eyebrows')),eyeGeometry=baked(base.getObjectByName('Eyes'));
let sourceHair;hair.traverse(o=>{if(o.isMesh)sourceHair=o;});const hairGeometry=assignRigid(baked(sourceHair),joints.findIndex(j=>j.name==='mixamorigHead'));
if(process.argv.includes('--inspect')){
 console.log(JSON.stringify({scale,box:{min:box.min.toArray(),max:box.max.toArray()},joints:joints.map(j=>({...j,position:j.position.toArray()})),body:modelStats(base),hairBox:{min:hairGeometry.boundingBox.min.toArray(),max:hairGeometry.boundingBox.max.toArray()}},null,2));process.exit(0);
}
await MeshoptSimplifier.ready;
const baseJointCount=joints.length,legBend=[],forearmTwist=[];
for(const side of ['Left','Right']){
  const upper=joints.findIndex(j=>j.name==='mixamorig'+side+'UpLeg'),lower=joints.find(j=>j.name==='mixamorig'+side+'Leg'),bone='Runner_'+side+'KneeBend';
  joints.push({source:null,name:bone,parent:upper,position:lower.position.clone()});legBend.push({bone,upper:side+'UpLeg',lower:side+'Leg',fraction:.5});
  const arm=joints.findIndex(j=>j.name==='mixamorig'+side+'Arm'),elbow=at(side+'ForeArm'),twist='Runner_'+side+'ElbowBend',middleBone='Runner_'+side+'ForearmMid';
  joints.push({source:null,name:twist,parent:arm,position:elbow.clone()},{source:null,name:middleBone,parent:arm,position:elbow.clone()});forearmTwist.push({bone:twist,middleBone,arm:side+'Arm',forearm:side+'ForeArm',hand:side+'Hand',fraction:.25,swingFraction:.5});
}
const destination=fileURLToPath(new URL('../public/lab/characters/running-woman/',import.meta.url));await fs.mkdir(destination,{recursive:true});
const material=(name,color,texture)=>{const m=new T.MeshStandardMaterial({name,color,roughness:.87,metalness:0,side:T.FrontSide});if(texture)m.userData.runnerTexture=texture;return m;};
const palette={tank:'#16a59c',binding:'#9de4d2',pants:'#29395c',panel:'#465f87',hair:'#3e2929',shoe:'#f1f3e9',sole:'#c8ded9',accent:'#f5ac7b'};
const materials={skin:material('Adult female skin','#ffffff','Base Characters/T_Superhero_Female_Dark_BaseColor.png'),eyes:material('Brown eyes','#ffffff','Base Characters/T_Eye_Brown.png'),hair:material('Chestnut tied hair',palette.hair),tank:material('Teal athletic tank',palette.tank),binding:material('Tank edge binding',palette.binding),pants:material('Navy yoga leggings',palette.pants),panel:material('Leggings side panel',palette.panel),shoe:material('Running shoe upper',palette.shoe),sole:material('Running shoe sole',palette.sole),accent:material('Sport accent',palette.accent)};
function makeBase(variant){
  const root=new T.Group();root.name=variant==='assembled'?'Adult_Running_Woman':'Adult_Female_Complete_Source';
  root.userData={preset:'quaternius-running-woman',variant,motionCharacter:true,studyRest:true,restPoseLabel:'源绑定姿势',barefootHeight,sourceRevision:'a928cfa67684352b75a65c510d8751d1f3f2489c',headFocus:[0,at('Head').y+.06,.025],headSpan:.43,frameCenter:[0,.87,0],frameSpan:2.06,...(variant==='assembled'?{soleGrounding:true,legBend,forearmTwist}:{})};
  const selectedJoints=variant==='assembled'?joints:joints.slice(0,baseJointCount),bones=selectedJoints.map(j=>{const b=new T.Bone();b.name=j.name;b.position.copy(j.position).sub(j.parent>=0?joints[j.parent].position:new T.Vector3());return b;});bones.forEach((b,i)=>(joints[i].parent<0?root:bones[joints[i].parent]).add(b));root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();const parts=[];
  const add=(g,mat,id,label,explosion=[0,0,0],provenance='Quaternius source surface')=>{const clean=compact(g);clean.normalizeNormals();const m=new T.SkinnedMesh(mergeVertices(clean,1e-6),mat);m.name=id;m.userData={studyPart:true,partId:id,partLabel:label,explosionOffset:explosion,provenance};root.add(m);m.bind(skeleton,new T.Matrix4());m.frustumCulled=false;parts.push(m);return m;};
  return {root,bones,skeleton,parts,add};
}
const original=makeBase('complete-source');original.add(bodyGeometry,materials.skin,'complete_body','未遮挡成年基础体');original.add(browGeometry,materials.hair,'brows','眉毛',[0,.1,.03]);original.add(eyeGeometry,materials.eyes,'eyes','眼睛',[0,.1,.06]);original.add(hairGeometry,materials.hair,'hair','双束发',[0,.18,-.08]);
const model=makeBase('assembled'),history=[];
// Preserve author anatomy and all original joint lengths. Clothing starts from
// this unmasked full body, rather than a previously shirt-masked teen preset.
const hipY=at('Hips').y,waistY=hipY+.105,hemY=hipY+.065,ankleY=at('LeftFoot').y+.038,neckY=at('Neck').y;
const centerZ=at('Spine1').z-.006,armX=at('LeftArm').x;
const index=n=>joints.findIndex(j=>j.name==='mixamorig'+n),setWeights=(g,field)=>{const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;for(let i=0;i<si.count;i++){const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i),entries=field(p,i).filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=entries.reduce((s,[,w])=>s+w,0);for(let k=0;k<4;k++){si.setComponent(i,k,entries[k]?.[0]||0);sw.setComponent(i,k,(entries[k]?.[1]||0)/sum);}}};
function torsoWeights(p){const chain=['Hips','Spine','Spine1','Spine2'],out=[];let found=false;for(let k=0;k<chain.length-1;k++){const a=at(chain[k]).y,b=at(chain[k+1]).y;if(p.y<=b){const t=T.MathUtils.smoothstep(p.y,a,b);out.push([index(chain[k]),1-t],[index(chain[k+1]),t]);found=true;break;}}if(!found)out.push([index('Spine2'),1]);const shoulder=.18*T.MathUtils.smoothstep(p.y,neckY-.15,neckY-.015)*T.MathUtils.smoothstep(Math.abs(p.x),.055,.125);for(const e of out)e[1]*=1-shoulder;out.push([index(p.x>0?'LeftShoulder':'RightShoulder'),shoulder]);return out;}
function legWeights(p){
  const side=p.x>=0?'Left':'Right',knee=at(side+'Leg').y,t=T.MathUtils.smoothstep(p.y,knee-.14,knee+.14),mid=joints.findIndex(j=>j.name==='Runner_'+side+'KneeBend');
  let leg=t<.5?[[index(side+'Leg'),1-2*t],[mid,2*t]]:[[mid,2*(1-t)],[index(side+'UpLeg'),2*t-1]];
  const central=(1-T.MathUtils.smoothstep(Math.abs(p.x),.012,.055))*T.MathUtils.smoothstep(p.y,hipY-.19,hipY-.07),hip=Math.max(T.MathUtils.smoothstep(p.y,hipY-.19,hipY+.04),central*.94);
  if(p.y>knee+.14){const left=T.MathUtils.smoothstep(p.x,-.035,.035);leg=[[index('LeftUpLeg'),left],[index('RightUpLeg'),1-left]];}
  for(const e of leg)e[1]*=1-hip;leg.push([index('Hips'),hip]);
  const foot=1-T.MathUtils.smoothstep(p.y,ankleY+.001,ankleY+.065);for(const e of leg)e[1]*=1-foot;leg.push([index(side+'Foot'),foot]);return leg;
}
// Positive is covered by the tank. Scoop neckline and deep arm openings are
// clipped geometrically, leaving actual shoulder/axilla skin underneath.
const tankField=(x,y,z)=>{
  const front=T.MathUtils.smoothstep(z-centerZ,-.01,.04),neckline=neckY-.055-front*.085;
  const armEdge=armX+.055-.080*T.MathUtils.smoothstep(y,neckY-.23,neckY-.04);
  const necklineDistance=(neckline+.13*(x/.07)**2-y)/Math.sqrt(1+(.26*x/(.07*.07))**2);
  return Math.min(y-hemY,necklineDistance,armEdge-Math.abs(x),neckY+.012-y);
};
// A little interior overlap is retained in the body mask; the exterior garment
// is generated independently and the full unmasked source is kept separately.
const torso=clip(bodyGeometry,[(x,y)=>y-hemY,(x,y)=>neckY+.02-y,(x)=>armX+.06-Math.abs(x)]);
let tank=mergeVertices(clip(torso,[tankField]),1e-6);
const openingEdges=boundaryEdges(tank).filter(e=>tank.attributes.position.getY(e.a)>hemY+.03&&tank.attributes.position.getY(e.b)>hemY+.03),edgeVertices=new Set(openingEdges.flatMap(e=>[e.a,e.b])),tankAnchors=Array.from({length:tank.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(tank.attributes.position,i));
transform(tank,(v,i)=>{
  const radial=new T.Vector3(v.x,0,v.z-centerZ).normalize(),fullEase=.010+.005*T.MathUtils.smoothstep(v.y,waistY,neckY-.16),distance=Math.max(0,tankField(v.x,v.y,v.z)),edgeBlend=edgeVertices.has(i)?0:T.MathUtils.smoothstep(distance,.002,.032),ease=v.y<hemY+.03?fullEase:T.MathUtils.lerp(.002,fullEase,edgeBlend);
  v.addScaledVector(radial,ease);
});
tank.computeVertexNormals();
setWeights(tank,torsoWeights);
model.add(tank,materials.tank,'tank','运动背心',[0,.055,.12],'Same adult body topology, geometric neckline/armhole pattern, fitted allowance');
const rimPositions=[],rimSkin=[],rimWeights=[],rimUV=[];
for(const e of openingEdges){const a=new T.Vector3().fromBufferAttribute(tank.attributes.position,e.a),b=new T.Vector3().fromBufferAttribute(tank.attributes.position,e.b),inner=i=>{const p=tankAnchors[i].clone();return p.addScaledVector(new T.Vector3(p.x,0,p.z-centerZ).normalize(),-.001);},ia=inner(e.a),ib=inner(e.b);for(const [p,id]of [[a,e.a],[ia,e.a],[b,e.b],[b,e.b],[ia,e.a],[ib,e.b]]){rimPositions.push(...p.toArray());for(let k=0;k<4;k++){rimSkin.push(tank.attributes.skinIndex.getComponent(id,k));rimWeights.push(tank.attributes.skinWeight.getComponent(id,k));}rimUV.push(0,0);}}
const rim=new T.BufferGeometry();rim.setAttribute('position',new T.Float32BufferAttribute(rimPositions,3));rim.setAttribute('skinIndex',new T.Uint16BufferAttribute(rimSkin,4));rim.setAttribute('skinWeight',new T.Float32BufferAttribute(rimWeights,4));rim.setAttribute('uv',new T.Float32BufferAttribute(rimUV,2));rim.setIndex(Array.from({length:rimPositions.length/3},(_,i)=>i));rim.computeVertexNormals();model.add(rim,materials.binding,'tank_binding','领口与袖窿包边',[0,.065,.14],'Opening walls return into the same body surface; preserve source UV/skin anchors');
history.push({part:'tank',sourceTriangles:bodyGeometry.index.count/3,outputTriangles:tank.index.count/3});
let pants=clip(bodyGeometry,[(x,y)=>waistY-y,(x,y)=>y-ankleY]);
transform(pants,v=>{
  const underHem=T.MathUtils.smoothstep(v.y,hemY-.01,hemY+.018),radial=new T.Vector3(v.x,0,v.z-centerZ).normalize();
  // The hidden waist is inset rather than pushing the approved tank outwards.
  v.addScaledVector(radial,.004-underHem*.004);
});
pants=mergeVertices(pants,1e-6);pants.computeVertexNormals();
setWeights(pants,legWeights);
const legGroups=new Map();for(let i=0;i<pants.index.count;i+=3){const ids=[0,1,2].map(k=>pants.index.getX(i+k)),p=ids.reduce((v,id)=>v.addScaledVector(new T.Vector3().fromBufferAttribute(pants.attributes.position,id),1/3),new T.Vector3()),side=p.x>0?'L':'R',id=p.y>hipY-.045?'leggings_waist':'leggings_'+side;if(!legGroups.has(id))legGroups.set(id,[]);legGroups.get(id).push(...ids);}
for(const [id,indices]of legGroups)model.add(compact(pants,indices),materials.pants,id,id==='leggings_waist'?'瑜伽裤腰胯':(id.endsWith('L')?'左':'右')+'瑜伽裤腿',id==='leggings_waist'?[0,-.045,0]:[id.endsWith('L')?.14:-.14,-.08,0],'Continuous adult pelvis/crotch/leg surface with original skin weights');
history.push({part:'leggings',sourceTriangles:bodyGeometry.index.count/3,outputTriangles:pants.index.count/3});
// Actual removal of covered skin: only neck/head, exposed shoulders/arms and
// hands remain. Hidden torso and leg triangles are absent in exported geometry.
const skin=clip(bodyGeometry,[(x,y,z)=>Math.min(y-waistY,-tankField(x,y,z)+.012)]);
setWeights(skin,(p,i)=>{
  const side=p.x>0?'Left':'Right',x=Math.abs(p.x),elbow=Math.abs(at(side+'ForeArm').x),wrist=Math.abs(at(side+'Hand').x),source=()=>Array.from({length:4},(_,k)=>[skin.attributes.skinIndex.getComponent(i,k),skin.attributes.skinWeight.getComponent(i,k)]);
  if(x<elbow-.09){
    if(p.y<at(side+'Arm').y-.19||p.y>neckY+.025)return source();
    const arm=Math.max(T.MathUtils.smoothstep(x,armX-.065,armX+.16),.5*T.MathUtils.smoothstep(x,armX-.02,armX+.10)),clavicle=(1-arm)*T.MathUtils.smoothstep(x,.05,.13);
    return [[index('Spine2'),1-arm-clavicle],[index(side+'Shoulder'),clavicle],[index(side+'Arm'),arm]];
  }
  if(x>wrist-.035)return source();
  const helper=joints.findIndex(j=>j.name==='Runner_'+side+'ElbowBend'),middle=joints.findIndex(j=>j.name==='Runner_'+side+'ForearmMid');
  if(x<elbow){const t=T.MathUtils.smoothstep(x,elbow-.09,elbow);return [[index(side+'Arm'),1-t],[helper,t]];}
  if(x<elbow+.075){const t=T.MathUtils.smoothstep(x,elbow,elbow+.075);return [[helper,1-t],[middle,t]];}
  const t=T.MathUtils.smoothstep(x,elbow+.075,wrist-.035);return [[middle,1-t],[index(side+'ForeArm'),t]];
});
const skinGroups=new Map();for(let i=0;i<skin.index.count;i+=3){const ids=[0,1,2].map(k=>skin.index.getX(i+k)),p=ids.reduce((v,id)=>v.addScaledVector(new T.Vector3().fromBufferAttribute(skin.attributes.position,id),1/3),new T.Vector3()),id=p.y>neckY-.025&&Math.abs(p.x)<.13?'head_neck':p.x>0?'skin_L':'skin_R';if(!skinGroups.has(id))skinGroups.set(id,[]);skinGroups.get(id).push(...ids);}
for(const[id,indices]of skinGroups)model.add(compact(skin,indices),materials.skin,id,id==='head_neck'?'头颈':(id.endsWith('L')?'左':'右')+'肩臂与手',id==='head_neck'?[0,.16,.02]:[id.endsWith('L')?.25:-.25,0,0]);
model.add(browGeometry,materials.hair,'brows','眉毛',[0,.16,.07]);model.add(eyeGeometry,materials.eyes,'eyes','眼睛',[0,.16,.10]);
const reducedHair=reduceGeometry(hairGeometry,.62,.0015);model.add(reducedHair,materials.hair,'hair','双束发',[0,.22,-.09]);history.push({part:'hair',before:hairGeometry.index.count/3,after:reducedHair.index.count/3,requestedRatio:.62});

for(const [s,label]of [['L','左'],['R','右']]){
  const side=s==='L'?1:-1,foot=at(s==='L'?'LeftFoot':'RightFoot'),joint=joints.findIndex(j=>j.name==='mixamorig'+(s==='L'?'LeftFoot':'RightFoot'));
  const footSource=clip(bodyGeometry,[(x)=>side*x,(x,y)=>ankleY+.005-y]),g=assignRigid(footSource,joint);
  const vertices=Array.from({length:g.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(g.attributes.position,i)),outline=hullXZ(vertices),cx=vertices.reduce((s,p)=>s+p.x,0)/vertices.length,cz=(g.boundingBox.min.z+g.boundingBox.max.z)/2;
  transform(g,v=>{v.x=cx+(v.x-cx)*1.17;v.z=cz+(v.z-cz)*1.09;v.y=Math.max(.028,v.y+.012);});g.computeVertexNormals();
  model.add(g,materials.shoe,'shoe_'+s,label+'运动鞋面',[side*.18,-.18,.07],'Fitted from this adult foot surface, rigid to matching Foot');
  const top=(x,z)=>{let height=-Infinity;const p=g.attributes.position;for(let i=0;i<g.index.count;i+=3){const a=new T.Vector3().fromBufferAttribute(p,g.index.getX(i)),b=new T.Vector3().fromBufferAttribute(p,g.index.getX(i+1)),c=new T.Vector3().fromBufferAttribute(p,g.index.getX(i+2)),den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-10)continue;const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;if(Math.min(u,v,w)>=-1e-6)height=Math.max(height,u*a.y+v*b.y+w*c.y);}if(!Number.isFinite(height))throw Error('Lace endpoint misses actual shoe surface');return height;};
  const laceParts=[],halfWidth=(g.boundingBox.max.x-g.boundingBox.min.x)*.26;
  for(let i=0;i<3;i++)for(const diagonal of [-1,1]){
    const z=foot.z+.026+i*.019,points=Array.from({length:5},(_,k)=>{const t=k/4,x=cx+halfWidth*(2*t-1),depth=z+diagonal*.006*(2*t-1);return new T.Vector3(x,top(x,depth)+.0025,depth);});
    laceParts.push(new T.TubeGeometry(new T.CatmullRomCurve3(points),8,.0018,4,false));
  }
  model.add(assignRigid(mergeGeometries(laceParts),joint),materials.tank,'laces_'+s,label+'运动鞋带',[side*.18,-.16,.12],'Six fitted crossing laces sampled on the actual shoe upper');
  const points=outline.map(v=>new T.Vector2(cx+(v.x-cx)*1.21,cz+(v.z-cz)*1.12)),shape=new T.Shape(points),sole=new T.ExtrudeGeometry(shape,{depth:.029,bevelEnabled:false,steps:1,curveSegments:1});
  // Extrude XY along Z, then map XY to the actual foot's XZ plane.
  transform(sole,v=>{const y=v.y;v.y=.031-v.z;v.z=y;});sole.computeVertexNormals();const indexed=sole.index?sole:mergeVertices(sole,1e-6);assignRigid(indexed,joint);
  model.add(indexed,materials.sole,'sole_'+s,label+'运动鞋底',[side*.18,-.225,.07],'Convex footprint from original foot, 29mm sole, bound to Foot');
}
model.root.userData.runnerConstruction={hemY,waistY,ankleY,neckY,palette,openingBinding:{edges:openingEdges.length,edgeEase:.002,skinOverlap:.012,returnsToSameBody:true,hemAllowanceUnchanged:true},bodyMask:'Recomputed for sleeveless tank, not inherited from teen tee',waist:'Covered leggings waist stays inside tank; visible hips/legs preserve source anatomy',contact:'Sole surface vertical correction; no full foot IK'};
model.root.updateMatrixWorld(true);original.root.updateMatrixWorld(true);

async function portable(root){
  const {json,bin}=readGLB(await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false})),textures=new Map(),chunks=[];let length=(bin.length+3)&~3;
  json.images=[];json.textures=[];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];
  for(const m of json.materials||[]){const f=m.extras?.runnerTexture;if(!f)continue;let index=textures.get(f);if(index===undefined){const data=new Uint8Array(await fs.readFile(path.join(source,f))),view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});chunks.push({data,offset:length});length+=(data.length+3)&~3;index=json.textures.length;json.textures.push({source:json.images.length,sampler:0});json.images.push({bufferView:view,mimeType:'image/png'});textures.set(f,index);}m.pbrMetallicRoughness.baseColorTexture={index};delete m.extras.runnerTexture;}
  const out=new Uint8Array(length);out.set(bin);for(const c of chunks)out.set(c.data,c.offset);json.buffers=[{byteLength:length}];return compressGLB(writeGLB(json,out));
}
const sourceGLB=await portable(original.root),assembled=await portable(model.root);
await fs.writeFile(path.join(destination,'complete-source.glb'),Buffer.from(sourceGLB));await fs.writeFile(path.join(destination,'assembled-running-woman.glb'),Buffer.from(assembled));await fs.copyFile(path.join(source,'License_Standard.txt'),path.join(destination,'License_Standard.txt'));
const report={version:1,source:{author:'Quaternius',asset:'Superhero Female FullBody + Hair Buns',pack:'Universal Base Characters Standard',authorURL:'https://quaternius.com/packs/universalbasecharacters.html',license:'CC0-1.0',mirrorRepository:'https://github.com/kirbycope/godot-3d-player-controller-v2',mirrorCommit:'a928cfa67684352b75a65c510d8751d1f3f2489c',mirrorPath:'assets/universal_base_characters',hashes,bodyProportionsChanged:false,normalization:{barefootHeight,soleLift,scale,translationBeforeScale:offset.toArray()},completeBasePreserved:true,ageBasis:'Independent adult Superhero female author geometry, not Teen or CharaBuilder girl'},choices:{palette,hairstyle:'Source double tied buns',outfit:'Full-length sleeveless athletic tank, opaque fitted ankle-length yoga leggings, running shoes',motion:'Authored in-place 4-second loop; no API call'},before:modelStats(original.root),after:modelStats(model.root),sourceGLBBytes:sourceGLB.byteLength,modelGLBBytes:assembled.byteLength,rig:{totalJoints:joints.length,sourceJoints:baseJointCount,motionTracks:58,legBend,forearmTwist,joints:joints.map(j=>({...j,position:j.position.toArray()}))},construction:model.root.userData.runnerConstruction,history,parts:model.parts.map(m=>({id:m.name,label:m.userData.partLabel,triangles:m.geometry.index.count/3,vertices:m.geometry.attributes.position.count,provenance:m.userData.provenance})),limits:['Adult athletic author proportions retained; not newly sculpted anatomy.','Clothing derives from the same base body, not cloth simulation.','Vertical sole grounding does not constitute full foot IK or a no-sliding guarantee.','Visual validation and actual running checks are reported separately.']};
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(fileURLToPath(new URL('../docs/RUNNING_WOMAN_BUILD.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:report.before,after:report.after,sourceGLBBytes:sourceGLB.byteLength,modelGLBBytes:assembled.byteLength,construction:report.construction,parts:report.parts}));
