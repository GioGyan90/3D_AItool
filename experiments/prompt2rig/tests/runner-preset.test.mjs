import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {readGLB,writeGLB} from '../public/lab/glb-codec.js';
import {prepareRig} from '../public/lab/rig-adapter.js';
import {loadRunnerPreset} from '../public/lab/runner-preset.js';
import {getProceduralParts,setProceduralView,proceduralSettings} from '../public/lab/procedural-character.js';
import {validatePlan,planToTake,applyRetarget} from '../public/lab/motion-plan.js';
import {createCharacter} from '../public/lab/character.js';
import {Rig} from '../public/retarget.js';
import {RUNNING_PLAN} from '../public/lab/running-motion.js';

const dir=new URL('../public/lab/characters/running-woman/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',dir),'utf8'));
function untextured(bytes){const {json,bin}=readGLB(bytes);for(const m of json.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;json.images=[];json.textures=[];return writeGLB(json,bin);}
async function load(name='assembled-running-woman.glb'){return (await parseCharacter(untextured(new Uint8Array(await fs.readFile(new URL(name,dir)))))).scene;}
const meshes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};

test('runner preserves an independent complete adult source and exact anatomical joint lengths',async()=>{
  const source=await load('complete-source.glb'),root=await load(),a=prepareRig(source).rig,b=prepareRig(root).rig;
  assert.equal(manifest.source.license,'CC0-1.0');assert.equal(manifest.source.bodyProportionsChanged,false);assert.equal(manifest.source.completeBasePreserved,true);assert.match(manifest.source.asset,/Superhero Female/);
  assert.equal(manifest.rig.sourceJoints,65);assert.equal(manifest.rig.totalJoints,71);assert.equal(b.order.length,58);assert.equal(a.order.length,52);
  for(const n of a.order)assert.ok(a.rest[n].wp.distanceTo(b.rest[n].wp)<1e-7,n+' source joint moved');
  const ids=meshes(root).map(m=>m.name);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.includes('tank')&&ids.includes('leggings_waist')&&ids.includes('skin_L')&&ids.includes('skin_R'));assert.ok(manifest.after.triangles<21000);
  for(const side of ['L','R']){
    const skin=root.getObjectByName('skin_'+side),p=skin.geometry.attributes.position;let shoulder=0;
    for(let i=0;i<p.count;i++){assert.ok(p.getY(i)>=manifest.construction.waistY-1e-6,'hidden legs must be physically removed');if(Math.abs(p.getX(i))>.13&&Math.abs(p.getX(i))<.23&&p.getY(i)>1.31&&p.getY(i)<1.44)shoulder++;}
    assert.ok(shoulder>25,'sleeveless shoulders must remain real skin');
  }
  const full=source.getObjectByName('complete_body');assert.ok(full.geometry.attributes.position.count>6000);assert.ok(new T.Box3().setFromObject(full).min.y<.03);
  for(const side of ['L','R']){const upper=new T.Box3().setFromObject(root.getObjectByName('shoe_'+side)),sole=new T.Box3().setFromObject(root.getObjectByName('sole_'+side));assert.ok(upper.min.y<sole.max.y+.0005,'shoe upper must actually meet its sole');}
  const tank=root.getObjectByName('tank'),binding=root.getObjectByName('tank_binding');assert.ok(binding,'real opening walls must exist');
  const pointKey=p=>p.toArray().map(v=>Math.round(v*1e5)).join(','),outer=new Set(Array.from({length:tank.geometry.attributes.position.count},(_,i)=>pointKey(new T.Vector3().fromBufferAttribute(tank.geometry.attributes.position,i)))),inner=[...new Map(Array.from({length:binding.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(binding.geometry.attributes.position,i)).filter(p=>!outer.has(pointKey(p))).map(p=>[pointKey(p),p])).values()];
  assert.ok(inner.length>20,'opening binding must return into the body, not duplicate the outer edge');
  const skinTriangles=[];for(const m of meshes(root).filter(m=>/^(head_neck|skin_)/.test(m.name))){const g=m.geometry;for(let i=0;i<g.index.count;i+=3)skinTriangles.push(new T.Triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(g.attributes.position,g.index.getX(i+k)))));}
  const closest=new T.Vector3();for(const p of inner){let distance=Infinity;for(const tri of skinTriangles){tri.closestPointToPoint(p,closest);distance=Math.min(distance,closest.distanceTo(p));}assert.ok(distance<.003,'an opening wall must meet retained actual skin');}
});

