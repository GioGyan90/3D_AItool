import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {parseCharacter} from '../public/lab/assets.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {RUNNING_PLAN} from '../public/lab/running-motion.js';
import {planToTake,applyRetarget} from '../public/lab/motion-plan.js';

const filename=process.argv[2];if(!filename)throw Error('Pass the actual GLB downloaded through the public page export button');
const browserBytes=new Uint8Array(await fs.readFile(filename)),sourceBytes=new Uint8Array(await fs.readFile(new URL('../public/lab/characters/running-woman/assembled-running-woman.glb',import.meta.url)));
function geometryOnly(bytes){const {json,bin}=readGLB(bytes);for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];return writeGLB(json,bin);}
const a=await parseCharacter(geometryOnly(sourceBytes)),b=await parseCharacter(geometryOnly(browserBytes));
const metadata=[];a.scene.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(a.scene.userData,metadata[0]);const target=prepareRig(a.scene).rig,driver=new Rig(createCharacter()),take=planToTake(driver,RUNNING_PLAN),parts=[];
a.scene.traverse(o=>{if(o.isSkinnedMesh)parts.push(o);});assert.equal(b.animations.length,1);const clip=b.animations[0];assert.ok(Math.abs(clip.duration-4)<1e-6);
for(const name of target.order)assert.ok(clip.tracks.some(t=>t.name===target.bones[name].name+'.quaternion'),'missing actual exported track '+name);
const mixer=new T.AnimationMixer(b.scene),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();let comparedVertices=0,maxError=0;
for(const time of [0,.1,.2,.4,.6,.8,1.7,2.9,3.9,4]){
  driver.applySnapshot(take.track.sample(time));applyRetarget(driver,target);mixer.setTime(time);b.scene.updateMatrixWorld(true);
  for(const mesh of parts){const actual=b.scene.getObjectByName(mesh.name);assert.ok(actual&&actual.isSkinnedMesh);assert.equal(actual.visible,true);assert.equal(actual.material.wireframe,false);for(let i=0;i<mesh.geometry.attributes.position.count;i++){const expected=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld),point=actual.getVertexPosition(i,new T.Vector3()).applyMatrix4(actual.matrixWorld);maxError=Math.max(maxError,point.distanceTo(expected));comparedVertices++;}}
}
assert.ok(maxError<5e-6,'browser export differs from actual intended running surfaces');
const {json:source,bin:sourceBin}=readGLB(sourceBytes),{json:exported,bin:exportBin}=readGLB(browserBytes);assert.equal(exported.images.length,source.images.length);
function imageBytes(j,bin,i){const v=j.bufferViews[j.images[i].bufferView];return bin.slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);}
const imagePixels=[];
for(let i=0;i<source.images.length;i++){
  const expected=imageBytes(source,sourceBin,i),actual=imageBytes(exported,exportBin,i);
  if(Buffer.from(expected).equals(Buffer.from(actual))){imagePixels.push({image:i,exactBytes:true,maxChannelDifference:0});continue;}
  // Browser canvas may re-encode PNG compression; compare decoded pixels, not
  // compressed-file hashes. This optional browser QA path requires Pillow.
  const script='import sys,json,base64,io\nfrom PIL import Image,ImageChops\nj=json.load(sys.stdin)\na=Image.open(io.BytesIO(base64.b64decode(j["a"]))).convert("RGBA")\nb=Image.open(io.BytesIO(base64.b64decode(j["b"]))).convert("RGBA")\nassert a.size==b.size\nd=ImageChops.difference(a,b)\nprint(json.dumps({"size":a.size,"maxChannelDifference":max(v[1] for v in d.getextrema())}))';
  const comparison=JSON.parse(execFileSync('python',['-c',script],{input:JSON.stringify({a:Buffer.from(expected).toString('base64'),b:Buffer.from(actual).toString('base64')}),encoding:'utf8'}));assert.ok(comparison.maxChannelDifference<=1,'browser changed texture pixels');imagePixels.push({image:i,exactBytes:false,...comparison});
}
const materials=exported.materials;assert.ok(materials.some(m=>m.name==='Teal athletic tank'&&m.pbrMetallicRoughness.baseColorFactor[1]>m.pbrMetallicRoughness.baseColorFactor[0]),'grey inspection state leaked into export');
const report={fileSHA256:createHash('sha256').update(browserBytes).digest('hex'),bytes:browserBytes.byteLength,parts:parts.length,animatedBones:target.order.length,tracks:clip.tracks.length,duration:clip.duration,embeddedImages:exported.images.length,imagePixels,sampledPoses:10,comparedVertices,maxError,inspectionStateExcluded:true};console.log(JSON.stringify(report,null,2));
