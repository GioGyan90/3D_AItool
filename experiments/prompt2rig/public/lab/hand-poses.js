import * as T from 'three';

export const HAND_POSES=['open','relaxed','looseFist','fist'];
const profiles={open:{finger:[0,0,0],thumb:[0,0,0],opposition:0},relaxed:{finger:[15,22,16],thumb:[8,12,8],opposition:6},looseFist:{finger:[40,70,45],thumb:[12,18,12],opposition:15},fist:{finger:[47,85,55],thumb:[16,24,16],opposition:22}};
const cache=new WeakMap(),fingers=['Index','Middle','Ring','Pinky','Thumb'],radians=Math.PI/180;

function frames(rig,side){
  if(!cache.has(rig))cache.set(rig,new Map());const cached=cache.get(rig);if(cached.has(side))return cached.get(side);
  const hand=rig.rest[side+'Hand'],middle=rig.rest[side+'HandMiddle1'],index=rig.rest[side+'HandIndex1'],pinky=rig.rest[side+'HandPinky1'];
  if(!hand||!middle||!index||!pinky)return null;
  const along=middle.wp.clone().sub(hand.wp).normalize(),palm=along.clone().cross(index.wp.clone().sub(pinky.wp)).multiplyScalar(side==='Left'?1:-1).normalize();if(palm.lengthSq()<.5)return null;
  const joints=[];
  for(const finger of fingers)for(let k=1;k<=3;k++){
    const name=side+'Hand'+finger+k,bone=rig.bones[name],rest=rig.rest[name];if(!bone||!rest)continue;
    const child=bone.children.find(b=>b.isBone),previous=k===1?hand:rig.rest[side+'Hand'+finger+(k-1)];
    const direction=child?child.position.clone().applyQuaternion(rest.wq).normalize():rest.wp.clone().sub(previous.wp).normalize(),axis=direction.clone().cross(palm).normalize();if(axis.lengthSq()<.5)continue;
    const inverse=rest.wq.clone().invert(),entry={name,finger,segment:k,axis:axis.applyQuaternion(inverse).normalize(),opposition:0,palm:palm.clone().applyQuaternion(inverse).normalize()};
    if(finger==='Thumb'&&k===1){const from=direction.clone().projectOnPlane(palm).normalize(),to=middle.wp.clone().sub(rest.wp).projectOnPlane(palm).normalize();entry.opposition=Math.sign(palm.dot(from.clone().cross(to)))||1;}
    joints.push(entry);
  }
  cached.set(side,joints);return joints;
}

// Measured finger axes, not a fixed Euler axis copied from a different rig.
// Rebuild from rest on every call, so repeated preview/export cannot add curl.
export function applyHandPoses(rig,hands){
  const result={left:0,right:0};if(!hands)return result;
  for(const [key,side]of [['left','Left'],['right','Right']]){
    const profile=profiles[hands[key]];if(!profile)continue;
    for(const entry of frames(rig,side)||[]){
      const angle=profile[entry.finger==='Thumb'?'thumb':'finger'][entry.segment-1]*radians,q=new T.Quaternion().setFromAxisAngle(entry.axis,angle);
      if(entry.opposition)q.premultiply(new T.Quaternion().setFromAxisAngle(entry.palm,entry.opposition*profile.opposition*radians));
      rig.bones[entry.name].quaternion.copy(rig.rest[entry.name].q).multiply(q);result[key]++;
    }
  }
  rig.model.updateMatrixWorld(true);return result;
}