test('runner loader registers independent inspection states, actual soles and all six helper tracks',async()=>{
  const old=globalThis.fetch;globalThis.fetch=async url=>{const bytes=new Uint8Array(await fs.readFile(url));return new Response(String(url).includes('.glb')?untextured(bytes):bytes);};
  let a,b;try{a=await loadRunnerPreset();b=await loadRunnerPreset();}finally{globalThis.fetch=old;}
  assert.notEqual(a.root,b.root);assert.equal(a.defaultMotion,'run');assert.equal(a.root.userData.soleGrounding,true);assert.equal(getProceduralParts(a.root).length,manifest.parts.length);
  for(const side of ['Left','Right']){assert.equal(a.rig.bones[side+'Foot'].parent,a.rig.bones[side+'Leg']);for(const helper of ['KneeBend','ElbowBend','ForearmMid'])assert.ok(a.rig.order.includes('Runner_'+side+helper));}
  setProceduralView(a.root,{surface:'grey',isolated:'hair',explosion:.8});assert.equal(proceduralSettings(b.root).explosion,0);assert.equal(proceduralSettings(b.root).isolated,'all');
});

test('running plan respects the existing protocol and visibly alternates actual limbs',async()=>{
  assert.equal(validatePlan(RUNNING_PLAN).frames.length,61);assert.equal(RUNNING_PLAN.duration,4);assert.equal(RUNNING_PLAN.loop,true);
  const root=await load(),target=prepareRig(root).rig,driver=new Rig(createCharacter()),take=planToTake(driver,RUNNING_PLAN),positions={};
  for(const t of [0,.2,.4,.6,.8]){driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);positions[t]=Object.fromEntries(['LeftHand','RightHand','LeftFoot','RightFoot','Hips'].map(n=>[n,target.bones[n].getWorldPosition(new T.Vector3())]));}
  assert.ok(positions[0].LeftFoot.distanceTo(positions[.4].LeftFoot)>.35);assert.ok(positions[0].LeftHand.distanceTo(positions[.4].LeftHand)>.12);
  assert.ok(Math.abs(positions[0].LeftFoot.y-positions[.4].RightFoot.y)<1e-5);assert.ok(Math.abs(positions[0].LeftFoot.z-positions[.4].RightFoot.z)<1e-5);
  for(const n of Object.keys(positions[0]))assert.ok(positions[0][n].distanceTo(positions[.8][n])<1e-5,n+' cycle mismatch');
  for(const t of [0,.1,.2,.3,.4,.6]){driver.applySnapshot(take.track.sample(t));applyRetarget(driver,target);for(const [side,sign]of [['Left',1],['Right',-1]]){const at=n=>target.bones[side+n].getWorldPosition(new T.Vector3()),palm=at('HandMiddle1').sub(at('Hand')).normalize().cross(at('HandIndex1').sub(at('HandPinky1'))).multiplyScalar(sign).normalize();assert.ok(palm.dot(new T.Vector3(-sign,0,0))>.95,side+' running palm must face inward');}}
});

test('actual complete run passes surface, waist, contact, rotation and exported vertex validation',()=>{
  const r=JSON.parse(execFileSync(process.execPath,['--experimental-loader',fileURLToPath(new URL('./vendor-loader.mjs',import.meta.url)),fileURLToPath(new URL('../tools/check-running-woman.mjs',import.meta.url))],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(r.sampledPoses,242);assert.equal(r.bakedRotationSamples,241);assert.ok(r.garmentParts.includes('skin_L')&&r.garmentParts.includes('skin_R'));assert.deepEqual(r.failures,[]);assert.ok(r.minNormalAlignment>.1&&r.minAreaRatio>.1&&r.maxEdgeStretch<2.5);
  assert.ok(r.waist.samples>40000&&r.waist.minGap>0&&r.waist.penetrations===0);assert.ok(r.contact.stanceSamples>40&&r.contact.flightSamples>40);assert.ok(r.contact.minSoleY>=0&&r.contact.maxLowestSoleY>.02);
  for(const [n,row]of Object.entries(r.rotation)){assert.ok(row.maxStepDegrees<13,n+' frame discontinuity');if(n.endsWith('Hand'))assert.ok(row.maxLocalAngleDegrees<10,n+' excessive wrist correction');if(n.endsWith('ForeArm'))assert.ok(row.twistRangeDegrees<45,n+' axial winding');if(n.endsWith('Foot'))assert.ok(row.maxLocalAngleDegrees<46,n+' ankle range');}
  assert.ok(r.export.comparedVertices>100000&&r.export.maxReloadError<1e-5);assert.equal(r.export.imagesPreserved,2);assert.ok(r.loop.maxJointSeamDegrees<.001&&r.loop.hipSeamMeters<1e-5);
});
