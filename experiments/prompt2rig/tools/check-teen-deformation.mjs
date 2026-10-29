import fs from 'node:fs/promises';
import * as THREE from 'three';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {parseCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {applyMotion} from '../public/lab/motions.js';
import {applyRetarget} from '../public/lab/motion-plan.js';
const filename=process.argv.slice(2).find(p=>!p.startsWith('--'))||new URL('../public/lab/characters/teen-boy/reassembled-boy.glb',import.meta.url),{json,bin}=readGLB(new Uint8Array(await fs.readFile(filename)));
for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];
const {scene}=await parseCharacter(writeGLB(json,bin)),metadata=[];scene.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(scene.userData,metadata[0]);
const rig=prepareRig(scene).rig,driver=new Rig(createCharacter()),parts=[];scene.traverse(m=>{if(m.isMesh&&/^(shirt_torso|sleeve_[LR]|tee_yoke)$/.test(m.name))parts.push(m);});
const sweep=process.argv.includes('--sweep'),samples=sweep?[['rest',0],...[['wave',4],['victory',5],['billiards',6]].flatMap(([id,duration])=>Array.from({length:Math.round(duration*10)+1},(_,i)=>[id,i/10]))]:[['rest',0],['wave',1.1],['wave',1.6],['wave',2.5],['victory',1.6],['victory',2.5],['billiards',2]];
const result=[];for(const [motion,time]of samples){
 if(motion==='rest')rig.reset();else{applyMotion(driver,motion,time);applyRetarget(driver,rig);}scene.updateMatrixWorld(true);
 const rows=[];for(const mesh of parts){const g=mesh.geometry,p=g.attributes.position,rest=[],posed=[],normals=[],boneMatrices=mesh.skeleton.bones.map((b,i)=>new THREE.Matrix4().multiplyMatrices(b.matrixWorld,mesh.skeleton.boneInverses[i]));for(let i=0;i<p.count;i++){rest.push(new THREE.Vector3().fromBufferAttribute(p,i));posed.push(mesh.getVertexPosition(i,new THREE.Vector3()));const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i),sum=new THREE.Vector3();for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k),b=g.attributes.skinIndex.getComponent(i,k);if(w)sum.addScaledVector(n.clone().transformDirection(boneMatrices[b]),w);}normals.push(sum.normalize());}
 const bad=[];let minDot=1,flipped=0,collapsed=0,minAreaRatio=Infinity,maxStretch=0;for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k)),[a,b,c]=ids,normal=new THREE.Vector3().crossVectors(posed[b].clone().sub(posed[a]),posed[c].clone().sub(posed[a])),restArea=new THREE.Vector3().crossVectors(rest[b].clone().sub(rest[a]),rest[c].clone().sub(rest[a])).length();if(restArea<1e-10)continue;const ratio=normal.length()/restArea,dot=normal.normalize().dot(normals[a].clone().add(normals[b]).add(normals[c]).normalize());minDot=Math.min(minDot,dot);minAreaRatio=Math.min(minAreaRatio,ratio);if(dot<0){flipped++;if(bad.length<10)bad.push({face:i/3,dot,area:restArea,center:ids.reduce((v,id)=>v.addScaledVector(rest[id],1/3),new THREE.Vector3()).toArray()});}if(ratio<.1)collapsed++;for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],length=rest[a].distanceTo(rest[b]);if(length>1e-7)maxStretch=Math.max(maxStretch,posed[a].distanceTo(posed[b])/length);}}
 rows.push({part:mesh.name,triangles:g.index.count/3,minDot,flipped,collapsed,minAreaRatio,maxStretch,bad});}
 const shoulders={};for(const side of ['Left','Right']){const p=rig.bones[side+'Arm'].getWorldPosition(new THREE.Vector3()),rest=rig.rest[side+'Arm'].wp;shoulders[side]={lift:p.y-rest.y,pivot:p.toArray()};}
 result.push({motion,time,parts:rows,shoulders});}
const summary={sampledPoses:result.length,garmentParts:parts.map(m=>m.name),minNormalAlignment:Math.min(...result.flatMap(r=>r.parts.map(p=>p.minDot))),minAreaRatio:Math.min(...result.flatMap(r=>r.parts.map(p=>p.minAreaRatio))),maxEdgeStretch:Math.max(...result.flatMap(r=>r.parts.map(p=>p.maxStretch))),failures:result.filter(r=>r.parts.some(p=>p.flipped||p.collapsed)).map(r=>({motion:r.motion,time:r.time,parts:r.parts.filter(p=>p.flipped||p.collapsed)}))};
console.log(JSON.stringify(sweep?summary:result,null,2));
