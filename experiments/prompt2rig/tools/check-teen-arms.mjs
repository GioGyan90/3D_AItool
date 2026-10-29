import fs from 'node:fs/promises';
import * as T from 'three';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {parseCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {applyRetarget,retargetTake} from '../public/lab/motion-plan.js';
const filename=process.argv.slice(2).find(p=>!p.startsWith('--'))||new URL('../public/lab/characters/teen-boy/reassembled-boy.glb',import.meta.url);
const {json,bin}=readGLB(new Uint8Array(await fs.readFile(filename)));for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];const{scene}=await parseCharacter(writeGLB(json,bin)),rig=prepareRig(scene).rig,driver=new Rig(createCharacter()),report=[];
const deg=180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
for(const motion of MOTIONS){const take={...motion,...bakeMotion(driver,motion)},stats={};for(const side of ['Left','Right'])for(const part of ['ForeArm','Hand']){const joint=side+part,next=side+(part==='Hand'?'HandMiddle1':'Hand'),axis=rig.rest[next].wp.clone().sub(rig.rest[joint].wp).normalize();stats[joint]={axis,maxStep:0,minTwist:Infinity,maxTwist:-Infinity,maxWristAngle:0,travel:0,previous:null,previousTwist:null,unwrapped:0};}
 const clip=retargetTake(driver,rig,take),mixer=new T.AnimationMixer(scene),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 for(let i=0;i<=motion.duration*60;i++){mixer.setTime(i/60);scene.updateMatrixWorld(true);for(const[joint,s]of Object.entries(stats)){const q=rig.bones[joint].quaternion.clone().multiply(rig.rest[joint].q.clone().invert()),projection=q.x*s.axis.x+q.y*s.axis.y+q.z*s.axis.z,twist=wrap(2*Math.atan2(projection,q.w));if(s.previous){const step=q.angleTo(s.previous);s.maxStep=Math.max(s.maxStep,step);s.travel+=step;}if(s.previousTwist!==null)s.unwrapped+=wrap(twist-s.previousTwist);else s.unwrapped=twist;s.minTwist=Math.min(s.minTwist,s.unwrapped);s.maxTwist=Math.max(s.maxTwist,s.unwrapped);s.maxWristAngle=Math.max(s.maxWristAngle,q.angleTo(new T.Quaternion()));s.previous=q;s.previousTwist=twist;}}
 report.push({motion:motion.id,samples:motion.duration*60+1,joints:Object.fromEntries(Object.entries(stats).map(([n,s])=>[n,{maxStepDegrees:s.maxStep*deg,twistRangeDegrees:(s.maxTwist-s.minTwist)*deg,minTwistDegrees:s.minTwist*deg,maxTwistDegrees:s.maxTwist*deg,maxLocalAngleDegrees:s.maxWristAngle*deg,totalAngularTravelDegrees:s.travel*deg}]))});mixer.stopAllAction();rig.reset();}
console.log(JSON.stringify(report,null,2));
