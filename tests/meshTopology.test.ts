import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrimitiveControlMesh, insertQuadEdgeLoop} from '../src/components/meshTopology';

function countEdgeUses(faces: number[][]) {
  const edges = new Map<string, number>();
  for (const f of faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.values()];
}

test('a cube begins with 8 shared vertices and six outward-facing quad faces', () => {
  const base = createPrimitiveControlMesh('box');
  assert.equal(base.vertices.length, 8);
  assert.equal(base.faces.length, 6);
  assert.ok(base.faces.every(face => face.length === 4));
  assert.ok(countEdgeUses(base.faces).every(n => n === 2));
});

test('all cube edge loops remain closed/manifold at noncentral offsets', () => {
  const base = createPrimitiveControlMesh('box');
  const frozen = JSON.stringify(base);
  for (let face = 0; face < 6; face++) for (let edge = 0; edge < 4; edge++) {
    const next = insertQuadEdgeLoop(base, face, edge, .3);
    assert.equal(next.vertices.length, 12);
    assert.equal(next.faces.length, 10);
    assert.ok(next.faces.every(f => f.length === 4));
    assert.ok(countEdgeUses(next.faces).every(n => n === 2));
  }
  assert.equal(JSON.stringify(base), frozen, 'operation must not mutate source');
});

test('cylinder and sphere admit transverse rings without splitting caps', () => {
  const cylinder = createPrimitiveControlMesh('cylinder');
  const c = insertQuadEdgeLoop(cylinder, 0, 0, .25);
  assert.equal(c.vertices.length, cylinder.vertices.length + 12);
  assert.equal(c.faces.length, cylinder.faces.length + 12);
  assert.ok(countEdgeUses(c.faces).every(n => n === 2));

  const sphere = createPrimitiveControlMesh('sphere');
  const s = insertQuadEdgeLoop(sphere, 12, 0, .25);
  assert.equal(s.vertices.length, sphere.vertices.length + 12);
  assert.equal(s.faces.length, sphere.faces.length + 12);
  assert.ok(countEdgeUses(s.faces).every(n => n === 2));
});

test('non-quad, unsafe, and extreme fraction cuts are rejected', () => {
  const sphere = createPrimitiveControlMesh('sphere');
  assert.throws(() => insertQuadEdgeLoop(sphere, 0, 0), /四边面/);
  assert.throws(() => insertQuadEdgeLoop(sphere, 12, 1), /非四边面/);
  assert.throws(() => insertQuadEdgeLoop(createPrimitiveControlMesh('box'), 0, 0, 1), /位置/);
});

import {splitQuadLocally,insetControlFace,extrudeControlFace,mirrorControlMeshX,validateControlTopology}
  from '../src/components/meshTopology';
import {triangulateFaces} from '../src/components/traceGeometry';

