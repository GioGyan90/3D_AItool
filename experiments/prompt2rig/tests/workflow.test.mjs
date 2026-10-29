import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {MeshoptSimplifier} from '../public/vendor/meshopt/meshopt_simplifier.module.js';
import {optimizeModel,reduceGeometry} from '../public/lab/optimize.js';
import {readGLB,compressGLB,decodeView} from '../public/lab/glb-codec.js';
import {parseCharacter,importCharacter,exportCharacter} from '../public/lab/assets.js';
import {prepareRig,detectBones} from '../public/lab/rig-adapter.js';
import {EXAMPLE_PLAN,planToTake,validatePlan,retargetTake,applyRetarget,motionRequest} from '../public/lab/motion-plan.js';
import {API_DEFAULTS,resolveConfig,createRequest,generatePlan} from '../public/lab/api.js';

globalThis.self=globalThis;
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}};
const sample=async()=>{const b=await fs.readFile(new URL('../samples/luckybreak_wave.glb',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};

test('Meshopt export is smaller, exact per bufferView, reloads with original skeleton and animation',async()=>{
  const source=await sample(),compressed=await compressGLB(source),a=readGLB(source),b=readGLB(compressed);
  assert.ok(compressed.byteLength<source.byteLength);assert.ok(b.json.extensionsRequired.includes('EXT_meshopt_compression'));
  for(let i=0;i<a.json.bufferViews.length;i++)assert.deepEqual(await decodeView(b.json,b.bin,i),await decodeView(a.json,a.bin,i));
  const gltf=await parseCharacter(compressed);assert.equal(gltf.animations.length,1);assert.equal(detectBones(gltf.scene).bones.length,24);
  console.log('lossless compression',source.byteLength,'→',compressed.byteLength);
});

test('decimation preserves exact referenced skin/UV/morph attributes and reduces a smooth mesh',async()=>{
  await MeshoptSimplifier.ready;const g=new THREE.SphereGeometry(1,32,24),count=g.attributes.position.count;
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const morph=new Float32Array(count*3);for(let i=0;i<count;i++)if(g.attributes.position.getY(i)>.9)morph[i*3+1]=.03;g.morphAttributes.position=[new THREE.Float32BufferAttribute(morph,3)];g.morphTargetsRelative=true;
  const reduced=reduceGeometry(g,.6,.01);assert.ok(reduced.index.count<g.index.count);assert.equal(reduced.morphAttributes.position.length,1);assert.ok(reduced.morphTargetsRelative);
  for(let i=0;i<reduced.attributes.position.count;i++){
    const p=new THREE.Vector3().fromBufferAttribute(reduced.attributes.position,i);let original=-1;for(let j=0;j<count;j++)if(p.distanceToSquared(new THREE.Vector3().fromBufferAttribute(g.attributes.position,j))<1e-12&&Math.abs(reduced.attributes.uv.getX(i)-g.attributes.uv.getX(j))<1e-6){original=j;break;}
    assert.ok(original>=0);assert.equal(reduced.attributes.skinWeight.getX(i),1);assert.equal(reduced.attributes.skinIndex.getX(i),0);assert.equal(reduced.morphAttributes.position[0].getY(i),g.morphAttributes.position[0].getY(original));
  }
});

test('GLB import → optimization → motion binding → compressed export → reload and mixer playback',async()=>{
  const asset=await importCharacter(await sample(),'test.glb',{ratio:.7,maxTexture:1024});
  assert.ok(asset.rig);assert.ok(asset.report.after.triangles<=asset.report.before.triangles);assert.equal(asset.animations.length,1);
  const driver=new Rig(createCharacter()),take=planToTake(driver,EXAMPLE_PLAN),clip=retargetTake(driver,asset.rig,take);
  const output=await exportCharacter(asset.root,[...asset.animations,clip]);const again=await parseCharacter(output);
  assert.equal(again.animations.length,2);const target=prepareRig(again.scene).rig;assert.ok(target);
  const mixer=new THREE.AnimationMixer(again.scene);mixer.clipAction(again.animations[1]).play();mixer.setTime(0);again.scene.updateMatrixWorld(true);const initial=target.bones.RightHand.getWorldPosition(new THREE.Vector3());mixer.setTime(1.4);again.scene.updateMatrixWorld(true);assert.ok(initial.distanceTo(target.bones.RightHand.getWorldPosition(new THREE.Vector3()))>.15);
  console.log('optimized asset',asset.report.before.triangles,'→',asset.report.after.triangles,'faces; exported',output.byteLength,'bytes');
});

test('bone aliases and manual mapping preserve source names; unrigged mesh remains exportable',async()=>{
  const root=createCharacter();root.traverse(o=>{if(o.isBone)o.name=o.name.replace('mixamorig','');});const names=[];root.traverse(o=>{if(o.isBone)names.push(o.name);});assert.ok(prepareRig(root).rig);const after=[];root.traverse(o=>{if(o.isBone)after.push(o.name);});assert.deepEqual(after,names);
  const plain=new THREE.Group();plain.add(new THREE.Mesh(new THREE.SphereGeometry(.5,16,12),new THREE.MeshStandardMaterial()));assert.equal(prepareRig(plain).rig,null);await optimizeModel(plain);assert.ok((await exportCharacter(plain)).byteLength>0);
});

test('motion plans validate data, reject invalid input, animate and export a reusable task without credentials',()=>{
  assert.deepEqual(validatePlan(JSON.stringify(EXAMPLE_PLAN)),EXAMPLE_PLAN);assert.throws(()=>validatePlan({...EXAMPLE_PLAN,duration:Infinity}));assert.throws(()=>validatePlan({...EXAMPLE_PLAN,frames:[...EXAMPLE_PLAN.frames].reverse()}));
  const bad=structuredClone(EXAMPLE_PLAN);bad.frames[1].rotations[0].joint='__proto__';assert.throws(()=>validatePlan(bad));
  const root=createCharacter(),rig=new Rig(root),take=planToTake(rig,EXAMPLE_PLAN);assert.equal(take.track.length,121);rig.applySnapshot(take.track.sample(1.4));assert.ok(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()).y>1.4);assert.ok(!JSON.stringify(motionRequest('挥手')).includes('apiKey'));
});

test('A-pose target receives canonical limb direction instead of a doubled rest-angle offset',()=>{
  const source=new Rig(createCharacter()),root=createCharacter();let arm;root.traverse(o=>{if(o.name==='mixamorigRightArm')arm=o;});arm.rotation.z=.6;root.updateMatrixWorld(true);const target=new Rig(root),take=planToTake(source,EXAMPLE_PLAN);source.applySnapshot(take.track.sample(1.4));applyRetarget(source,target);
  const direction=rig=>rig.bones.RightForeArm.getWorldPosition(new THREE.Vector3()).sub(rig.bones.RightArm.getWorldPosition(new THREE.Vector3())).normalize();assert.ok(direction(source).dot(direction(target))>.999);
});

test('API defaults to OpenAI Responses; compatible mode, malformed output and failures are explicit',async()=>{
  const config=resolveConfig({});assert.equal(config.provider,'openai');assert.equal(config.baseUrl,'https://api.openai.com/v1');assert.throws(()=>createRequest({},'挥手',4),/API Key/);
  const req=createRequest({...API_DEFAULTS,key:'test-key'},'挥手',4);assert.equal(req.url,'https://api.openai.com/v1/responses');assert.equal(req.body.text.format.type,'json_schema');assert.equal(req.body.store,false);
  const compatible=createRequest({provider:'custom',baseUrl:'https://example.com/v1',model:'test-model',key:'test-key'},'挥手',4);assert.ok(compatible.url.endsWith('/chat/completions'));
  const plan=await generatePlan({...API_DEFAULTS,key:'test-key'},'挥手',4,{fetcher:async(url,options)=>{assert.ok(options.headers.Authorization.startsWith('Bearer '));return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(EXAMPLE_PLAN)}]}]})};}});assert.equal(plan.name,EXAMPLE_PLAN.name);
  await assert.rejects(generatePlan({...API_DEFAULTS,key:'test-key'},'挥手',4,{fetcher:async()=>({ok:false,status:401})}),/Key/);
  await assert.rejects(generatePlan({...API_DEFAULTS,key:'test-key'},'挥手',4,{fetcher:async()=>({ok:true,json:async()=>({output_text:'not json'})})}),/JSON/);
  assert.throws(()=>resolveConfig({baseUrl:'https://third-party.example/v1'}),/自定义/);assert.throws(()=>resolveConfig({provider:'custom',baseUrl:'https://key:secret@example.com/v1'}));
});
