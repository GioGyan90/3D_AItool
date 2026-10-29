import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {parseCharacter,exportCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {registerStudyModel,getProceduralParts,setProceduralView,proceduralSettings} from '../public/lab/procedural-character.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {applyRetarget,retargetTake} from '../public/lab/motion-plan.js';
const directory=new URL('../public/lab/characters/teen-boy/',import.meta.url);
const report=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
async function load(name){const bytes=new Uint8Array(await fs.readFile(new URL(name,directory))),{json,bin}=readGLB(bytes);for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];const gltf=await parseCharacter(writeGLB(json,bin));gltf.scene.updateMatrixWorld(true);return gltf.scene;}
function meshes(root){const list=[];root.traverse(o=>{if(o.isMesh)list.push(o);});return list;}
const key=v=>v.toArray().map(x=>Math.round(x*1e5)).join(',');

test('reassembled boy keeps source skeleton proportions and retained author vertices',async()=>{
 const source=await load('source-preset.glb'),target=await load('reassembled-boy.glb'),sourceBones=new Map();source.traverse(b=>{if(b.isBone)sourceBones.set(b.name,b.getWorldPosition(new THREE.Vector3()));});
 target.traverse(b=>{if(b.isBone)assert.ok(b.getWorldPosition(new THREE.Vector3()).distanceTo(sourceBones.get(b.name))<1e-7,b.name+' changed proportion');});
 const sourcePositions=new Set();for(const mesh of meshes(source))for(let i=0;i<mesh.geometry.attributes.position.count;i++)sourcePositions.add(key(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)));
 let checked=0;for(const mesh of meshes(target)){if(mesh.userData.provenance!=='source'||/shirt|sleeve/.test(mesh.name))continue;for(let i=0;i<mesh.geometry.attributes.position.count;i++){assert.ok(sourcePositions.has(key(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i))),mesh.name+' invented vertex');checked++;}}
 assert.ok(checked>3000);assert.equal(report.source.bodyProportionsChanged,false);assert.ok(report.after.triangles<report.before.triangles*.7);assert.ok(report.modelGLBBytes<report.sourceGLBBytes);
});

test('all prepared meshes retain finite UVs and normalized, valid skin weights',async()=>{
 const root=await load('reassembled-boy.glb'),prepared=prepareRig(root);assert.equal(prepared.missing.length,0);assert.equal(prepared.rig.order.length,52);
 for(const mesh of meshes(root)){const g=mesh.geometry,sw=g.attributes.skinWeight,si=g.attributes.skinIndex;assert.ok(g.index.count>0);for(let i=0;i<g.attributes.position.count;i++){let total=0;for(let j=0;j<4;j++){const w=sw.getComponent(i,j);assert.ok(Number.isFinite(w)&&w>=0);assert.ok(si.getComponent(i,j)<mesh.skeleton.bones.length);total+=w;}assert.ok(Math.abs(total-1)<2e-6);}for(const a of Object.values(g.attributes))assert.ok(Array.from(a.array).every(Number.isFinite),mesh.name);}
 const shaderImages=readGLB(new Uint8Array(await fs.readFile(new URL('reassembled-boy.glb',directory))));assert.ok(shaderImages.json.images.length>=7);for(const image of shaderImages.json.images){const view=shaderImages.json.bufferViews[image.bufferView];assert.equal(view.buffer,0);assert.equal(shaderImages.bin[view.byteOffset],137);assert.equal(shaderImages.bin[view.byteOffset+1],80);}
});

test('shirt and sleeve split boundaries preserve shared positions and weights',async()=>{
 const root=await load('reassembled-boy.glb'),groups=new Map();for(const mesh of meshes(root).filter(m=>/^(shirt_torso|sleeve_[LR])$/.test(m.name))){const g=mesh.geometry;for(let i=0;i<g.attributes.position.count;i++){const k=key(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i));if(!groups.has(k))groups.set(k,[]);groups.get(k).push({mesh,i});}}
 let pairs=0;for(const entries of groups.values()){if(new Set(entries.map(e=>e.mesh.name)).size<2)continue;pairs++;const first=entries[0];const weights=e=>{const map=new Map();for(let k=0;k<4;k++){const weight=e.mesh.geometry.attributes.skinWeight.getComponent(e.i,k);if(weight>1e-6)map.set(e.mesh.skeleton.bones[e.mesh.geometry.attributes.skinIndex.getComponent(e.i,k)].name,weight);}return map;};const baseline=weights(first);for(const entry of entries.slice(1)){const w=weights(entry);assert.equal(w.size,baseline.size);for(const [name,value]of baseline)assert.ok(Math.abs(value-w.get(name))<2e-6);}}
 assert.ok(pairs>=5,'shirt split no longer has shared seam vertices');
});

test('backwards brim stays behind the head and all cap parts follow the head in distinct motions',async()=>{
 const root=await load('reassembled-boy.glb'),target=prepareRig(root).rig,driver=new Rig(createCharacter()),parts=meshes(root).filter(m=>m.name.startsWith('cap_'));
 const brim=parts.find(m=>m.name==='cap_brim');brim.geometry.computeBoundingBox();assert.ok(brim.geometry.boundingBox.max.z<target.rest.Head.wp.z-.05);
 const reference=new Map();for(const part of parts){const p=new THREE.Vector3().fromBufferAttribute(part.geometry.attributes.position,0);reference.set(part.name,p.applyMatrix4(target.bones.Head.matrixWorld.clone().invert()));}
 for(const motion of MOTIONS){const take=bakeMotion(driver,motion);for(const t of [0,motion.duration*.35,motion.duration*.7]){driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);root.updateMatrixWorld(true);for(const part of parts){const p=part.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(part.matrixWorld).applyMatrix4(target.bones.Head.matrixWorld.clone().invert());assert.ok(p.distanceTo(reference.get(part.name))<2e-6,part.name+' detached');}}}
});

