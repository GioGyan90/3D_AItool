import * as THREE from 'three';
import {refine} from './teen-shirt.mjs';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

// Refit weights on the author's continuous jacket before semantic splitting.
// Added points are shared midpoints on the author's surface.
export function tailorSuitGeometry(input,joints,material){
  if(!['Suit','White'].includes(material))return input;
  const joint=name=>joints.findIndex(j=>j.name==='mixamorig'+name),at=name=>joints[joint(name)].position;
  let g=refine(input,at('LeftArm').y-.14,.045);
  const elbowX=Math.abs(at('LeftForeArm').x);
  g=refine(g,at('LeftArm').y-.14,.024,(a,b)=>Math.abs(Math.abs((a.x+b.x)/2)-elbowX)<.15);
  const p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
  for(let i=0;i<p.count;i++){
    const pos=new THREE.Vector3().fromBufferAttribute(p,i),side=pos.x>=0?'Left':'Right',origin=at(side+'Arm'),elbow=at(side+'ForeArm'),wrist=at(side+'Hand'),axis=elbow.clone().sub(origin).normalize(),x=Math.abs(pos.x),axial=pos.clone().sub(origin).dot(axis),band=smooth(origin.y-.14,origin.y-.07,pos.y);
    if(!band)continue;
    const armProgress=THREE.MathUtils.lerp(smooth(-.07,.19,axial),THREE.MathUtils.clamp((axial+.07)/.26,0,1),smooth(Math.abs(elbow.x)-.12,Math.abs(elbow.x)-.08,x));
    const arm=Math.max(armProgress*smooth(Math.abs(origin.x)-.06,Math.abs(origin.x)+.012,x),smooth(Math.abs(origin.x)-.028,Math.abs(origin.x)+.065,x)*.58),clavicle=(1-arm)*smooth(Math.abs(origin.x)*.38,Math.abs(origin.x)*.90,x);
    const fore=smooth(Math.abs(elbow.x)-.18,Math.abs(elbow.x)+.005,x),hand=smooth(Math.abs(wrist.x)-.025,Math.abs(wrist.x)+.055,x),twist=THREE.MathUtils.clamp((x-Math.abs(elbow.x))/(Math.abs(wrist.x)-.005-Math.abs(elbow.x)),0,1);
    const weights=new Map();for(let k=0;k<4;k++){const index=si.getComponent(i,k);weights.set(index,(weights.get(index)||0)+sw.getComponent(i,k)*(1-band));}
    for(const [name,w]of [['Spine2',1-arm-clavicle],[side+'Shoulder',clavicle],[side+'Arm',arm*(1-fore)],[side+'ForeArm',arm*fore*Math.max(0,twist*2-1)*(1-hand)],[side+'Hand',arm*fore*hand]]){const index=joint(name);weights.set(index,(weights.get(index)||0)+w*band);}
    const helper=joints.findIndex(j=>j.name==='Suit_'+side+'ForearmTwist'),middle=joints.findIndex(j=>j.name==='Suit_'+side+'ForearmMid');weights.set(helper,(weights.get(helper)||0)+arm*fore*Math.max(0,1-twist*2)*(1-hand)*band);weights.set(middle,(weights.get(middle)||0)+arm*fore*(1-Math.abs(twist*2-1))*(1-hand)*band);
    const values=[...weights].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),total=values.reduce((n,[,w])=>n+w,0);
    for(let k=0;k<4;k++){si.setComponent(i,k,values[k]?.[0]||0);sw.setComponent(i,k,(values[k]?.[1]||0)/total);}
  }
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
