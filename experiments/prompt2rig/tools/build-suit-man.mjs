import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';
import {MeshoptSimplifier} from '../public/vendor/meshopt/meshopt_simplifier.module.js';
import {mergeVertices} from '../public/vendor/utils/BufferGeometryUtils.js';
import {reduceGeometry,modelStats} from '../public/lab/optimize.js';
import {compressGLB} from '../public/lab/glb-codec.js';
import {tailorSuitGeometry} from './suit-tailoring.mjs';

// Download the pinned, hash-checked author asset mirror; never overwrite it.
const sourceFile=process.env.SUIT_MAN_SOURCE||process.argv[2];
if(!sourceFile)throw Error('Set SUIT_MAN_SOURCE to the reviewed Business Man.glb (see characters/suit-man/SOURCES.md)');
const sourceBytes=await fs.readFile(sourceFile),sourceHash='82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e';
if(createHash('sha256').update(sourceBytes).digest('hex')!==sourceHash)throw Error('Business Man source hash differs from the reviewed file');
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
const gltf=await parseCharacter(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength)),source=gltf.scene;
source.updateMatrixWorld(true);
const sourceMeshes=[];source.traverse(o=>{if(o.isSkinnedMesh)sourceMeshes.push(o);});
for(const mesh of sourceMeshes)if(mesh.skeleton.bones.some((b,i)=>b.name!==sourceMeshes[0].skeleton.bones[i]?.name))throw Error('Source skin joint orders differ; explicitly remap skin indices first');
const primary=source.getObjectByName('Suit_Legs').skeleton;
// The FBX conversion opens in an asymmetric animation pose. Restore the bind
// matrices ONCE: the four skin objects share joints but have different IBMs.
primary.pose();source.updateMatrixWorld(true);
const sourceBones=primary.bones,bindPositions=sourceBones.map(b=>b.getWorldPosition(new THREE.Vector3()));
const normal=new THREE.Vector3(),v=new THREE.Vector3(),sum=new THREE.Vector3();
function compact(g,indices){
  const used=[...new Set(indices)],remap=new Map(used.map((id,i)=>[id,i])),out=new THREE.BufferGeometry();
  for(const [name,a]of Object.entries(g.attributes)){
    const ArrayType=a.isInterleavedBufferAttribute?a.data.array.constructor:a.array.constructor,array=new ArrayType(used.length*a.itemSize);
    // getComponent returns normalized values, so use floating point attributes
    // when needed instead of quantizing them a second time.
    const values=a.normalized?new Float32Array(used.length*a.itemSize):array;
    for(let i=0;i<used.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(used[i],k);
    out.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
  }
  out.setIndex(indices.map(i=>remap.get(i)));out.computeBoundingBox();out.computeBoundingSphere();return out;
}
const baked=sourceMeshes.map(mesh=>{
  const g=compact(mesh.geometry,Array.from(mesh.geometry.index.array)),p=g.attributes.position,n=g.attributes.normal,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
  const skinMatrices=mesh.skeleton.bones.map((b,i)=>new THREE.Matrix4().multiplyMatrices(b.matrixWorld,mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
  const normals=skinMatrices.map(m=>new THREE.Matrix3().setFromMatrix4(m));
  for(let i=0;i<p.count;i++){
    normal.fromBufferAttribute(p,i);sum.set(0,0,0);
    for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w)sum.add(v.copy(normal).applyMatrix4(skinMatrices[si.getComponent(i,k)]).multiplyScalar(w));}
    p.setXYZ(i,...sum.toArray());
    normal.fromBufferAttribute(n,i);sum.set(0,0,0);
    for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w)sum.add(v.copy(normal).applyMatrix3(normals[si.getComponent(i,k)]).multiplyScalar(w));}
    sum.normalize();n.setXYZ(i,...sum.toArray());
  }
  return {mesh,geometry:g,material:mesh.material};
});
const box=new THREE.Box3();for(const {geometry}of baked)box.union(new THREE.Box3().setFromBufferAttribute(geometry.attributes.position));
const sourceHeight=box.max.y-box.min.y,scale=1.8/sourceHeight,offset=new THREE.Vector3(-(box.min.x+box.max.x)/2,-box.min.y,0);
const normalize=p=>p.add(offset).multiplyScalar(scale);
for(const {geometry}of baked){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);normalize(v);p.setXYZ(i,...v.toArray());}geometry.computeBoundingBox();geometry.computeBoundingSphere();}
const names={Body:'Hips',Abdomen:'Spine',Torso:'Spine1',Chest:'Spine2',Neck:'Neck',Head:'Head'};
for(const [s,c]of [['L','Left'],['R','Right']]){
  for(const [a,b]of Object.entries({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Wrist:'Hand',UpperLeg:'UpLeg',LowerLeg:'Leg',Foot:'Foot'}))names[a+s]=c+b;
  // *1 is a coincident palm helper in this source; *2 is the true MCP joint.
  for(const f of ['Index','Middle','Ring','Pinky'])for(let k=2;k<=4;k++)names[f+k+s]=c+'Hand'+f+(k-1);
  names['Thumb2'+s]=c+'HandThumb1';names['Thumb3'+s]=c+'HandThumb2';
}
const joints=sourceBones.map((bone,i)=>({source:bone.name,name:names[bone.name]?'mixamorig'+names[bone.name]:'Suit_'+bone.name,position:normalize(bindPositions[i].clone()),parent:sourceBones.indexOf(bone.parent)}));
// Author feet are independent IK controllers. Parent them into the deforming
// chain, keeping exactly the same world-space pivot and the same skin indices.
const reparented=[];
for(const [s,c]of [['L','Left'],['R','Right']]){
  const foot=joints.findIndex(b=>b.source==='Foot'+s),leg=joints.findIndex(b=>b.source==='LowerLeg'+s);
  joints[foot].parent=leg;reparented.push({joint:'Foot'+s,from:'Root',to:'LowerLeg'+s,pivotPreserved:true});
  for(const [sourceName,name,parent]of [['Foot'+s+'_end',c+'ToeBase',foot],['Thumb3'+s+'_end',c+'HandThumb3',joints.findIndex(b=>b.source==='Thumb3'+s)]]){
    // GLTFLoader sanitizes periods in animation names and node names.
    const node=source.getObjectByName(sourceName);if(!node)throw Error('Missing source endpoint '+sourceName);
    joints.push({source:sourceName,name:'mixamorig'+name,parent,position:normalize(node.getWorldPosition(new THREE.Vector3()))});
  }
}
const shoulderRhythm={gain:.3,maxLift:.32,protractionGain:.35,maxProtraction:.35,minProtraction:-.16},forearmTwist=[];
for(const side of ['Left','Right']){
  const forearm=joints.findIndex(j=>j.name==='mixamorig'+side+'ForeArm'),arm=joints.findIndex(j=>j.name==='mixamorig'+side+'Arm'),name='Suit_'+side+'ForearmTwist';
  joints.push({source:null,name,parent:arm,position:joints[forearm].position.clone()});
  const middleBone='Suit_'+side+'ForearmMid';joints.push({source:null,name:middleBone,parent:arm,position:joints[forearm].position.clone()});
  forearmTwist.push({bone:name,middleBone,arm:side+'Arm',forearm:side+'ForeArm',hand:side+'Hand',fraction:.25,swingFraction:.5});
}
await MeshoptSimplifier.ready;
const history=[];
const palette={Suit:['#293d53',.91],Black:['#24262b',.38],White:['#f3f0e7',.94],Tie:['#893e52',.78],Skin:['#dbb497',.88],Hair:['#29252b',.97],Eyebrows:['#29252b',.98],Eye:['#292b32',.8]};
const destination=fileURLToPath(new URL('../public/lab/characters/suit-man/',import.meta.url));await fs.mkdir(destination,{recursive:true});
const at=name=>joints.find(b=>b.name==='mixamorig'+name).position;
const hipY=at('Hips').y,armX=Math.abs(at('LeftArm').x),neckY=at('Neck').y;
function simplifyFaceted(g,ratio){
  if(ratio>=1)return g.clone();
  // Every polygon in this FBX has split normals. Weld the disposable normals
  // first, but retain UV and all skin attributes as weld boundaries. Rebuild
  // flat normals after reduction instead of locking every faceted edge.
  const clean=g.clone();clean.deleteAttribute('normal');const welded=mergeVertices(clean,1e-7),reduced=reduceGeometry(welded,ratio,.0025);
  if(reduced.index.count===g.index.count)return g.clone();
  const flat=reduced.toNonIndexed();flat.computeVertexNormals();return mergeVertices(flat,1e-7);
}
function classify(mesh,material,p){
  const side=p.x>=0?'L':'R',label=side==='L'?'左':'右',x=side==='L'?.24:-.24;
  if(mesh.name==='Suit_Legs')return p.y>hipY+.055?['trouser_waist','西裤腰胯',[0,-.07,-.04]]:['trouser_'+side,label+'西裤腿',[side==='L'?.15:-.15,-.1,0]];
  if(mesh.name==='Suit_Feet')return ['shoe_'+side,label+'皮鞋',[side==='L'?.18:-.18,-.18,.06]];
  if(mesh.name.startsWith('Suit_Head'))return ({Skin:['head','头颈',[0,.22,.01]],Hair:['hair','侧分短发',[0,.29,-.05]],Eyebrows:['brows','眉毛',[0,.23,.13]],Eye:['eyes','眼睛',[0,.23,.15]]})[material.name];
  if(material.name==='Skin')return ['hand_'+side,label+'手部',[side==='L'?.33:-.33,0,.04]];
  if(material.name==='Tie')return ['tie','酒红领带',[0,.06,.22]];
  if(material.name==='White')return Math.abs(p.x)>armX+.04?['cuff_'+side,label+'衬衫袖口',[x,0,.07]]:p.y>neckY-.035?['collar','衬衫领口',[0,.13,.12]]:['shirt_front','内搭衬衫',[0,.06,.14]];
  return Math.abs(p.x)>armX+.018?['jacket_sleeve_'+side,label+'西装衣袖',[x,.04,.03]]:['jacket_body','西装衣身',[0,.06,.09]];
}
async function build(reduce){
  const root=new THREE.Group();root.name=reduce?'Young_Man_Suit':'Business_Man_Source_Reference';
  root.userData={motionCharacter:true,studyRest:true,restPoseLabel:'T 姿势',preset:'quaternius-suit-man',variant:reduce?'assembled':'source-reference',height:1.8,sourceAuthor:'Quaternius',sourceHash,headFocus:[0,1.635,.035],headSpan:.53,frameCenter:[0,.92,0],frameSpan:2.12,...(reduce?{forearmTwist,shoulderRhythm}: {})};
  const bones=joints.map(j=>{const b=new THREE.Bone();b.name=j.name;b.position.copy(j.position).sub(j.parent>=0?joints[j.parent].position:new THREE.Vector3());return b;});
  bones.forEach((b,i)=>(joints[i].parent<0?root:bones[joints[i].parent]).add(b));root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
  const parts=[];
  for(const {mesh,geometry,material}of baked){
    const ratio=!reduce?1:material.name==='Hair'?.42:material.name==='Skin'&&mesh.name.startsWith('Suit_Body')?.75:mesh.name==='Suit_Legs'?.78:mesh.name==='Suit_Feet'?.72:material.name==='Suit'?.85:1;
    const simplified=reduce?simplifyFaceted(geometry,ratio):geometry.clone(),g=reduce&&mesh.name.startsWith('Suit_Body')?tailorSuitGeometry(simplified,joints,material.name):simplified;
    const mat=material.clone();mat.metalness=0;
    if(reduce){const [color,roughness]=palette[material.name];mat.color.set(color);mat.roughness=roughness;}else mat.roughness=.8;
    mat.side=THREE.FrontSide;
    const groups=new Map();
    for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],center=new THREE.Vector3();for(const id of ids)center.add(v.fromBufferAttribute(g.attributes.position,id).multiplyScalar(1/3));const [id,label,explosionOffset]=classify(mesh,material,center);if(!groups.has(id))groups.set(id,{label,explosionOffset,indices:[]});groups.get(id).indices.push(...ids);}
    for(const [id,group]of groups){const part=new THREE.SkinnedMesh(compact(g,group.indices),mat);part.name=id;part.userData={studyPart:true,partId:id,partLabel:group.label,explosionOffset:group.explosionOffset,provenance:'Quaternius Business Man',sourceMesh:mesh.name,sourceMaterial:material.name};part.frustumCulled=false;root.add(part);part.bind(skeleton,new THREE.Matrix4());parts.push(part);}
    if(reduce)history.push({sourceMesh:mesh.name,material:material.name,before:geometry.index.count/3,afterSimplify:simplified.index.count/3,after:g.index.count/3,requestedRatio:ratio});
  }
  root.updateMatrixWorld(true);return {root,parts};
}
const original=await build(false),modified=await build(true);
async function portable(root){return compressGLB(await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false}));}
const comparison=await portable(original.root),assembled=await portable(modified.root);
await fs.writeFile(path.join(destination,'source-reference.glb'),Buffer.from(comparison));await fs.writeFile(path.join(destination,'assembled-suit-man.glb'),Buffer.from(assembled));
const report={version:1,source:{author:'Quaternius',asset:'Business Man',pack:'Ultimate Modular Men Pack',authorURL:'https://quaternius.com/packs/ultimatemodularcharacters.html',assetURL:'https://poly.pizza/m/JFrLIKqvCH',license:'CC0-1.0',mirrorRepository:'https://github.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic',mirrorCommit:'6d6de54a1d7143cf5487462d147bbef039de4837',mirrorPath:'assets/Ultimate Modular Men Pack-glb/Business Man.glb',sha256:sourceHash,bytes:sourceBytes.byteLength,sourceHeight,uniformScale:scale,translationBeforeScale:offset.toArray(),bodyProportionsChanged:false,originalAnimations:gltf.animations.length},before:modelStats(source),compactedSource:modelStats(original.root),after:modelStats(modified.root),sourceGLBBytes:sourceBytes.byteLength,comparisonGLBBytes:comparison.byteLength,modelGLBBytes:assembled.byteLength,rig:{canonicalBones:52,motionTracks:56,forearmTwist,sourceJoints:sourceBones.length,totalJoints:joints.length,reparented,rest:'author bind pose, common world coordinates, identity rest rotations',fingerMapping:'Source Index/Middle/Ring/Pinky 2..4 map to canonical 1..3; source 1 is a palm helper.',shoulderRhythm,joints:joints.map(j=>({source:j.source,name:j.name,parent:j.parent<0?null:joints[j.parent].name,position:j.position.toArray()}))},outfit:{construction:'Retain authored jacket, shirt, tie, trousers, shoes and exposed hands/head; no invented torso under the jacket.',palette:Object.fromEntries(Object.entries(palette).map(([name,[color]])=>[name,color])),shoulderElbow:'Shared midpoint refinement and an anatomical weight field on the original jacket/shirt surface; four auxiliary elbow/forearm bones distribute bend and forearm twist. No global expansion.',layering:'Authored shirt front and cuffs are retained. Skin in the body mesh consists of hands, not a hidden torso; no duplicate full body is added.',fit:'Source suit proportions retained; no global jacket expansion or trouser-leg resizing.'},history,parts:modified.parts.map(m=>({id:m.name,label:m.userData.partLabel,triangles:m.geometry.index.count/3,vertices:m.geometry.attributes.position.count,sourceMesh:m.userData.sourceMesh,material:m.userData.sourceMaterial})),limits:['A low-poly adult adaptation of an existing CC0 asset, not a newly sculpted or scanned person.','Source reference has normalized bind pose and the same foot hierarchy repair as the assembled model; exact untouched source is linked and hash-pinned separately.','Native 24 animations are kept in the untouched source mirror, not carried into the remapped asset. Motion Lab generates and retargets its own clips.','No complete naked body, facial expression rig, cloth simulation, or visual browser acceptance is claimed.']};
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(fileURLToPath(new URL('../docs/SUIT_MAN_BUILD.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:report.before,after:report.after,sourceHeight,sourceGLBBytes:report.sourceGLBBytes,comparisonGLBBytes:report.comparisonGLBBytes,modelGLBBytes:report.modelGLBBytes,parts:report.parts.map(p=>({id:p.id,triangles:p.triangles}))}));
