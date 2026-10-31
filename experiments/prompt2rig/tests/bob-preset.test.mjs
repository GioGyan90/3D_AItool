import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {loadBobPreset} from '../public/lab/bob-preset.js';
import {proceduralSettings,setProceduralView,getProceduralParts} from '../public/lab/procedural-character.js';
import {boundaryEdges} from '../tools/runner-geometry.mjs';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {planToTake,applyRetarget} from '../public/lab/motion-plan.js';
import {RUNNING_PLAN} from '../public/lab/running-motion.js';

const directory=new URL('../public/lab/characters/anime-bob-woman/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
function geometryOnly(bytes){const {json,bin}=readGLB(bytes);for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];return writeGLB(json,bin);}
async function load(url=new URL('assembled-anime-bob-woman.glb',directory)){return (await parseCharacter(geometryOnly(new Uint8Array(await fs.readFile(url))))).scene;}
const meshes=root=>{const result=[];root.traverse(o=>{if(o.isMesh)result.push(o);});return result;};

test('bob character preserves the real adult body and all 71 joint positions while replacing the head and hair',async()=>{
  const root=await load(),old=await load(new URL('../running-woman/assembled-running-woman.glb',directory)),target=prepareRig(root).rig,source=prepareRig(old).rig;
  assert.equal(manifest.source.revision,'6ff7fa5c7b451c7318cf445038f1514a646343ea');assert.equal(manifest.source.body.proportionsChanged,false);assert.match(manifest.source.face.asset,/HairSample_Female/);assert.match(manifest.source.hair.asset,/Sendagaya Shibu/);
  assert.equal(Object.keys(target.bones).length,71);assert.equal(target.order.length,58);
  for(const name of Object.keys(source.bones))assert.ok(target.rest[name].wp.distanceTo(source.rest[name].wp)<1e-8,name+' changed body joint');
  for(const m of meshes(old).filter(m=>/^(tank|leggings_|skin_|shoe_|sole_|laces_)/.test(m.name))){const actual=root.getObjectByName(m.name);assert.ok(actual);for(const attribute of ['position','normal','uv','skinIndex'])assert.deepEqual(actual.geometry.attributes[attribute].array,m.geometry.attributes[attribute].array,m.name+' '+attribute+' body data changed');assert.deepEqual(actual.geometry.index.array,m.geometry.index.array);const weights=actual.geometry.attributes.skinWeight.array,oldWeights=m.geometry.attributes.skinWeight.array;assert.equal(weights.length,oldWeights.length);for(let i=0;i<weights.length;i++)assert.ok(Math.abs(weights[i]-oldWeights[i])<1e-8,m.name+' body weight changed beyond GLTFLoader normalization rounding');}
  for(const name of ['head_neck','brows','eyes','hair'])assert.equal(root.getObjectByName(name),undefined,'old head/hair must be physically removed');
  assert.equal(meshes(root).length,26);assert.ok(root.getObjectByName('anime_face_skin'));const hair=root.getObjectByName('bob_locks');hair.geometry.computeBoundingBox();const box=hair.geometry.boundingBox;
  assert.ok(box.min.y>1.42&&box.min.y<1.49&&box.max.y<1.75&&box.max.x-box.min.x<.25,'bob must stay chin length with the fitted skull');
  assert.ok(manifest.after.triangles<24000&&manifest.before.triangles>34000);assert.ok(manifest.simplification.find(r=>r.part==='bob_locks').after<7000);
  for(const m of meshes(root)){const g=m.geometry;for(const a of Object.values(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n));for(let i=0;i<g.attributes.position.count;i++){let sum=0;for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k),j=g.attributes.skinIndex.getComponent(i,k);assert.ok(w>=0&&j>=0&&j<71);sum+=w;}assert.ok(Math.abs(sum-1)<5e-6);}}
});