function checkClosed(mesh: ReturnType<typeof createPrimitiveControlMesh>) {
  const stat=validateControlTopology(mesh);
  assert.equal(stat.boundaryEdges,0,'no open seams or T-junctions');
  assert.equal(mesh.vertices.length-stat.edges+mesh.faces.length,2,'genus-zero Euler characteristic');
  const triangles=triangulateFaces(mesh.vertices,mesh.faces);
  assert.equal(triangles.length/3,mesh.faces.reduce((n,f)=>n+f.length-2,0));
  for(const t of triangles)assert.ok(t>=0&&t<mesh.vertices.length);
}
test('all three original primitives triangulate as closed, correctly oriented cages',()=>{
  for(const type of ['box','cylinder','sphere'] as const)checkClosed(createPrimitiveControlMesh(type));
});
test('local quad cut seals both neighbors instead of creating T-junctions',()=>{
  for(const type of ['box','cylinder','sphere'] as const){
    const base=createPrimitiveControlMesh(type);
    const fi=type==='sphere'?12:0;
    const next=splitQuadLocally(base,fi,0,.3);
    assert.equal(next.vertices.length,base.vertices.length+2);
    assert.equal(next.faces.length,base.faces.length+3);
    checkClosed(next);
    assert.equal(next.faces.filter(f=>f.length===3).length,
      base.faces.filter(f=>f.length===3).length+2);
  }
});
test('local cutting works after a full loop; no extra regular grid is introduced',()=>{
  const mesh=insertQuadEdgeLoop(createPrimitiveControlMesh('box'),0,0,.25);
  checkClosed(mesh);
  const next=splitQuadLocally(mesh,0,0,.6);
  checkClosed(next);
  assert.equal(next.vertices.length,mesh.vertices.length+2);
});
test('face inset creates one cap and one quad per original edge while keeping manifold',()=>{
  for(const type of ['box','sphere','cylinder'] as const){
    const mesh=createPrimitiveControlMesh(type);
    const fi=type==='sphere'?12:0;
    const n=mesh.faces[fi].length;
    const next=insetControlFace(mesh,fi,.3);
    assert.equal(next.vertices.length,mesh.vertices.length+n);
    assert.equal(next.faces.length,mesh.faces.length+n);
    checkClosed(next);
  }
});
test('extrusion creates raised cap and true attached side walls, with manifold normals',()=>{
  for(const type of ['box','sphere','cylinder'] as const){
    const mesh=createPrimitiveControlMesh(type);
    const fi=type==='sphere'?12:0;
    const n=mesh.faces[fi].length;
    const next=extrudeControlFace(mesh,fi,.2);
    assert.equal(next.vertices.length,mesh.vertices.length+n);
    assert.equal(next.faces.length,mesh.faces.length+n);
    checkClosed(next);
  }
});
test('inset then extrude forms a complex low-poly structure without remeshing',()=>{
  const base=createPrimitiveControlMesh('box');
  const inset=insetControlFace(base,0,.3);
  const extruded=extrudeControlFace(inset,4,.4);
  checkClosed(extruded);
  assert.equal(base.vertices.length,8);
  assert.equal(extruded.vertices.length,16);
});
test('X half-mirror welds seam IDs and removes internal center cap',()=>{
  const half=createPrimitiveControlMesh('box');
  const vertices=half.vertices.map(v=>[v[0]+.5,v[1],v[2]] as [number,number,number]);
  const mirrored=mirrorControlMeshX({...half,vertices});
  assert.equal(mirrored.vertices.length,12);
  assert.equal(mirrored.faces.length,10);
  assert.ok(mirrored.faces.every(f=>!f.every(i=>mirrored.vertices[i][0]===0)));
  assert.equal(mirrored.vertices.filter(v=>v[0]===0).length,4);
  checkClosed(mirrored);
});
test('reject invalid mirror, non-manifold input, unsafe fractions and zero extrusion',()=>{
  assert.throws(()=>mirrorControlMeshX(createPrimitiveControlMesh('box')),/跨越中心线/);
  assert.throws(()=>splitQuadLocally(createPrimitiveControlMesh('box'),0,0,1),/位置/);
  assert.throws(()=>insetControlFace(createPrimitiveControlMesh('box'),0,0),/比例/);
  assert.throws(()=>extrudeControlFace(createPrimitiveControlMesh('box'),0,0),/距离/);
  const broken=createPrimitiveControlMesh('box');
  broken.faces.push([...broken.faces[0]]);
  assert.throws(()=>validateControlTopology(broken),/非流形边/);
});

import {createRubikBuildSteps,createRubikControlMesh,RUBIK_FACE_COLORS} from '../src/components/rubikPreset';
import {buildEditableGeometry} from '../src/studioProject';
import * as THREE from 'three';

