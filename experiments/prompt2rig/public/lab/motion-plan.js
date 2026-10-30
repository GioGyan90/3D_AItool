import * as THREE from 'three';
import { Track, trackToClip, basisQuat } from '../retarget.js';

export const PLAN_JOINTS=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const vec=(min,max)=>({type:'array',items:{type:'number',minimum:min,maximum:max},minItems:3,maxItems:3});
export const PLAN_SCHEMA={type:'object',additionalProperties:false,properties:{version:{type:'integer',enum:[1]},name:{type:'string'},duration:{type:'number',minimum:1,maximum:20},loop:{type:'boolean'},frames:{type:'array',minItems:2,maxItems:64,items:{type:'object',additionalProperties:false,properties:{t:{type:'number',minimum:0,maximum:20},root:vec(-1,1),rotations:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{joint:{type:'string',enum:PLAN_JOINTS},degrees:vec(-180,180)},required:['joint','degrees']}}},required:['t','root','rotations']}}},required:['version','name','duration','loop','frames']};

export const PLAN_INSTRUCTIONS=`Create a safe, readable 3D humanoid motion as JSON matching the given motion-plan v1 schema. Return data only, never code.
The animation is authored on a canonical 1.8m Mixamo T-pose skeleton with identity local rest quaternions. Subject's LEFT is +X, up is +Y, forward is +Z. Arms extend outward along +/-X at T-pose; legs extend along -Y. All angles are local XYZ Euler degrees, absolute offsets from T-pose, not additive over time. Relaxed arms are LeftArm [0,0,-75], RightArm [0,0,75], elbows +/-8 degrees. Omitted joints use this relaxed stance at EVERY frame, not the previous frame. Hips is rotation only; root is an offset in meters from the resting hips. Keep root [0,0,0] unless locomotion is requested. No scaling or bone translations.
Use 6-20 distinct key poses with clear anticipation, action, recovery; frames start exactly at t=0 and end at t=duration in strictly increasing order. Duration 1-20 seconds. If loop=true, match first and last poses. Use smooth quaternion interpolation; enough distinct poses to avoid a static-looking action. Keep elbows/knees plausible. Preserve feet near ground; no unrealistic spin or teleport. For a wave, RightArm z around -25 and RightForeArm z around -80 point the right hand up. A two-arm celebration uses LeftArm z +50, RightArm z -50, elbows +/-45. All values must be finite. Do not claim this is video motion capture.`;

export function validatePlan(input){
  let plan=input;if(typeof input==='string'){if(input.length>250000)throw new Error('动作 JSON 太大');const clean=input.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{plan=JSON.parse(clean);}catch{throw new Error('动作方案不是有效 JSON');}}
  if(!plan||plan.version!==1||typeof plan.name!=='string'||!plan.name.trim()||plan.name.length>120)throw new Error('动作方案需要 version: 1 和有效名称');
  if(!Number.isFinite(plan.duration)||plan.duration<1||plan.duration>20||typeof plan.loop!=='boolean')throw new Error('动作时长应为 1–20 秒，并包含 loop');
  if(!Array.isArray(plan.frames)||plan.frames.length<2||plan.frames.length>64)throw new Error('动作需要 2–64 个关键姿态');
  let previous=-1;
  const vector=(v,min,max)=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max);
  for(const frame of plan.frames){
    if(!Number.isFinite(frame.t)||frame.t<0||frame.t>plan.duration||frame.t<=previous)throw new Error('关键姿态时间必须递增，并位于动作时长内');previous=frame.t;
    if(!vector(frame.root,-1,1)||!Array.isArray(frame.rotations)||frame.rotations.length>20)throw new Error('关键姿态的 root 或 rotations 无效');
    const seen=new Set();for(const r of frame.rotations){if(!PLAN_JOINTS.includes(r.joint)||seen.has(r.joint)||!vector(r.degrees,-180,180))throw new Error('骨骼名称、角度或重复骨骼无效');seen.add(r.joint);}
  }
  if(plan.frames[0].t!==0||Math.abs(plan.frames.at(-1).t-plan.duration)>1e-6)throw new Error('首帧应为 0，末帧应等于动作时长');
  return structuredClone(plan);
}

