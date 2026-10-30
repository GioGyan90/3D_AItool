import * as THREE from 'three';
import { Rig, BONES } from '../retarget.js?v=1b8f92adcb2a';

export const REQUIRED=['Hips','Spine','Neck','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'];
export const MAPPABLE=BONES.filter(n=>!/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n));
const aliases={Hips:['hips','pelvis','hip','j_bip_c_hips','bip001pelvis','cc_base_hip'],Spine:['spine','spine01','spine_01','j_bip_c_spine'],Spine1:['spine1','spine02','spine_02','chest','j_bip_c_chest'],Spine2:['spine2','spine03','upperchest','j_bip_c_upperchest'],Neck:['neck','neck01','j_bip_c_neck'],Head:['head','j_bip_c_head']};
for(const [side,suffix,vrm] of [['Left','l','l'],['Right','r','r']])for(const [canonical,names] of Object.entries({Shoulder:['shoulder','clavicle'],Arm:['upperarm','upper_arm','arm'],ForeArm:['forearm','lowerarm','lower_arm'],Hand:['hand','wrist'],UpLeg:['upleg','thigh','upperleg'],Leg:['leg','calf','shin','lowerleg'],Foot:['foot','ankle'],ToeBase:['toebase','toe','ball']})){
  aliases[side+canonical]=[side+canonical,...names.flatMap(n=>[`${n}_${suffix}`,`${suffix}_${n}`,`${side}${n}`,`j_bip_${vrm}_${n}`,`cc_base_${suffix}_${n}`])];
}
const normalize=s=>s.toLowerCase().replace(/^mixamorig\d*[:_]?/,'').replace(/[.\s:_-]/g,'');
export function detectBones(root,overrides={}){
  const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o);});const map={};
  for(const canonical of MAPPABLE){
    if(Object.hasOwn(overrides,canonical)){const b=bones.find(b=>b.uuid===overrides[canonical]||b.name===overrides[canonical]);if(b)map[canonical]=b;continue;}
    const candidates=new Set([canonical,...(aliases[canonical]||[])].map(normalize));const matches=bones.filter(b=>candidates.has(normalize(b.name)));
    if(matches.length===1)map[canonical]=matches[0];
  }
  return {bones,map,missing:REQUIRED.filter(n=>!map[n])};
}

export function prepareRig(root,overrides={}){
  root.traverse(o=>{if(o.userData.preset==='quaternius-running-woman'&&o.userData.soleGrounding)root.userData.soleGrounding=true;});
  root.traverse(o=>{if(o.userData.preset==='quaternius-running-woman'&&Array.isArray(o.userData.legBend))root.userData.legBend=o.userData.legBend;});
  root.traverse(o=>{if(o.userData.preset==='charabuilder-boy'&&o.userData.shoulderRhythm)root.userData.shoulderRhythm=true;});
  root.traverse(o=>{if(['quaternius-suit-man','quaternius-running-woman'].includes(o.userData.preset)&&Array.isArray(o.userData.forearmTwist))root.userData.forearmTwist=o.userData.forearmTwist;});
  root.traverse(o=>{if(o.userData.preset==='quaternius-suit-man'&&o.userData.shoulderRhythm)root.userData.shoulderRhythm=o.userData.shoulderRhythm;});
  const detection=detectBones(root,overrides);if(detection.missing.length)return {...detection,rig:null};
  const entries=Object.entries(detection.map),names=entries.map(([,b])=>b.name);
  if(new Set(entries.map(([,b])=>b)).size!==entries.length)throw new Error('同一根骨骼不能重复映射到多个部位');
  let rig;try{entries.forEach(([n,b])=>b.name='mixamorig'+n);rig=new Rig(root);}finally{entries.forEach(([,b],i)=>b.name=names[i]);}
  for(const entry of root.userData.forearmTwist||[])for(const name of [entry.bone,entry.middleBone])if(rig.bones[name]&&!rig.order.includes(name))rig.order.push(name);
  for(const entry of root.userData.legBend||[])if(rig.bones[entry.bone]&&!rig.order.includes(entry.bone))rig.order.push(entry.bone);
  if(!Number.isFinite(rig.legLength)||rig.legLength<1e-5)throw new Error('腿部骨架长度异常，请检查骨骼映射');
  return {...detection,rig};
}

export function normalizeCharacter(scene) {
  const root=new THREE.Group();root.name='ImportedCharacter';root.add(scene);root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),height=box.max.y-box.min.y;
  if(!Number.isFinite(height)||height<1e-6)throw new Error('模型没有可见的有效网格');
  root.scale.setScalar(1.8/height);root.updateMatrixWorld(true);
  const d=detectBones(root);if(d.map.LeftArm&&d.map.RightArm&&d.map.LeftArm.getWorldPosition(new THREE.Vector3()).x<d.map.RightArm.getWorldPosition(new THREE.Vector3()).x)root.rotation.y=Math.PI;
  root.updateMatrixWorld(true);box.setFromObject(root);root.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});root.updateMatrixWorld(true);return root;
}
