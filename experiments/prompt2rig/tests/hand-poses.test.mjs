import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {Rig} from '../public/retarget.js';
import {createCharacter} from '../public/lab/character.js';
import {applyHandPoses,HAND_POSES} from '../public/lab/hand-poses.js';
import {PLAN_SCHEMA,API_PLAN_SCHEMA,EXAMPLE_PLAN,validatePlan,planToTake,applyRetarget,retargetTake} from '../public/lab/motion-plan.js';
import {RUNNING_PLAN} from '../public/lab/running-motion.js';
import {createRequest,API_DEFAULTS} from '../public/lab/api.js';

async function runner(){
  const {json,bin}=readGLB(new Uint8Array(await fs.readFile(new URL('../public/lab/characters/running-woman/assembled-running-woman.glb',import.meta.url))));
  for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];
  return prepareRig((await parseCharacter(writeGLB(json,bin))).scene).rig;
}
const fingerNames=rig=>rig.order.filter(n=>/Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(n));

test('hand shape extends v1 without invalidating old plans and strict API requires a nullable key',()=>{
  assert.deepEqual(validatePlan(EXAMPLE_PLAN),EXAMPLE_PLAN);assert.equal(validatePlan({...EXAMPLE_PLAN,hands:null}).hands,null);
  assert.equal(PLAN_SCHEMA.required.includes('hands'),false);assert.ok(API_PLAN_SCHEMA.required.includes('hands'));
  for(const shape of HAND_POSES)assert.equal(validatePlan({...EXAMPLE_PLAN,hands:{left:shape,right:'open'}}).hands.left,shape);
  for(const hands of [{left:'fist'},[],{left:'fist',right:'unknown'},{left:'fist',right:'open',extra:1}])assert.throws(()=>validatePlan({...EXAMPLE_PLAN,hands}),/手型/);
  const request=createRequest({...API_DEFAULTS,key:'fixture'},'跑步',4);assert.deepEqual(request.body.text.format.schema,API_PLAN_SCHEMA);assert.match(request.body.instructions,/looseFist for running/);
});

test('both anatomical hands curl toward their palms without changing wrist orientation or accumulating rotation',async()=>{
  const rig=await runner(),names=fingerNames(rig),tips={};assert.equal(names.length,30);
  for(const side of ['Left','Right'])for(const finger of ['Index','Middle','Ring','Pinky']){
    const bone=rig.bones[side+'Hand'+finger+'3'],tip=bone.children.find(b=>b.isBone);tips[side+finger]={tip,rest:tip.getWorldPosition(new T.Vector3()),root:rig.rest[side+'Hand'+finger+'1'].wp};
  }
  assert.deepEqual(applyHandPoses(rig,{left:'looseFist',right:'looseFist'}),{left:15,right:15});
  for(const side of ['Left','Right']){
    assert.ok(rig.bones[side+'Hand'].quaternion.angleTo(rig.rest[side+'Hand'].q)<1e-7);
    const palm=rig.rest[side+'HandMiddle1'].wp.clone().sub(rig.rest[side+'Hand'].wp).normalize().cross(rig.rest[side+'HandIndex1'].wp.clone().sub(rig.rest[side+'HandPinky1'].wp)).multiplyScalar(side==='Left'?1:-1).normalize();
    for(const finger of ['Index','Middle','Ring','Pinky']){const row=tips[side+finger],now=row.tip.getWorldPosition(new T.Vector3());assert.ok(now.clone().sub(row.rest).dot(palm)>.02,side+finger+' bends toward palm');assert.ok(now.distanceTo(row.root)<row.rest.distanceTo(row.root)*.7,side+finger+' must visibly fold');}
  }
  const first=names.map(n=>rig.bones[n].quaternion.clone());for(let i=0;i<20;i++)applyHandPoses(rig,{left:'looseFist',right:'looseFist'});names.forEach((n,i)=>assert.ok(first[i].angleTo(rig.bones[n].quaternion)<1e-7));
  applyHandPoses(rig,{left:'open',right:'open'});for(const n of names)assert.ok(rig.bones[n].quaternion.angleTo(rig.rest[n].q)<1e-7);
  assert.deepEqual(applyHandPoses(new Rig(createCharacter()),{left:'fist',right:'fist'}),{left:0,right:0});
});

test('per-take hand metadata survives canonical driving, supports different hands, and clears on old takes',async()=>{
  const target=await runner(),driver=new Rig(createCharacter()),run=planToTake(driver,RUNNING_PLAN),old=planToTake(driver,EXAMPLE_PLAN),out={q:new Float32Array(driver.order.length*4),p:new Float32Array(3)};
  const asymmetric=planToTake(driver,{...RUNNING_PLAN,hands:{left:'open',right:'looseFist'}});
  for(const [take,leftBent,rightBent]of [[run,true,true],[old,false,false],[asymmetric,false,true],[run,true,true],[old,false,false]]){
    driver.applySnapshot(take.track.sample(.2,out));applyRetarget(driver,target);
    for(const [side,bent]of [['Left',leftBent],['Right',rightBent]])assert.equal(target.bones[side+'HandMiddle2'].quaternion.angleTo(target.rest[side+'HandMiddle2'].q)>.1,bent);
  }
  driver.applySnapshot(run.track.sample(.4));driver.reset();assert.equal(driver.handPose,null);
});

test('baked running clip contains all thirty non-rest finger tracks and matches live hand bones',async()=>{
  const target=await runner(),driver=new Rig(createCharacter()),run=planToTake(driver,RUNNING_PLAN),clip=retargetTake(driver,target,run),mixer=new T.AnimationMixer(target.model),names=fingerNames(target);
  assert.equal(clip.tracks.filter(t=>/Hand(Thumb|Index|Middle|Ring|Pinky)[123]\.quaternion$/.test(t.name)).length,30);
  const expected=[];for(const t of [0,.2,.4,1.6,3.9]){driver.applySnapshot(run.track.sample(t));applyRetarget(driver,target);expected.push(names.map(n=>target.bones[n].quaternion.clone()));}
  const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  for(const [i,t]of [0,.2,.4,1.6,3.9].entries()){mixer.setTime(t);target.model.updateMatrixWorld(true);names.forEach((n,j)=>{assert.ok(target.bones[n].quaternion.clone().normalize().angleTo(expected[i][j].clone().normalize())<1e-6,n+' baking changed hand');assert.ok(target.bones[n].quaternion.angleTo(target.rest[n].q)>.05,n+' missing finger bend');});}
});