export function planToTake(rig,input){
  const plan=validatePlan(input),keys=new Track(rig.order.length),unit=Math.PI/180;
  for(const frame of plan.frames){
    rig.reset();rig.bones.LeftArm.rotation.z=-75*unit;rig.bones.RightArm.rotation.z=75*unit;
    if(rig.bones.LeftForeArm)rig.bones.LeftForeArm.rotation.z=-8*unit;if(rig.bones.RightForeArm)rig.bones.RightForeArm.rotation.z=8*unit;
    for(const {joint,degrees} of frame.rotations){const b=rig.bones[joint];if(b)b.quaternion.copy(rig.rest[joint].q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...degrees.map(v=>v*unit))));}
    rig.model.updateMatrixWorld(true);rig.setHipsWorld(rig.rest.Hips.wp.clone().add(new THREE.Vector3(...frame.root)));rig.clampToFloor();keys.push(frame.t,rig.snapshot());
  }
  if(plan.loop){const first=keys.q[0],last=keys.q.at(-1);if(first.some((v,i)=>Math.abs(v-last[i])>1e-4)||keys.p[0].some((v,i)=>Math.abs(v-keys.p.at(-1)[i])>1e-4))throw new Error('循环动作首尾姿态不同，请修正 JSON 或设置 loop: false');}
  const track=new Track(rig.order.length);for(let i=0;i<=Math.ceil(plan.duration*30);i++){const t=Math.min(i/30,plan.duration);track.push(t,keys.sample(t));}
  const clip=trackToClip(rig,track,plan.name);rig.reset();
  return {id:'plan_'+Date.now(),name:plan.name,duration:plan.duration,description:'提示词 → 动作方案 → 骨骼重定向',prompt:'',plan,track,clip,loop:plan.loop,source:'motion-plan'};
}

// A limb direction does not determine its axial twist. Use an anatomical hand
// frame after aiming the arm chain, so an A-pose wrist cannot leave a wave edge-on.
const handFrames=new WeakMap();
const soleMeshes=new WeakMap();
function groundOnSoles(driver,target){
  if(!soleMeshes.has(target.model)){const parts=[];target.model.traverse(o=>{if(o.isSkinnedMesh&&/^sole_[LR]$/.test(o.name))parts.push(o);});if(parts.length!==2)throw Error('女性人物缺少实际左右鞋底，无法校正接地');soleMeshes.set(target.model,parts);}
  target.model.updateMatrixWorld(true);let minimum=Infinity;const p=new THREE.Vector3();
  for(const mesh of soleMeshes.get(target.model))for(let i=0;i<mesh.geometry.attributes.position.count;i++)minimum=Math.min(minimum,mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld).y);
  const clearance=Math.max(0,driver.lowestFoot()-driver.floorY)*target.legLength/driver.legLength,hip=target.hipsWorld();hip.y+=target.floorY+clearance-minimum;target.setHipsWorld(hip);
}
function restHandFrame(rig,side){
 if(!handFrames.has(rig))handFrames.set(rig,new Map());const cache=handFrames.get(rig);if(cache.has(side))return cache.get(side);
 const hand=rig.rest[side+'Hand'],middle=rig.rest[side+'HandMiddle1'];if(!hand||!middle)return null;
 const along=middle.wp.clone().sub(hand.wp).normalize(),index=rig.rest[side+'HandIndex1'],pinky=rig.rest[side+'HandPinky1'];
 const palm=index&&pinky?along.clone().cross(index.wp.clone().sub(pinky.wp)).multiplyScalar(side==='Left'?1:-1).normalize():new THREE.Vector3(0,0,1);
 if(palm.lengthSq()<.1)return null;
 const frame={along,palm,q:basisQuat(along,palm)};cache.set(side,frame);return frame;
}
function orientRetargetedHand(driver,target,side,basis){
 const source=restHandFrame(driver,side),rest=restHandFrame(target,side),name=side+'Hand';if(!source||!rest)return;
 const current=driver.bones[name].getWorldQuaternion(new THREE.Quaternion()),delta=current.multiply(driver.rest[name].wq.clone().invert());
 const along=source.along.clone().applyQuaternion(delta).applyQuaternion(basis),palm=source.palm.clone().applyQuaternion(delta).applyQuaternion(basis);
 const desired=basisQuat(along,palm).multiply(rest.q.clone().invert()).multiply(target.rest[name].wq);target.setWorldQuat(name,desired);
}

