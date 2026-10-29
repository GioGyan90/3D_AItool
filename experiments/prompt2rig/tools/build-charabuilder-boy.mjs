import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';
import {MeshoptSimplifier} from '../public/vendor/meshopt/meshopt_simplifier.module.js';
import {reduceGeometry,modelStats} from '../public/lab/optimize.js';
import {readGLB,writeGLB,compressGLB} from '../public/lab/glb-codec.js';

const source=path.resolve(process.env.CHARABUILDER_SOURCE||process.argv[2]||'');
if(!process.env.CHARABUILDER_SOURCE)throw Error('Set CHARABUILDER_SOURCE to a checkout of GioGyan90/CharaBuilder');
const pinned='6ff7fa5c7b451c7318cf445038f1514a646343ea';
if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==pinned)throw Error('Source revision differs from the reviewed preset');
const dist=path.join(source,'dist'),destination=fileURLToPath(new URL('../public/lab/characters/teen-boy/',import.meta.url));
await fs.mkdir(destination,{recursive:true});
const bakeDirectory=await fs.mkdtemp(path.join(tmpdir(),'prompt2rig-teen-'));
globalThis.fetch=async url=>{try{const u=new URL(url);u.search='';return new Response(await fs.readFile(u));}catch{return new Response('',{status:404});}};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
const load=p=>import(pathToFileURL(path.join(dist,p)));
const {loadHumanAssets,ensureHumanPresets,createHuman}=await load('anime.js');
const {parameterDefaults}=await load('parameters.js');
const {hairDefaults,filterHairForGender}=await load('hair.js');
const {wardrobeDefaults}=await load('wardrobe.js');
const state=filterHairForGender({...parameterDefaults,...hairDefaults,...wardrobeDefaults,characterType:'boy',foundationRevision:1,bodySource:'vroid',faceSource:'vroid',gender:'male',height:50,weight:45,shoulders:45,legs:50,faceWidth:50,jawWidth:45,eyeSize:50,eyeSpace:50,nose:50,mouth:50,hair:'modular',frontHair:'swept',backHair:'sidepart',sideHair:'sidepart',braid:'none',hairlineHeight:35,clothes:'shirtPants',shoes:'shoes',expression:'neutral',skin:'#f1cbb2',hairColor:'#332821',eyeColor:'#497b93',shirt:'#f0ece0',pants:'#475569',shoeColor:'#f0ece0',stoneView:'skin',sleeveLength:0,shirtLength:50});
await loadHumanAssets({textures:false});await ensureHumanPresets(state,{textures:false});
const sourceRoot=createHuman(state);sourceRoot.updateMatrixWorld(true);
const uncoveredRoot=createHuman({...state,clothes:"underwear"});uncoveredRoot.updateMatrixWorld(true);
await MeshoptSimplifier.ready;
const height=sourceRoot.userData.height,uniformScale=1.70/height;
const originalBones=sourceRoot.userData.skeleton.bones,humanoid=sourceRoot.userData.motion.humanoid;
const names={hips:'Hips',spine:'Spine',chest:'Spine1',upperChest:'Spine2',neck:'Neck',head:'Head'};
for(const [s,c] of [['left','Left'],['right','Right']]){
 for(const [a,b] of Object.entries({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Hand:'Hand',UpperLeg:'UpLeg',LowerLeg:'Leg',Foot:'Foot',Toes:'ToeBase'}))names[s+a]=c+b;
 for(const [a,b] of [['Thumb','Thumb'],['Index','Index'],['Middle','Middle'],['Ring','Ring'],['Little','Pinky']])for(const [j,k] of [['Proximal',1],['Intermediate',2],['Distal',3]])names[s+a+j]=c+'Hand'+b+k;
}
const canonical=new Map(Object.entries(names).filter(([k])=>humanoid[k]!==undefined).map(([k,n])=>[humanoid[k],'mixamorig'+n]));
const sourceNodes=sourceRoot.children.filter(x=>x.isMesh),sourceStats=modelStats(sourceRoot),textureRows=[],textureCache=new Map();
function portableMaterial(m){
 const unlit=/Eye|FaceBrow/.test(m.name),material=new (unlit?THREE.MeshBasicMaterial:THREE.MeshStandardMaterial)({name:m.name,color:m.color.clone(),side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,depthWrite:m.depthWrite});
 if(!unlit){material.roughness=.9;material.metalness=0;}
 return material;
}
function compact(g,indices){
 const used=[...new Set(indices)],remap=new Map(used.map((id,i)=>[id,i])),out=new THREE.BufferGeometry();
 for(const key of ['position','normal','uv','skinIndex','skinWeight']){const a=g.attributes[key];if(!a)continue;const values=new a.array.constructor(used.length*a.itemSize);for(let j=0;j<used.length;j++)for(let k=0;k<a.itemSize;k++)values[j*a.itemSize+k]=a.getComponent(used[j],k);out.setAttribute(key,new THREE.BufferAttribute(values,a.itemSize,a.normalized));}
 out.setIndex(indices.map(id=>remap.get(id)));out.computeBoundingBox();out.computeBoundingSphere();return out;
}
function cloneBase(){
 const root=new THREE.Group();root.name='CharaBuilder_Boy';
 const world=originalBones.map(b=>b.getWorldPosition(new THREE.Vector3()).multiplyScalar(uniformScale));
 const bones=originalBones.map((b,i)=>{const c=new THREE.Bone();c.name=canonical.get(i)||b.name;const parent=originalBones.indexOf(b.parent);c.position.copy(world[i]).sub(parent>=0?world[parent]:new THREE.Vector3());return c;});
 bones.forEach((b,i)=>{const parent=originalBones.indexOf(originalBones[i].parent);(parent<0?root:bones[parent]).add(b);});root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();return {root,skeleton,bones};
}
const history=[];
async function buildModel(reduce=false){
 const {root,skeleton,bones}=cloneBase();
 root.userData={motionCharacter:true,studyRest:true,preset:'charabuilder-boy',sourceRepo:'GioGyan90/CharaBuilder',sourceRevision:pinned,originalHeight:height,uniformScale,proportions:'source preset, uniform scale only',variant:reduce?'reassembled':'source'};
 const parts=[];let partCounter=0;
 const add=(geometry,material,label,id,offset=[0,0,0],provenance='source')=>{
  const m=new THREE.SkinnedMesh(geometry,material);m.name=id;m.userData={studyPart:true,partId:id,partLabel:label,explosionOffset:offset,provenance};root.add(m);m.bind(skeleton,new THREE.Matrix4());m.frustumCulled=false;parts.push(m);return m;
 };
 for(const sourceMesh of sourceNodes){
  const original=sourceMesh.geometry,part=sourceMesh.userData.part,description=sourceMesh.name;
  if(reduce&&part==='ShirtDetail')continue;
  let g=compact(original,Array.from(original.index.array));
  const p=g.attributes.position,n=g.attributes.normal,normalMatrix=new THREE.Matrix3().getNormalMatrix(sourceMesh.matrixWorld);
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(sourceMesh.matrixWorld).multiplyScalar(uniformScale);p.setXYZ(i,...v.toArray());const nv=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();n.setXYZ(i,...nv.toArray());}
  g.computeBoundingBox();g.computeBoundingSphere();
  let ratio=1;if(reduce){ratio=part==='Pants'?.32:part==='Shirt'?.56:part==='Body'?.52:part.startsWith('Hair')?.22:description.includes('_SKIN')?.8:1;g=reduceGeometry(g,ratio,.004);}
  const material=portableMaterial(sourceMesh.material);
  const texture=sourceMesh.userData.texture;
  if(texture&&part.startsWith('Face')){
    const kind=description.includes('_SKIN')?'face':description.includes('EyeIris')?'iris':'normal';
    const key=texture+'-'+kind+'-'+material.color.getHexString();
    if(!textureCache.has(key)){const filename='texture-'+textureRows.length+'.png';textureCache.set(key,filename);textureRows.push({kind,color:material.color.toArray(),source:path.join(dist,'assets/anime',texture),output:path.join(bakeDirectory,filename)});}
    material.userData.bakedTexture=textureCache.get(key);material.color.set(0xffffff);
  }
  // Split after simplification: new part boundaries therefore retain identical
  // source positions, UVs and weights rather than independently collapsing seams.
  const buttonId=part==='ShirtDetail'?'button_'+partCounter++:null;
  const groups=new Map(),pa=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
  for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],center=new THREE.Vector3();for(const id of ids)center.add(new THREE.Vector3().fromBufferAttribute(pa,id).multiplyScalar(1/3));let id=part,label=part,offset=[0,0,0];
   if(part.startsWith('Face')){id=part+'_'+description;label=part==='FaceEars'?'耳部':description.includes('_SKIN')?'头部皮肤':description.includes('EyeIris')?'虹膜':description.includes('EyeWhite')?'眼白':description.includes('EyeHighlight')?'眼睛高光':description.includes('Brow')?'眉毛':description.includes('Mouth')?'口腔':description.includes('Eyelash')?'睫毛':'眼线';offset=[0,.26,0];}
   else if(part.startsWith('Hair')){id=part+'_'+description;label={HairScalp:'帽内发底',HairFront:'前发',HairBack:'后发',HairSide:'侧发'}[part]||part;offset=part==='HairFront'?[0,.3,.16]:part==='HairBack'?[0,.3,-.16]:[.2,.3,0];}
   else if(part==='Pants'){const crotch=bones[humanoid.hips].getWorldPosition(new THREE.Vector3()).y-.04;const side=center.x>0?'L':'R';id=center.y>crotch?'pants_hip':'pants_'+side;label=id==='pants_hip'?'裤装腰胯':(side==='L'?'左':'右')+'裤腿';offset=id==='pants_hip'?[0,-.06,0]:[side==='L'?.18:-.18,-.1,0];}
   else if(part==='Shirt'){const side=center.x>0?'L':'R',shoulder=bones[humanoid[side==='L'?'leftUpperArm':'rightUpperArm']].getWorldPosition(new THREE.Vector3());id=Math.abs(center.x)>Math.abs(shoulder.x)+.015?'sleeve_'+side:'shirt_torso';label=id==='shirt_torso'?(reduce?'T 恤躯干':'原上衣躯干'):(side==='L'?'左':'右')+'短袖';offset=id==='shirt_torso'?[0,.07,.10]:[side==='L'?.22:-.22,.05,0];}
   else if(part==='Body'){
    const side=center.x>0?'L':'R';
    if(description.includes('Shoes')){id='shoe_'+side;label=(side==='L'?'左':'右')+'鞋面';offset=[side==='L'?.21:-.21,-.23,.08];}
    else if(center.y<.20){id='ankle_'+side;label=(side==='L'?'左':'右')+'脚踝';offset=[side==='L'?.21:-.21,-.15,0];}
    else if(center.y>1.30&&Math.abs(center.x)<.19){id='neck_scalp';label='颈部与后脑';offset=[0,.18,-.04];}
    else{const handBone=humanoid[side==='L'?'leftHand':'rightHand'],handWeight=ids.reduce((sum,id)=>sum+[0,1,2,3].reduce((w,k)=>w+(si.getComponent(id,k)===handBone?sw.getComponent(id,k):0),0),0)/3;id=(handWeight>.4?'hand_':'arm_')+side;label=(side==='L'?'左':'右')+(handWeight>.4?'手部':'手臂');offset=[side==='L'?.3:-.3,0,.04];}
   }else if(part==='ShirtDetail'){id=buttonId;label='原衬衫纽扣';offset=[0,.07,.10];}
   if(!groups.has(id))groups.set(id,{indices:[],label,offset});groups.get(id).indices.push(...ids);
  }
  for(const [id,info]of groups)add(compact(g,info.indices),material,info.label,id,info.offset);
  history.push({variant:reduce?'reassembled':'source',part,material:description,before:original.index.count/3,after:g.index.count/3,requestedRatio:ratio});
 }
 root.updateMatrixWorld(true);return {root,parts,skeleton,bones,add};
}