test('Rubik example is constructed by precisely six genuine quad edge-loop insertions',()=>{
  const steps=createRubikBuildSteps();
  assert.equal(steps.length,7);
  assert.equal(steps[0].vertices.length,8);
  assert.equal(steps[0].faces.length,6);
  steps.forEach((step,i)=>{
    checkClosed(step);
    assert.ok(step.faces.every(f=>f.length===4));
    if(i){
      assert.ok(step.vertices.length>steps[i-1].vertices.length);
      assert.ok(step.faces.length>steps[i-1].faces.length);
    }
  });
  assert.equal(steps[6].vertices.length,56,'no duplicated seam vertices');
  assert.equal(steps[6].faces.length,54,'six sides with nine quads each');
  assert.equal(validateControlTopology(steps[6]).edges,108);
});
test('Rubik paints 9 independent stickers for each of six faces without modifying cage topology',()=>{
  const mesh=createRubikControlMesh();
  assert.equal(mesh.vertices.length,56);
  assert.equal(mesh.faces.length,54);
  assert.equal(mesh.faceColors?.length,54);
  for(const color of Object.values(RUBIK_FACE_COLORS))
    assert.equal(mesh.faceColors!.filter(x=>x===color).length,9,color);
  checkClosed(mesh);
  const parsed=new THREE.BufferGeometryLoader().parse(buildEditableGeometry(mesh));
  assert.equal(parsed.getAttribute('position').count,648,'108 dark shell + 108 sticker triangles');
  assert.ok(parsed.getAttribute('color'),'per triangle paint for scene render');
  parsed.dispose();
});
test('paint follows control faces when making local cuts, loops, inset and extrude',()=>{
  const rubik=createRubikControlMesh();
  const inFace=0;
  const inset=insetControlFace(rubik,inFace,.16);
  checkClosed(inset);
  assert.equal(inset.faceColors?.length,inset.faces.length);
  const extruded=extrudeControlFace(inset,4,.08);
  checkClosed(extruded);
  assert.equal(extruded.faceColors?.length,extruded.faces.length);
  const locallySplit=splitQuadLocally(rubik,0,0,.5);
  checkClosed(locallySplit);
  assert.equal(locallySplit.faceColors?.length,locallySplit.faces.length);
  const simple=createPrimitiveControlMesh('box');
  simple.faceColors=Array(6).fill('#ff0000');
  const loop=insertQuadEdgeLoop(simple,0,0,.3);
  checkClosed(loop);
  assert.equal(loop.faceColors?.length,loop.faces.length);
});
test('invalid face color lists are rejected before reaching render or JSON',()=>{
  const colored=createRubikControlMesh();
  colored.faceColors=Array(3).fill('#ff0000');
  assert.throws(()=>validateControlTopology(colored),/颜色记录/);
});

import {findCoplanarFaceIds,findMatchingColorFaceIds,moveWithSymmetry,paintFaces} from '../src/components/topologySelection';

test('select all nine coplanar Rubik face quads without crossing adjacent planes',()=>{
  const cube=createRubikControlMesh();
  for(const color of Object.values(RUBIK_FACE_COLORS)){
    const seed=cube.faceColors!.indexOf(color);
    const planes=findCoplanarFaceIds(cube,seed);
    assert.equal(planes.length,9);
    assert.deepEqual(planes,findMatchingColorFaceIds(cube,seed));
  }
});
test('batch paint only updates selected faces without changing indices or source',()=>{
  const original=createRubikControlMesh();
  const selected=findCoplanarFaceIds(original,0);
  const before=JSON.stringify(original);
  const edited=paintFaces(original,selected,'#123456');
  assert.equal(edited.faceColors?.filter(c=>c==='#123456').length,9);
  assert.equal(JSON.stringify(original),before,'must not mutate original cage');
  assert.equal(JSON.stringify(edited.faces),JSON.stringify(original.faces));
  assert.equal(edited.vertices.length,56);
  checkClosed(edited);
  assert.throws(()=>paintFaces(original,[999],'#123456'),/索引/);
});
test('X symmetry moves opposite vertices with preserved topology and no new vertices',()=>{
  const mesh=createPrimitiveControlMesh('box');
  const result=moveWithSymmetry(mesh,1,[.72,-.4,-.52],['x']);
  assert.equal(result.unmatched,0);
  assert.deepEqual(result.vertices[1],[.72,-.4,-.52]);
  assert.deepEqual(result.vertices[0],[-.72,-.4,-.52]);
  assert.deepEqual(result.vertices[2],mesh.vertices[2],'unselected counterpart unchanged');
  assert.equal(result.changed.length,2);
  assert.equal(result.vertices.length,8);
  assert.equal(JSON.stringify(mesh.vertices[0]),JSON.stringify([-.5,-.5,-.5]));
});
test('multi-axis symmetry applies sign combinations and pins central seams',()=>{
  const cube=createPrimitiveControlMesh('box');
  const out=moveWithSymmetry(cube,1,[.66,-.22,-.44],['x','y']);
  assert.equal(out.changed.length,4);
  assert.deepEqual(out.vertices[0],[-.66,-.22,-.44]);
  assert.deepEqual(out.vertices[2],[.66,.22,-.44]);
  assert.deepEqual(out.vertices[3],[-.66,.22,-.44]);
  const center={vertices:[[0,.5,.5],[0,-.5,.5]] as [number,number,number][],faces:[]};
  const pinned=moveWithSymmetry(center,0,[.2,.75,.4],['x']);
  assert.deepEqual(pinned.vertices[0],[0,.75,.4]);
  assert.equal(pinned.changed.length,1);
  assert.equal(pinned.unmatched,0);
});