function orientRetargetedForearm(driver,target,side,basis){
 const sourcePalm=restHandFrame(driver,side),targetPalm=restHandFrame(target,side),name=side+'ForeArm',hand=side+'Hand';if(!sourcePalm||!targetPalm||!driver.bones[name]||!target.bones[name])return;
 const sourceAlong=driver.rest[hand].wp.clone().sub(driver.rest[name].wp).normalize(),targetAlong=target.rest[hand].wp.clone().sub(target.rest[name].wp).normalize(),delta=driver.bones[name].getWorldQuaternion(new THREE.Quaternion()).multiply(driver.rest[name].wq.clone().invert());
 const along=sourceAlong.applyQuaternion(delta).applyQuaternion(basis),palm=sourcePalm.palm.clone().applyQuaternion(delta).applyQuaternion(basis),rest=basisQuat(targetAlong,targetPalm.palm);
 target.setWorldQuat(name,basisQuat(along,palm).multiply(rest.invert()).multiply(target.rest[name].wq));
}

export function applyRetarget(driver,target){
  if(driver===target)return;
  target.reset();target.copyPoseFrom(driver);
  // Correct A-pose/T-pose and bone-axis differences using measured limb
  // directions, rather than adding a T-pose rotation to an A-pose rest.
  const basis=target.restHipBasis.clone().multiply(driver.restHipBasis.clone().invert());
  if(target.model.userData.shoulderRhythm){
    const rhythm=target.model.userData.shoulderRhythm,settings=typeof rhythm==='object'?rhythm:{gain:.35,maxLift:.38,protractionGain:.5,maxProtraction:.5,minProtraction:-.2},threshold=settings.threshold??Math.PI/3;
    const up=new THREE.Vector3(0,1,0).applyQuaternion(target.bones.Spine2.getWorldQuaternion(new THREE.Quaternion())).normalize(),forward=new THREE.Vector3(0,0,1).applyQuaternion(target.bones.Spine2.getWorldQuaternion(new THREE.Quaternion())).normalize();
    for(const side of ['Left','Right']){const arm=driver.bones[side+'Arm'],fore=driver.bones[side+'ForeArm'],shoulder=target.bones[side+'Shoulder'];if(!arm||!fore||!shoulder)continue;
      const direction=fore.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).applyQuaternion(basis).normalize(),elevation=Math.acos(THREE.MathUtils.clamp(-direction.dot(up),-1,1)),lift=THREE.MathUtils.clamp((elevation-threshold)*settings.gain,0,settings.maxLift);
      const protraction=THREE.MathUtils.clamp(direction.dot(forward)*settings.protractionGain,settings.minProtraction,settings.maxProtraction),q=new THREE.Quaternion().setFromAxisAngle(up,protraction*(side==='Left'?-1:1)).multiply(new THREE.Quaternion().setFromAxisAngle(forward,lift*(side==='Left'?1:-1))).multiply(shoulder.getWorldQuaternion(new THREE.Quaternion()));target.setWorldQuat(side+'Shoulder',q);
    }
  }
  for(const side of ['Left','Right'])for(const [name,child] of [['Arm','ForeArm'],['ForeArm','Hand'],['UpLeg','Leg'],['Leg','Foot']]){
    const a=driver.bones[side+name],b=driver.bones[side+child];if(!a||!b||!target.bones[side+child])continue;
    const direction=b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).applyQuaternion(basis);target.aim(side+name,direction);
  }
  for(const side of ['Left','Right']){orientRetargetedForearm(driver,target,side,basis);orientRetargetedHand(driver,target,side,basis);}
  // Long sleeves need a separate bend-following surface near the elbow. The
  // wrist keeps the anatomical palm direction, while the sleeve acquires axial
  // twist progressively toward the wrist. These helpers are baked as tracks.
  for(const entry of target.model.userData.forearmTwist||[]){
    const {bone,arm,forearm,hand}=entry;if(!target.bones[bone]||!target.rest[hand]||!target.rest[forearm]||!target.rest[arm])continue;
    const parentDelta=target.bones[arm].getWorldQuaternion(new THREE.Quaternion()).multiply(target.rest[arm].wq.clone().invert()),from=target.rest[hand].wp.clone().sub(target.rest[forearm].wp).normalize().applyQuaternion(parentDelta),to=target.bones[hand].getWorldPosition(new THREE.Vector3()).sub(target.bones[forearm].getWorldPosition(new THREE.Vector3())).normalize();
    const swingDelta=new THREE.Quaternion().setFromUnitVectors(from,to),fullSwing=swingDelta.clone().multiply(parentDelta),full=target.bones[forearm].getWorldQuaternion(new THREE.Quaternion()),axial=full.clone().multiply(fullSwing.clone().invert());
    const partialSwing=new THREE.Quaternion().slerp(swingDelta,THREE.MathUtils.clamp(entry.swingFraction??1,0,1)).multiply(parentDelta).multiply(target.rest[bone].wq),partialTwist=new THREE.Quaternion().slerp(axial,THREE.MathUtils.clamp(entry.fraction||0,0,1));
    const desired=partialTwist.multiply(partialSwing);target.setWorldQuat(bone,desired);
    if(target.bones[entry.middleBone])target.setWorldQuat(entry.middleBone,desired.clone().slerp(full,.5));
  }
  for(const entry of target.model.userData.legBend||[]){const a=target.bones[entry.upper],b=target.bones[entry.lower];if(!a||!b||!target.bones[entry.bone])continue;target.setWorldQuat(entry.bone,a.getWorldQuaternion(new THREE.Quaternion()).slerp(b.getWorldQuaternion(new THREE.Quaternion()),entry.fraction));}
  if(target.model.userData.soleGrounding)groundOnSoles(driver,target);else target.clampToFloor();
}

