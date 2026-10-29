import * as THREE from 'three';
import { Track, trackToClip } from '../retarget.js?v=1cfe9af41ff0';

export const MOTIONS = [
  {id:'wave',name:'挥手致意',duration:4,description:'抬起右手 → 挥手三次 → 放下',prompt:'raises the right hand, waves hello three times with an open palm, then lowers the arm'},
  {id:'victory',name:'胜利庆祝',duration:5,description:'蓄势 → 双臂举高 → 握拳庆祝 → 还原',prompt:'celebrates winning a billiards match, raises both fists above the shoulders, makes two strong fist pumps, then relaxes'},
  {id:'billiards',name:'俯身出杆',duration:6,description:'俯身瞄准 → 两次试杆 → 出杆 → 起身',prompt:'mimes a billiards shot without a cue or table, bends forward, extends the left bridge hand, makes two slow practice strokes with the right forearm, one final stroke, then stands upright'},
];
const smooth = (a,b,t) => {const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*(3-2*x);};

// Authored procedural controls, not inferred/AI-generated motion. Every take
// passes through upstream Rig → snapshot → Track → trackToClip → GLB.
export function applyMotion(rig, id, t) {
  rig.reset();
  const rotate=(name,x=0,y=0,z=0)=>rig.bones[name]?.quaternion.copy(rig.rest[name].q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));
  rotate('LeftArm',0,0,-1.3); rotate('RightArm',0,0,1.3);
  rotate('LeftForeArm',0,0,-.13); rotate('RightForeArm',0,0,.13);
  if(id==='wave') {
    const e=smooth(.2,.9,t)*(1-smooth(3.1,3.9,t));
    rotate('RightArm',.1*e,0,THREE.MathUtils.lerp(1.3,-.45,e));
    rotate('RightForeArm',0,.2*e,THREE.MathUtils.lerp(.13,-1.4+Math.sin((t-.9)*Math.PI*2*1.4)*.28,e));
    rotate('RightHand',.15*e,0,Math.sin(t*9)*.15*e);
    rotate('Head',0,-.1*e,-.07*e);
  } else if(id==='victory') {
    const e=smooth(.25,1.2,t)*(1-smooth(3.9,4.9,t)), pump=Math.sin(t*Math.PI*2*1.1)*.15*e;
    rotate('LeftArm',-.1*e,0,-1.3+2.2*e+pump); rotate('RightArm',-.1*e,0,1.3-2.2*e-pump);
    rotate('LeftForeArm',0,0,-.13+.95*e); rotate('RightForeArm',0,0,.13-.95*e);
    rotate('Spine2',-.08*e,0,Math.sin(t*6)*.04*e); rotate('Head',-.15*e);
  } else if(id==='billiards') {
    const e=smooth(.25,1.35,t)*(1-smooth(4.8,5.85,t));
    let stroke=0;
    if(t>=1.35&&t<3.6) stroke=Math.sin((t-1.35)*Math.PI*2/1.1)*.18;
    if(t>=3.6) stroke=-.18+.65*smooth(3.8,4.04,t)-.47*smooth(4.25,4.7,t);
    rotate('Spine',.25*e); rotate('Spine1',.27*e); rotate('Spine2',.23*e);
    rotate('Head',-.5*e,-.12*e);
    rotate('LeftArm',0,-1.05*e,-1.3+.95*e); rotate('LeftForeArm',0,-.1*e,-.13);
    rotate('RightArm',0,.55*e,1.3-.95*e); rotate('RightForeArm',-.8*e,-.8*e+stroke*e,.13+.85*e);
    rotate('RightHand',0,0,-.25*e);
    // Keep the bridge arm extended along the shot line in world space;
    // the torso lean must not drag both hands toward the floor.
    rig.model.updateMatrixWorld(true);
    rig.aim('LeftArm',new THREE.Vector3(-.08,-.14,1),e);
    rig.aim('LeftForeArm',new THREE.Vector3(-.08,-.04,1),e);
    rig.aim('LeftHand',new THREE.Vector3(0,-.1,1),e);
    rig.aim('RightArm',new THREE.Vector3(-.15,.05,-1),e);
    rig.aim('RightForeArm',new THREE.Vector3(0,-.7+stroke,1+stroke),e);
  }
  rig.model.updateMatrixWorld(true); rig.clampToFloor();
}

export function bakeMotion(rig, motion) {
  const track=new Track(rig.order.length);
  for(let i=0;i<=motion.duration*30;i++) {const t=i/30;applyMotion(rig,motion.id,t);track.push(t,rig.snapshot());}
  const clip=trackToClip(rig,track,'luckybreak_'+motion.id);
  rig.reset(); return {track,clip};
}
