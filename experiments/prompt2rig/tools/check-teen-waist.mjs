import fs from 'node:fs/promises';
import * as T from 'three';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {parseCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {applyMotion} from '../public/lab/motions.js';
import {applyRetarget} from '../public/lab/motion-plan.js';
const path=process.argv.slice(2).find(p=>!p.startsWith('--'))||new URL('../public/lab/characters/teen-boy/reassembled-boy.glb',import.meta.url),{json,bin}=readGLB(new Uint8Array(await fs.readFile(path)));
for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];
const{scene}=await parseCharacter(writeGLB(json,bin)),meta=[];scene.traverse(o=>{if(o.userData.preset)meta.push(o.userData);});Object.assign(scene.userData,meta[0]);
const rig=prepareRig(scene).rig,driver=new Rig(createCharacter()),shirt=[],pants=[];scene.traverse(m=>{if(m.isMesh&&/^(shirt_torso|tee_yoke|sleeve_[LR])$/.test(m.name))shirt.push(m);if(m.isMesh&&m.name.startsWith('pants_'))pants.push(m);});
function poseMeshes(meshes,inverse){return meshes.map(m=>{const p=Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new T.Vector3()).applyMatrix4(m.matrixWorld).applyMatrix4(inverse));return{mesh:m,p};});}
function slice(meshes,y){const lines=[];for(const{mesh,p}of meshes)for(let i=0;i<mesh.geometry.index.count;i+=3){const tri=[0,1,2].map(k=>p[mesh.geometry.index.getX(i+k)]),hits=[];for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3];if((a.y<y)!==(b.y<y)){const t=(y-a.y)/(b.y-a.y);hits.push([a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t]);}}if(hits.length===2)lines.push(hits);}return lines;}
function radius(lines,angle){const ux=Math.cos(angle),uz=Math.sin(angle),hits=[];for(const[[ax,az],[bx,bz]]of lines){const dx=bx-ax,dz=bz-az,den=ux*dz-uz*dx;if(Math.abs(den)<1e-10)continue;const r=(ax*dz-az*dx)/den,t=(ax*uz-az*ux)/den;if(r>0&&t>=0&&t<=1)hits.push(r);}return hits.length?Math.max(...hits):null;}
const samples=process.argv.includes('--sweep')?[['rest',0],...[['wave',4],['victory',5],['billiards',6]].flatMap(([id,duration])=>Array.from({length:duration*10+1},(_,i)=>[id,i/10]))]:[['rest',0],['wave',1.6],['victory',2],['billiards',2]];
const results=[];let total=0,min=Infinity;
for(const[motion,time]of samples){if(motion==='rest')rig.reset();else{applyMotion(driver,motion,time);applyRetarget(driver,rig);}scene.updateMatrixWorld(true);const inverse=rig.bones.Hips.matrixWorld.clone().invert(),s=poseMeshes(shirt,inverse),p=poseMeshes(pants,inverse),hem=scene.userData.shirtConstruction.hemY,edges=[];for(const{mesh,p}of s){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++)if(Math.abs(a.getY(i)-hem)<1e-5)edges.push(p[i].y);}const bottom=Math.max(...edges)+.004,top=Math.max(...p.flatMap(m=>m.p.map(v=>v.y)))-.004;let checked=0,worst=Infinity,penetrations=0,missing=0;
for(let y=bottom;y<=top;y+=.005){const inner=slice(p,y),outer=slice(s,y);for(let a=0;a<96;a++){const angle=a/96*Math.PI*2,r=radius(inner,angle);if(r===null)continue;const q=radius(outer,angle);if(q===null){missing++;continue;}const d=q-r;checked++;worst=Math.min(worst,d);if(d<0)penetrations++;}}
 total+=checked;min=Math.min(min,worst);results.push({motion,time,checked,minClearance:worst,penetrations,missingShirt:missing});}
console.log(JSON.stringify({sampledPoses:samples.length,radialSamples:total,minClearance:min,failures:results.filter(r=>r.penetrations||r.missingShirt||!r.checked),poses:process.argv.includes('--sweep')?undefined:results},null,2));