test('assembled export restores UV/materials and keeps the inspection state after an animated GLB export',async()=>{
 const root=await load('reassembled-boy.glb');registerStudyModel(root);const target=prepareRig(root).rig,driver=new Rig(createCharacter()),take={...MOTIONS[0],...bakeMotion(driver,MOTIONS[0])},clip=retargetTake(driver,target,take);
 const original=getProceduralParts(root).map(p=>({id:p.id,position:Float32Array.from(p.rest)}));setProceduralView(root,{surface:'grey',isolated:'cap_brim',explosion:.75,wireframe:true});const before=proceduralSettings(root),result=await exportCharacter(root,[clip]);assert.deepEqual(proceduralSettings(root),before);
 const loaded=await parseCharacter(result),reloaded=meshes(loaded.scene);assert.equal(reloaded.length,original.length);assert.equal(loaded.animations.length,1);for(const part of original){const actual=reloaded.find(p=>p.name===part.id);assert.deepEqual(actual.geometry.attributes.position.array,part.position);assert.equal(actual.material.wireframe,false);}
});

test('wave retarget preserves the hand direction and presents the anatomical palm forward',async()=>{
 const root=await load('reassembled-boy.glb'),target=prepareRig(root).rig,driver=new Rig(createCharacter()),take=bakeMotion(driver,MOTIONS[0]);
 for(const t of [1.1,1.6,2.2,2.8]){
  driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);
  for(const side of ['Left','Right']){
   const at=n=>target.bones[side+n].getWorldPosition(new THREE.Vector3()),hand=at('Hand'),along=at('HandMiddle1').sub(hand).normalize();
   const palm=along.clone().cross(at('HandIndex1').sub(at('HandPinky1'))).multiplyScalar(side==='Left'?1:-1).normalize();
   const delta=driver.bones[side+'Hand'].getWorldQuaternion(new THREE.Quaternion()).multiply(driver.rest[side+'Hand'].wq.clone().invert());
   const expected=new THREE.Vector3(0,0,1).applyQuaternion(delta);
   assert.ok(palm.dot(expected)>.99,side+' palm is edge-on or reversed');
   const wanted=driver.bones[side+'HandMiddle1'].getWorldPosition(new THREE.Vector3()).sub(driver.bones[side+'Hand'].getWorldPosition(new THREE.Vector3())).normalize();
   assert.ok(along.dot(wanted)>.999,side+' fingers point away from the authored hand direction');
  }
 }
 const clip=retargetTake(driver,target,{...MOTIONS[0],...take}),mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();mixer.setTime(1.6);root.updateMatrixWorld(true);
 const wrist=target.bones.RightHand.getWorldPosition(new THREE.Vector3()),along=target.bones.RightHandMiddle1.getWorldPosition(new THREE.Vector3()).sub(wrist).normalize(),across=target.bones.RightHandIndex1.getWorldPosition(new THREE.Vector3()).sub(target.bones.RightHandPinky1.getWorldPosition(new THREE.Vector3()));
 assert.ok(along.cross(across).negate().normalize().z>.9,'baked wave lost its forward-facing palm');
});

test('fixed outfit has unique part IDs and removes the previously exposed shoulder skin',async()=>{
 const root=await load('reassembled-boy.glb'),parts=meshes(root);assert.equal(new Set(parts.map(m=>m.name)).size,parts.length);assert.equal(report.source.state.frontHair,'swept');
 const shoulder=parts.find(m=>m.name==='neck_scalp'),p=shoulder.geometry.attributes.position,cut=report.bodyCleanup.find(r=>r.part==='neck_scalp');
 for(let i=0;i<p.count;i++){
  assert.ok(p.getY(i)>=cut.cutY-1e-6);
  if(p.getY(i)<cut.clearAbove-.003){const [x,z]=cut.center,angle=((Math.atan2(p.getZ(i)-z,p.getX(i)-x)/(Math.PI*2))%1+1)%1*32,j=Math.floor(angle),t=angle-j,r=cut.aperture[j]*(1-t)+cut.aperture[(j+1)%32]*t;
   assert.ok(Math.hypot(p.getX(i)-x,p.getZ(i)-z)<=r+.002,'shoulder skin survives outside the neck opening');}
 }
 assert.ok(cut.after<cut.before*.7,'covered shoulder skin was not removed');
 const target=prepareRig(root).rig,driver=new Rig(createCharacter()),take=bakeMotion(driver,MOTIONS[0]);driver.applySnapshot(take.track.sample(1.6));applyRetarget(driver,target);root.updateMatrixWorld(true);
 // The collar trim must retain the exposed throat under a tilted chin.
 const neckY=target.bones.Neck.getWorldPosition(new THREE.Vector3()).y;
 for(const x of [-.003,0,.003]){const ray=new THREE.Raycaster(new THREE.Vector3(x,neckY+.046,1),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(shoulder).length>0,'neck trim opened a hole below the chin');}

 // Exposed hands, lower arms and ankles must survive the clothing cut.
 for(const id of ['hand_L','hand_R','arm_L','arm_R','ankle_L','ankle_R'])assert.ok(parts.find(m=>m.name===id)?.geometry.index.count>50,id+' was deleted with the hidden skin');
});
