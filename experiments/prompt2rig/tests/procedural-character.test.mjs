import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createProceduralParts,createProceduralCharacter,getProceduralParts,validateProceduralParts,setProceduralView,proceduralSettings,createPartExport} from '../public/lab/procedural-character.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {applyRetarget,retargetTake} from '../public/lab/motion-plan.js';
import {exportCharacter,parseCharacter} from '../public/lab/assets.js';

globalThis.self=globalThis;
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};

test('29 closed cage parts have positive volume, consistent winding, no degenerate faces and exact mirrored pairs',()=>{
  const parts=createProceduralParts(),report=validateProceduralParts(parts);assert.equal(parts.length,29);assert.ok(report.every(r=>r.pass));
  for(const left of parts.filter(p=>p.id.endsWith('_L'))){const right=parts.find(p=>p.id===left.id.replace('_L','_R'));assert.ok(right);const a=left.geometry.attributes.position,b=right.geometry.attributes.position;assert.equal(a.count,b.count);for(let i=0;i<a.count;i++){assert.ok(Math.abs(a.getX(i)+b.getX(i))<1e-7);assert.equal(a.getY(i),b.getY(i));assert.equal(a.getZ(i),b.getZ(i));}}
  assert.equal(report.reduce((n,r)=>n+r.triangles,0),2572);
});

test('all procedural skin weights are finite, normalized and assigned to real joints; body proportions are bounded',()=>{
  const root=createProceduralCharacter(),rig=new Rig(root);assert.equal(rig.order.length,52);assert.ok(rig.height>1.75&&rig.height<1.81);
  for(const part of getProceduralParts(root)){const w=part.geometry.attributes.skinWeight,index=part.geometry.attributes.skinIndex;for(let i=0;i<w.count;i++){let sum=0;for(let j=0;j<4;j++){const value=w.getComponent(i,j);assert.ok(Number.isFinite(value)&&value>=0);assert.ok(index.getComponent(i,j)>=0&&index.getComponent(i,j)<52);sum+=value;}assert.ok(Math.abs(sum-1)<1e-6);}}
});

test('shared elbow and knee rings stay joined under all three motion tests',()=>{
  const root=createProceduralCharacter(),target=new Rig(root),driver=new Rig(createCharacter()),parts=getProceduralParts(root);
  for(const motion of MOTIONS){const take=bakeMotion(driver,motion);for(const t of [0,motion.duration*.3,motion.duration*.6,motion.duration]){driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);for(const side of ['L','R'])for(const [a,b] of [['upperArm','forearm'],['thigh','calf']]){const first=parts.find(p=>p.id===a+'_'+side),second=parts.find(p=>p.id===b+'_'+side);for(let k=0;k<first.sides;k++){const p=first.mesh.getVertexPosition((first.rings-1)*first.sides+k,new THREE.Vector3()),q=second.mesh.getVertexPosition(k,new THREE.Vector3());assert.ok(p.distanceTo(q)<1e-6,`${motion.id} ${a}/${b} seam`);}}}}
});

test('export restores assembly geometry without split-view transforms and retains animation after reload',async()=>{
  const root=createProceduralCharacter(),target=new Rig(root),driver=new Rig(createCharacter()),take={...MOTIONS[0],...bakeMotion(driver,MOTIONS[0])},clip=retargetTake(driver,target,take);
  setProceduralView(root,{explosion:.8,isolated:'forearm_L',surface:'parts',wireframe:true});const before=proceduralSettings(root);
  const glb=await exportCharacter(root,[clip]);assert.deepEqual(proceduralSettings(root),before);
  const loaded=await parseCharacter(glb);let meshes=0,maxX=0;loaded.scene.traverse(o=>{if(o.isMesh){meshes++;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)maxX=Math.max(maxX,Math.abs(p.getX(i)));}});assert.equal(meshes,29);assert.ok(maxX<1);assert.equal(loaded.animations.length,1);
  const rig=new Rig(loaded.scene),mixer=new THREE.AnimationMixer(loaded.scene);mixer.clipAction(loaded.animations[0]).play();mixer.setTime(0);loaded.scene.updateMatrixWorld(true);const initial=rig.bones.RightHand.getWorldPosition(new THREE.Vector3());mixer.setTime(2);loaded.scene.updateMatrixWorld(true);assert.ok(initial.distanceTo(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()))>.3);
});

test('single-part export keeps assembly coordinates and has no skin or explosion offset',async()=>{
  const root=createProceduralCharacter();setProceduralView(root,{explosion:1,isolated:'forearm_L'});const original=getProceduralParts(root).find(p=>p.id==='forearm_L'),part=createPartExport(root,'forearm_L');assert.deepEqual(part.geometry.attributes.position.array,original.rest);assert.equal(part.geometry.attributes.skinIndex,undefined);
  const glb=await exportCharacter(part);const loaded=await parseCharacter(glb);let mesh;loaded.scene.traverse(o=>{if(o.isMesh)mesh=o;});assert.ok(mesh);assert.equal(mesh.isSkinnedMesh,undefined);assert.ok(mesh.geometry.boundingBox===null||mesh.geometry.boundingBox.min.x>.4);assert.equal(loaded.animations.length,0);
});