const original=await buildModel(false),modified=await buildModel(true);
// Accessory construction is isolated from the retained author geometry.
const {addBoyAccessories,removeCoveredBody}=await import('./teen-boy-accessories.mjs');
const {buildFittedTee}=await import('./teen-shirt.mjs');
const skinSource=uncoveredRoot.children.find(m=>m.isMesh&&m.userData.part==='Body'&&m.name.includes('_SKIN'));
if(!skinSource)throw Error('Same-preset unmasked body was not found');
const shirtTemplate=compact(skinSource.geometry,Array.from(skinSource.geometry.index.array)),tp=shirtTemplate.attributes.position,tn=shirtTemplate.attributes.normal,nm=new THREE.Matrix3().getNormalMatrix(skinSource.matrixWorld);
for(let i=0;i<tp.count;i++){const p=new THREE.Vector3().fromBufferAttribute(tp,i).applyMatrix4(skinSource.matrixWorld).multiplyScalar(uniformScale),n=new THREE.Vector3().fromBufferAttribute(tn,i).applyMatrix3(nm).normalize();tp.setXYZ(i,...p.toArray());tn.setXYZ(i,...n.toArray());}
modified.root.userData.shirtConstruction=buildFittedTee(modified,humanoid,shirtTemplate);
const bodyCleanup=removeCoveredBody(modified,humanoid);
addBoyAccessories(modified,humanoid);
execFileSync('python',[fileURLToPath(new URL('./bake-character-textures.py',import.meta.url)),await (async()=>{const p=path.join(bakeDirectory,'texture-build.json');await fs.writeFile(p,JSON.stringify(textureRows));return p;})()],{stdio:'inherit'});
async function exportPortable(root){
 const raw=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false});
 const {json,bin}=readGLB(raw),chunks=[bin],textures=new Map();let length=(bin.length+3)&~3;
 json.images=[];json.textures=[];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];
 for(const material of json.materials||[]){const filename=material.extras?.bakedTexture;if(!filename)continue;let texture=textures.get(filename);
  if(texture===undefined){const data=new Uint8Array(await fs.readFile(path.join(bakeDirectory,filename))),view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});chunks.push({data,offset:length});length+=(data.length+3)&~3;const source=json.images.length;json.images.push({bufferView:view,mimeType:'image/png'});texture=json.textures.length;json.textures.push({source,sampler:0});textures.set(filename,texture);}
  material.pbrMetallicRoughness.baseColorTexture={index:texture};delete material.extras.bakedTexture;
 }
 const output=new Uint8Array(length);output.set(bin);for(const chunk of chunks.slice(1))output.set(chunk.data,chunk.offset);json.buffers=[{byteLength:length}];return compressGLB(writeGLB(json,output));
}
const originalGLB=await exportPortable(original.root),modelGLB=await exportPortable(modified.root);
await fs.writeFile(path.join(destination,'source-preset.glb'),Buffer.from(originalGLB));await fs.writeFile(path.join(destination,'reassembled-boy.glb'),Buffer.from(modelGLB));
const report={version:1,source:{repository:'https://github.com/GioGyan90/CharaBuilder',commit:pinned,preset:'boy / vroid / swept fringe / shirtPants',state,uniformScale,bodyProportionsChanged:false},bodyCleanup,shirtConstruction:modified.root.userData.shirtConstruction,capOpening:modified.root.userData.capOpening,before:sourceStats,compactedSource:modelStats(original.root),after:modelStats(modified.root),sourceGLBBytes:originalGLB.byteLength,modelGLBBytes:modelGLB.byteLength,history,parts:modified.parts.filter(p=>p.parent).map(m=>({id:m.name,label:m.userData.partLabel,triangles:m.geometry.index.count/3,vertices:m.geometry.attributes.position.count,provenance:m.userData.provenance})),added:['backwards cap crown, brim, contrasting strap, brass buckle, button','sneaker soles','continuous fitted shirt from the same source body topology and crew-neck ribbing'],removed:['six generated shirt buttons','standing shirt collar','covered hair tips inside cap','body skin concealed inside shirt and sleeves'],limits:['Material-separated parts can have open seams; this is not a new watertight retopology.','Facial expressions and the original character editor are not ported.','The source head/body proportions are retained; generated concept is an outfit reference only.']};
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(report,null,2)+'\n');
await fs.copyFile(path.join(destination,'manifest.json'),fileURLToPath(new URL('../docs/CHARABUILDER_BOY_VALIDATION.json',import.meta.url)));
await fs.writeFile(path.join(destination,'preset-state.json'),JSON.stringify(state,null,2)+'\n');
for(const file of await fs.readdir(destination))if(file==='texture-build.json'||(file.startsWith('texture-')&&file.endsWith('.png')))await fs.unlink(path.join(destination,file));
await fs.rm(bakeDirectory,{recursive:true,force:true});
console.log(JSON.stringify({before:report.before,after:report.after,sourceGLBBytes:report.sourceGLBBytes,modelGLBBytes:report.modelGLBBytes}));