import {calibrateAnchors,projectLandmark,edgeResidual,facingEdges,fitLandmark,type Vec3} from '../src/components/referenceCalibration';
test('independent reference crops recover scale, center, rotation and world coordinates',()=>{
 const v:Vec3[]=[[-1,2,0],[1,1,2],[0,-2,-1],[.4,.1,1.3]];
 const front={cx:420,cy:510,scale:150,rotation:4,flip:false};
 const side={cx:610,cy:440,scale:220,rotation:-7,flip:true};
 for(const [view,c] of [['front',front],['side',side]] as const){
  const fitted=calibrateAnchors(v,view,v.slice(0,3).map((p,vertex)=>({vertex,pixel:projectLandmark(p,view,c)})),c.flip);
  for(const p of v)assert.ok(Math.hypot(...projectLandmark(p,view,c).map((x,i)=>x-projectLandmark(p,view,fitted)[i]))<1e-8);
 }
 const p=v[3],q=fitLandmark([0,0,0],{vertex:3,front:projectLandmark(p,'front',front),side:projectLandmark(p,'side',side)},front,side);
 assert.ok(Math.hypot(...q.map((x,i)=>x-p[i]))<1e-8);
 assert.throws(()=>calibrateAnchors(v,'front',[{vertex:0,pixel:[10,10]},{vertex:0,pixel:[11,11]}]));
 const a:Vec3=[0,0,0],z:Vec3=[1,0,0],c={cx:0,cy:0,scale:10,rotation:0,flip:false};
 const e=edgeResidual(a,z,[0,0],[0,20],'front',c);assert.equal(e.angleError,90);assert.equal(e.lengthError,-10);
});
test('facing edge filter keeps front-facing control surfaces',()=>{
 const v:Vec3[]=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
 const f=facingEdges(v,[[0,1,2,3],[7,6,5,4]],'front');
 assert.deepEqual([...f.points],[0,1,2,3]);assert.equal(f.edges.size,4);
});

import {calibrateProfile,type ProfileOptions} from '../src/components/profileCalibration';
test('local profile preserves topology and untouched axes, repairs mirrored depressions',()=>{
 const mesh={vertices:[[0,0,1.4],[-.8,0,1.2],[-.2,0,1.2],[.8,0,1.2],[.2,0,1.2],[0,1,1.4]] as [number,number,number][],faces:[[0,2,5],[2,1,5],[0,5,4],[4,5,3]]};
 const opts:ProfileOptions={along:0,depth:2,start:0,end:1,points:[2],bulge:.04,strength:1,mode:'fit',mirrorX:true};
 const result=calibrateProfile(mesh,opts);
 assert.deepEqual(result.mesh.faces,mesh.faces);
 assert.ok(Math.abs(result.mesh.vertices[2][2]-1.38)<1e-9);
 assert.equal(result.mesh.vertices[2][2],result.mesh.vertices[4][2]);
 assert.equal(mesh.vertices[2][2],1.2);
 for(const i of [0,1,3,5])assert.deepEqual(result.mesh.vertices[i],mesh.vertices[i]);
 for(let i=0;i<mesh.vertices.length;i++)assert.deepEqual(result.mesh.vertices[i].slice(0,2),mesh.vertices[i].slice(0,2));
 assert.throws(()=>calibrateProfile(mesh,{...opts,points:[3]}));
 assert.throws(()=>calibrateProfile(mesh,{...opts,depth:0}));
 assert.equal(calibrateProfile(mesh,{...opts,strength:0}).mesh.vertices[2][2],1.2);
 assert.equal(calibrateProfile(mesh,{...opts,mode:'lower'}).mesh.vertices[2][2],1.2);
});
