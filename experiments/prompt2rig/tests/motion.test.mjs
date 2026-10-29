import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter} from '../public/lab/character.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {Rig} from '../public/retarget.js';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';

globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}
};
for(const motion of MOTIONS) test(`${motion.id}: visible bone motion, stable looping, valid skinned animated GLB`,async()=>{
  const model=createCharacter(),rig=new Rig(model),{track,clip}=bakeMotion(rig,motion);
  assert.equal(track.length,motion.duration*30+1);
  const wrists=[];
  for(let i=0;i<track.length;i++){
    assert.ok([...track.q[i],...track.p[i]].every(Number.isFinite));
    for(let j=0;j<track.q[i].length;j+=4)assert.ok(Math.abs(Math.hypot(...track.q[i].slice(j,j+4))-1)<1e-5);
    rig.applySnapshot(track.sample(track.times[i]));
    wrists.push(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()));
    assert.ok(rig.lowestFoot()>=rig.floorY-1e-5,'feet stay above the rest floor');
  }
  assert.ok(Math.max(...wrists.map(p=>p.distanceTo(wrists[0])))>.2,'right hand moves >20 cm');
  assert.ok(track.q[0].every((v,i)=>Math.abs(v-track.q.at(-1)[i])<1e-5),'loop closes at rest');
  rig.reset();
  // Exercise the actual Three.js mixer used by consumers, not only snapshot playback.
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(clip).play();mixer.setTime(motion.duration/2);model.updateMatrixWorld(true);
  assert.ok(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(wrists[0])>.1);
  mixer.stopAllAction();rig.reset();
  const glb=await new GLTFExporter().parseAsync(model,{binary:true,animations:[clip]});
  const header=new DataView(glb);assert.equal(header.getUint32(0,true),0x46546c67);assert.equal(header.getUint32(4,true),2);assert.equal(header.getUint32(8,true),glb.byteLength);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,header.getUint32(12,true))));
  assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,rig.order.length);
  assert.equal(json.animations.length,1);assert.equal(json.animations[0].channels.length,rig.order.length+1);
  assert.ok(json.meshes[0].primitives.every(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined));
  assert.ok(json.animations[0].channels.some(c=>c.target.path==='rotation'));
  console.log(`${motion.id}: ${track.length} frames, ${rig.order.length} bones, ${glb.byteLength} bytes`);
});
