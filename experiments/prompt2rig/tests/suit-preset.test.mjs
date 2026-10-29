import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {parseCharacter,exportCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {loadSuitPreset} from '../public/lab/suit-preset.js';
import {registerStudyModel,setProceduralView,proceduralSettings,getProceduralParts} from '../public/lab/procedural-character.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {applyRetarget,retargetTake} from '../public/lab/motion-plan.js';

const directory=new URL('../public/lab/characters/suit-man/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
async function load(name='assembled-suit-man.glb'){const b=new Uint8Array(await fs.readFile(new URL(name,directory)));return (await parseCharacter(b.buffer)).scene;}
const meshes=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o);});return a;};
const check=(script,args=[])=>JSON.parse(execFileSync(process.execPath,['--experimental-loader',fileURLToPath(new URL('./vendor-loader.mjs',import.meta.url)),fileURLToPath(new URL('../tools/'+script,import.meta.url)),fileURLToPath(new URL('assembled-suit-man.glb',directory)),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));

test('suit asset keeps independent adult source proportions and valid exposed parts',async()=>{
  const source=await load('source-reference.glb'),target=await load(),a=prepareRig(source).rig,b=prepareRig(target).rig;
  assert.equal(manifest.source.author,'Quaternius');assert.equal(manifest.source.license,'CC0-1.0');assert.equal(manifest.source.bodyProportionsChanged,false);
  for(const n of a.order)assert.ok(a.rest[n].wp.distanceTo(b.rest[n].wp)<1e-7,n+' source pivot moved');
  const box=new THREE.Box3().setFromObject(target);assert.ok(Math.abs(box.min.y)<1e-6);assert.ok(Math.abs(box.max.y-1.8)<1e-6);
  assert.equal(meshes(target).length,19);assert.ok(manifest.after.triangles<10000);assert.ok(manifest.history.reduce((n,p)=>n+p.afterSimplify,0)<manifest.before.triangles);
  const actual=new Map(meshes(target).map(m=>[m.name,m]));for(const id of ['head','hair','jacket_body','jacket_sleeve_L','jacket_sleeve_R','shirt_front','collar','cuff_L','cuff_R','tie','trouser_waist','shoe_L','shoe_R'])assert.ok(actual.has(id));
  // The only skin on the source body mesh is exposed hand geometry, not a
  // duplicate torso hidden inside the jacket.
  for(const m of actual.values())if(m.userData.sourceMesh.startsWith('Suit_Body')&&m.userData.sourceMaterial==='Skin')assert.match(m.name,/^hand_[LR]$/);
  for(const m of meshes(target)){const g=m.geometry;for(const attr of Object.values(g.attributes))assert.ok(Array.from(attr.array).every(Number.isFinite),m.name);for(let i=0;i<g.attributes.position.count;i++){let sum=0;for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k);assert.ok(w>=0);sum+=w;assert.ok(g.attributes.skinIndex.getComponent(i,k)<m.skeleton.bones.length);}assert.ok(Math.abs(sum-1)<3e-6,m.name+' weights');}}
});

test('suit loader creates separate inspector instances with repaired feet and auxiliary tracks',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async url=>new Response(await fs.readFile(url));
  let a,b;try{a=await loadSuitPreset();b=await loadSuitPreset();}finally{globalThis.fetch=previous;}
  assert.notEqual(a.root,b.root);assert.equal(a.missing.length,0);assert.equal(a.rig.order.length,56);assert.equal(getProceduralParts(a.root).length,19);
  for(const side of ['Left','Right']){assert.equal(a.rig.bones[side+'Foot'].parent,a.rig.bones[side+'Leg']);assert.ok(a.rig.order.includes('Suit_'+side+'ForearmTwist'));}
  assert.equal(a.root.userData.preset,'quaternius-suit-man');assert.equal(a.root.userData.shoulderRhythm.protractionGain,.35);assert.deepEqual(a.root.userData.headFocus,[0,1.635,.035]);
  setProceduralView(a.root,{explosion:1,isolated:'tie'});assert.equal(proceduralSettings(b.root).explosion,0);assert.equal(proceduralSettings(b.root).isolated,'all');
});