test('new neck bridge closes both rings and remains coincident with adjoining skin during the actual run',async()=>{
  const root=await load(),target=prepareRig(root).rig,driver=new Rig(createCharacter()),take=planToTake(driver,RUNNING_PLAN),bridge=root.getObjectByName('anime_neck_bridge'),parts=[root.getObjectByName('anime_neck'),bridge,root.getObjectByName('anime_skull')],key=p=>p.toArray().map(v=>Math.round(v*1e5)).join(',');
  const vertices=[],indices=[];for(const mesh of parts){const offset=vertices.length/3;vertices.push(...mesh.geometry.attributes.position.array);indices.push(...Array.from(mesh.geometry.index.array,i=>i+offset));}const joined=new T.BufferGeometry();joined.setAttribute('position',new T.Float32BufferAttribute(vertices,3));joined.setIndex(indices);
  const [lower,upper]=[manifest.fitting.lowerY,manifest.fitting.upperY];const gaps=boundaryEdges(joined).filter(e=>[lower,upper].some(y=>[e.a,e.b].every(i=>Math.abs(joined.attributes.position.getY(i)-y)<2e-6)));assert.equal(gaps.length,0,'graft seam has an unpaired edge');
  const pairs=[];for(const [mesh,y]of [[parts[0],lower],[parts[2],upper]]){const byPosition=new Map();for(let i=0;i<mesh.geometry.attributes.position.count;i++)if(Math.abs(mesh.geometry.attributes.position.getY(i)-y)<2e-6)byPosition.set(key(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)),i);for(let i=0;i<bridge.geometry.attributes.position.count;i++)if(Math.abs(bridge.geometry.attributes.position.getY(i)-y)<2e-6){const match=byPosition.get(key(new T.Vector3().fromBufferAttribute(bridge.geometry.attributes.position,i)));assert.notEqual(match,undefined);pairs.push({mesh,a:match,b:i});}}
  assert.equal(pairs.length,manifest.fitting.neckRings.reduce((a,b)=>a+b));
  for(const time of [0,.1,.2,.4,.6,1.6,3.9]){driver.applySnapshot(take.track.sample(time));applyRetarget(driver,target);root.updateMatrixWorld(true);for(const {mesh,a,b}of pairs){const x=mesh.getVertexPosition(a,new T.Vector3()).applyMatrix4(mesh.matrixWorld),y=bridge.getVertexPosition(b,new T.Vector3()).applyMatrix4(bridge.matrixWorld);assert.ok(x.distanceTo(y)<2e-6,'graft opened at '+time);}}
});

test('bob and unreduced comparison loader retain separate inspection states and correct helper rig metadata',async()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=async url=>{const bytes=new Uint8Array(await fs.readFile(url));return new Response(String(url).includes('.glb')?geometryOnly(bytes):bytes);};let a,b,reference;
  try{a=await loadBobPreset();b=await loadBobPreset();reference=await loadBobPreset(true);}finally{globalThis.fetch=oldFetch;}
  assert.notEqual(a.root,b.root);assert.equal(a.defaultMotion,'run');assert.equal(reference.defaultMotion,null);assert.equal(a.rig.order.length,58);assert.equal(a.root.userData.soleGrounding,true);assert.equal(getProceduralParts(a.root).length,26);assert.equal(getProceduralParts(reference.root).length,26);
  setProceduralView(a.root,{surface:'grey',isolated:'bob_locks',explosion:1,wireframe:true});assert.equal(proceduralSettings(b.root).isolated,'all');assert.equal(proceduralSettings(b.root).explosion,0);
  setProceduralView(a.root,{isolated:'all',explosion:0,wireframe:false});for(const id of ['anime_brows','anime_eyeline','anime_eyelash','anime_eye_highlight'])assert.equal(a.root.getObjectByName(id).visible,false,id+' cutout paint card must not become a solid clay patch');assert.equal(a.root.getObjectByName('anime_face_skin').visible,true);
  setProceduralView(a.root,{surface:'original'});for(const mesh of meshes(a.root))assert.equal(mesh.visible,true,'original view must restore every face layer');
  for(const side of ['Left','Right'])for(const name of ['KneeBend','ElbowBend','ForearmMid'])assert.ok(a.rig.order.includes('Runner_'+side+name));
});

test('bob actual full run independently validates head/neck, surfaces, contact, fingers and complete exported vertices',()=>{
  const result=JSON.parse(execFileSync(process.execPath,['--experimental-loader',fileURLToPath(new URL('./vendor-loader.mjs',import.meta.url)),fileURLToPath(new URL('../tools/check-running-woman.mjs',import.meta.url)),'--bob'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(result.character,'anime-bob-woman');assert.equal(result.sampledPoses,242);assert.deepEqual(result.failures,[]);for(const name of ['anime_neck','anime_neck_bridge','anime_skull','anime_face_skin'])assert.ok(result.garmentParts.includes(name));
  assert.ok(result.minNormalAlignment>.1&&result.minAreaRatio>.1&&result.maxEdgeStretch<2.5);assert.equal(result.hands.bakedFingerTracks,30);assert.equal(result.hands.controlledFingerBones,30);assert.ok(result.waist.minGap>0&&result.waist.penetrations===0);assert.ok(result.contact.minSoleY>=0&&result.contact.flightSamples>40);
  assert.equal(result.export.imagesPreserved,10);assert.ok(result.export.comparedVertices>210000&&result.export.maxReloadError<1e-5);assert.ok(result.loop.maxJointSeamDegrees<.001);
});