export function retargetTake(driver,target,take){
  if(driver===target)return take.clip;
  const track=new Track(target.order.length);
  for(let i=0;i<take.track.length;i++){driver.applySnapshot(take.track.sample(take.track.times[i]));applyRetarget(driver,target);track.push(take.track.times[i],target.snapshot());}
  driver.reset();target.reset();return trackToClip(target,track,take.name);
}

export function motionRequest(prompt,duration=5){return {format:'luckybreak-motion-request',version:1,provider:'openai',prompt,duration,instructions:PLAN_INSTRUCTIONS,schema:PLAN_SCHEMA};}

export const EXAMPLE_PLAN={version:1,name:'轻点头并挥手',duration:4,loop:true,frames:[
  {t:0,root:[0,0,0],rotations:[]},
  {t:.8,root:[0,0,0],rotations:[{joint:'RightArm',degrees:[0,0,-25]},{joint:'RightForeArm',degrees:[0,0,-85]},{joint:'Head',degrees:[12,0,0]}]},
  {t:1.4,root:[0,0,0],rotations:[{joint:'RightArm',degrees:[0,0,-25]},{joint:'RightForeArm',degrees:[0,0,-65]}]},
  {t:2,root:[0,0,0],rotations:[{joint:'RightArm',degrees:[0,0,-25]},{joint:'RightForeArm',degrees:[0,0,-105]}]},
  {t:2.6,root:[0,0,0],rotations:[{joint:'RightArm',degrees:[0,0,-25]},{joint:'RightForeArm',degrees:[0,0,-65]}]},
  {t:3.1,root:[0,0,0],rotations:[{joint:'RightArm',degrees:[0,0,-25]},{joint:'RightForeArm',degrees:[0,0,-85]}]},
  {t:4,root:[0,0,0],rotations:[]}
]};