test('adult wave preserves measured palm direction without hiding alignment at the wrist',async()=>{
  const root=await load(),target=prepareRig(root).rig,driver=new Rig(createCharacter()),take=bakeMotion(driver,MOTIONS[0]);
  for(const t of [1.1,1.6,2.2,2.8]){driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);for(const side of ['Left','Right']){const at=n=>target.bones[side+n].getWorldPosition(new THREE.Vector3()),hand=at('Hand'),along=at('HandMiddle1').sub(hand).normalize(),palm=along.clone().cross(at('HandIndex1').sub(at('HandPinky1'))).multiplyScalar(side==='Left'?1:-1).normalize(),delta=driver.bones[side+'Hand'].getWorldQuaternion(new THREE.Quaternion()).multiply(driver.rest[side+'Hand'].wq.clone().invert());assert.ok(palm.dot(new THREE.Vector3(0,0,1).applyQuaternion(delta))>.99);assert.ok(target.bones[side+'Hand'].quaternion.angleTo(target.rest[side+'Hand'].q)<25*Math.PI/180);}}
});

test('suit animation export includes elbow helpers and reproduces the live deformation',async()=>{
  const root=await load();registerStudyModel(root);const target=prepareRig(root).rig,driver=new Rig(createCharacter()),take={...MOTIONS[2],...bakeMotion(driver,MOTIONS[2])};
  driver.applySnapshot(take.track.sample(2));applyRetarget(driver,target);const expected=meshes(root).filter(m=>m.name.startsWith('jacket')).map(m=>({id:m.name,points:[0,Math.floor(m.geometry.attributes.position.count/2),m.geometry.attributes.position.count-1].map(i=>m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld))}));
  const clip=retargetTake(driver,target,take);for(const side of ['Left','Right'])assert.ok(clip.tracks.some(t=>t.name==='Suit_'+side+'ForearmTwist.quaternion'));
  setProceduralView(root,{surface:'grey',isolated:'tie',explosion:.8,wireframe:true});const state=proceduralSettings(root),bytes=await exportCharacter(root,[clip]);assert.deepEqual(proceduralSettings(root),state);
  const loaded=await parseCharacter(bytes);assert.equal(loaded.animations.length,1);assert.equal(meshes(loaded.scene).length,19);const mixer=new THREE.AnimationMixer(loaded.scene);mixer.clipAction(loaded.animations[0]).play();mixer.setTime(2);loaded.scene.updateMatrixWorld(true);
  for(const row of expected){const m=loaded.scene.getObjectByName(row.id);assert.equal(m.visible,true);assert.equal(m.material.wireframe,false);for(const [k,i]of [0,Math.floor(m.geometry.attributes.position.count/2),m.geometry.attributes.position.count-1].entries())assert.ok(m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld).distanceTo(row.points[k])<3e-6,row.id+' exported deformation differs');}
});

test('suit garments retain positive normals and triangle areas across complete built-in takes',()=>{
  const r=check('check-teen-deformation.mjs',['--sweep']);assert.equal(r.sampledPoses,154);assert.equal(r.garmentParts.length,11);assert.deepEqual(r.failures,[]);assert.ok(r.minNormalAlignment>0);assert.ok(r.minAreaRatio>.1);
});

test('adult baked arm tracks remain continuous and bounded through all takes',()=>{
  const rows=check('check-teen-arms.mjs');assert.equal(rows.reduce((n,r)=>n+r.samples,0),903);
  for(const row of rows)for(const [name,j]of Object.entries(row.joints)){assert.ok(j.maxStepDegrees<9,row.motion+' '+name+' jumps');assert.ok(j.twistRangeDegrees<110,row.motion+' '+name+' winds');if(name.endsWith('Hand'))assert.ok(j.maxLocalAngleDegrees<25,row.motion+' '+name+' wrist');}
});
