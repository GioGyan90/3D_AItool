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

import {scanProfile,calibrateProfiles} from '../src/components/profileCalibration';
test('profile scanning respects slab connectivity and atomic profile edits preserve topology',()=>{
 const mesh={vertices:[[0,0,1],[1,0,0.4],[2,0,1],[0,1,1],[1,1,.6],[2,1,1],[1,0,-2]] as [number,number,number][],faces:[[0,1,4,3],[1,2,5,4]]};
 const a={along:0 as const,depth:2 as const,start:0,end:2,bulge:.1};
 assert.deepEqual(scanProfile(mesh,a,.01,.05).map(c=>c.id),[1]);
 assert.throws(()=>scanProfile(mesh,{...a,end:5},0,.05));
 const j={...a,points:[1],mirrorX:false};
 const k={...j,start:3,end:5,points:[4]};
 const result=calibrateProfiles(mesh,[j,k]);
 assert.equal(result.mesh.vertices[1][2],1.1);
 assert.equal(result.mesh.vertices[4][2],1.1);
 assert.deepEqual(result.mesh.vertices[6],mesh.vertices[6]);
 assert.deepEqual(result.mesh.faces,mesh.faces);
 assert.throws(()=>calibrateProfiles(mesh,[j,{...j,bulge:.2}]));
});

import {assertRegionProtected,slideOnEdge} from '../src/components/regionEditing';
test('edge slide keeps indices and respects protected vertices',()=>{
 const mesh={vertices:[[0,0,0],[2,0,0],[2,2,0],[0,2,0]] as [number,number,number][],faces:[[0,1,2,3]]};
 const next=slideOnEdge(mesh,0,1,.25);
 assert.deepEqual(next.vertices[0],[.5,0,0]);assert.deepEqual(next.faces,mesh.faces);
 assert.deepEqual(mesh.vertices[0],[0,0,0]);assert.deepEqual(next.vertices.slice(1),mesh.vertices.slice(1));
 assert.doesNotThrow(()=>assertRegionProtected(mesh,next,[1,2]));
 assert.throws(()=>assertRegionProtected(mesh,next,[0]));
 assert.throws(()=>slideOnEdge(mesh,0,2,.25));
 assert.throws(()=>slideOnEdge(mesh,0,1,1));
 assert.throws(()=>assertRegionProtected(mesh,{...mesh,faces:[[0,1,2]]},[3]));
});


import {slideContinuousEdgeLoop} from '../src/components/loopSlide';
test('a connected quad edge chain slides atomically toward either adjacent side',()=>{
 const vertices=[] as [number,number,number][];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)vertices.push([x-1,y,0]);
 const faces:number[][]=[];
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){
  const a=y*3+x;faces.push([a,a+1,a+4,a+3]);
 }
 const mesh={vertices,faces},snapshot=JSON.stringify(mesh);
 const left=slideContinuousEdgeLoop(mesh,[1,4,7],0,.25);
 assert.deepEqual(left.mesh.vertices[1],[-.25,0,0]);
 assert.deepEqual(left.mesh.vertices[4],[-.25,1,0]);
 assert.deepEqual(left.mesh.vertices[7],[-.25,2,0]);
 assert.equal(left.report.movedVertices,3);
 assert.ok(left.report.maxNormalDeviationDegrees<1e-5);
 assert.ok(left.report.minFaceAreaRatio>0);
 assert.deepEqual(left.mesh.faces,faces);
 assert.equal(JSON.stringify(mesh),snapshot);
 const right=slideContinuousEdgeLoop(mesh,[1,4,7],2,.5);
 assert.deepEqual(right.mesh.vertices[4],[.5,1,0]);
 assert.throws(()=>slideContinuousEdgeLoop(mesh,[1,7],0,.25),/环线/);
 assert.throws(()=>slideContinuousEdgeLoop(mesh,[1,4,7],1,.25),/引导顶点/);
 assert.throws(()=>slideContinuousEdgeLoop(mesh,[1,4,7],0,1),/比例/);
 assert.throws(()=>assertRegionProtected(mesh,left.mesh,[4]),/锁定顶点/);
});
test('continuous loop guide can optionally mirror the paired half without index changes',()=>{
 const vertices=[] as [number,number,number][];
 for(let y=0;y<3;y++)for(let x=-2;x<=2;x++)vertices.push([x,y,0]);
 const faces:number[][]=[];
 for(let y=0;y<2;y++)for(let x=0;x<4;x++){
  const a=y*5+x;faces.push([a,a+1,a+6,a+5]);
 }
 const mesh={vertices,faces};
 const result=slideContinuousEdgeLoop(mesh,[1,6,11],0,.25,{mirrorX:true});
 assert.equal(result.report.movedVertices,6);
 for(const y of [0,1,2]){
  assert.equal(result.mesh.vertices[y*5+1][0],-1.25);
  assert.equal(result.mesh.vertices[y*5+3][0],1.25);
 }
 assert.deepEqual(result.mesh.faces,faces);
 assert.throws(()=>slideContinuousEdgeLoop(mesh,[2,7,12],1,.2,{mirrorX:true}),/镜像后目标冲突/);
});
test('an actual inserted quad loop is closed and can slide without T-junctions',()=>{
 const base=createPrimitiveControlMesh('box');
 const mesh=insertQuadEdgeLoop(base,0,0,.5);
 const ids=mesh.vertices.map((_,i)=>i).filter(i=>i>=base.vertices.length);
 const neighbors=(v:number)=>[...new Set(mesh.faces.flatMap(f=>f.flatMap((a,i)=>a===v?[f[(i+1)%f.length],f[(i+f.length-1)%f.length]]:[])))].filter(i=>ids.includes(i));
 const chain=[ids[0]];
 let previous=-1;
 while(chain.length<ids.length){
  const next=neighbors(chain.at(-1)!).find(i=>i!==previous&&!chain.includes(i));
  assert.notEqual(next,undefined);
  previous=chain.at(-1)!;chain.push(next!);
 }
 assert.ok(neighbors(chain.at(-1)!).includes(chain[0]));
 const guides=[...new Set(mesh.faces.flatMap(f=>f.flatMap((a,i)=>a===chain[0]?[f[(i+1)%f.length],f[(i+f.length-1)%f.length]]:[])))].filter(i=>!ids.includes(i));
 const result=guides.map(guide=>{try{return slideContinuousEdgeLoop(mesh,chain,guide,.2,{closed:true})}catch{return null}}).find(Boolean);
 assert.ok(result,'at least one valid adjacent quad strip should accept a closed loop');
 checkClosed(result!.mesh);
 assert.equal(result!.mesh.vertices.length,mesh.vertices.length);
 assert.equal(result!.mesh.faces.length,mesh.faces.length);
});


import {surfaceQuality,vertexDisplacement,displacementColors,optimizeQuad} from '../src/components/surfaceQuality';
test('surface diagnostics distinguish planar and warped faces and report shared edge angles',()=>{
 const vertices:[number,number,number][]=[[0,0,0],[1,0,0],[1,1,.2],[0,1,0],[2,0,0],[2,1,0]];
 const mesh={vertices,faces:[[0,1,2,3],[1,4,5,2]]};
 const q=surfaceQuality(mesh);
 assert.ok(q.faces[0].relative!>0.01);assert.equal(q.edges.length,1);assert.ok(q.edges[0].degrees>0);
 const flat={vertices:vertices.map(v=>[v[0],v[1],0] as [number,number,number]),faces:mesh.faces};
 assert.equal(surfaceQuality(flat).faces[0].distance,0);
 const d=vertexDisplacement(flat,mesh);assert.equal(d.moved,1);assert.equal(d.max,.2);
 assert.notEqual(displacementColors(d.values,d.max)[0],displacementColors(d.values,d.max)[2]);
 assert.throws(()=>vertexDisplacement(flat,{...mesh,faces:[[0,1,2]]}));
});
test('quad diagonal optimization preserves winding and retains concave polygon ear cut',()=>{
 const v:[number,number,number][]=[[0,0,0],[2,0,0],[2,1,.6],[0,1,0]];
 const f=[0,1,2,3],original=[0,1,2,0,2,3];
 const next=optimizeQuad(v,f,original);
 assert.equal(next.length,6);assert.equal(new Set(next).size,4);
 const concave:[number,number,number][]=[[0,0,0],[2,0,0],[.4,.4,0],[0,2,0]];
 assert.deepEqual(optimizeQuad(concave,f,original),original);
});


import {mirrorTrianglesX} from '../src/components/mirrorTriangulation';
import {triangulateFacesWithReport} from '../src/components/traceGeometry';
test('mirror rendering preserves paired quad and pentagon winding without adding control vertices',()=>{
 const v:[number,number,number][]=[[-1,0,0],[-2,0,0],[-2,1,.2],[-1.5,1.5,.3],[-1,1,0],[1,0,0],[2,0,0],[2,1,.2],[1.5,1.5,.3],[1,1,0]];
 const faces=[[0,1,2,3,4],[5,9,8,7,6]];
 const source=[[0,1,2,0,2,3,0,3,4],[5,9,8,5,8,7,5,7,6]];
 const original=JSON.stringify({v,faces,source});
 const result=mirrorTrianglesX(v,faces,source);
 assert.equal(result.report.matchedVertices,10);
 assert.equal(result.report.pairedFaces,2);
 assert.equal(result.report.unmatchedTriangles,0);
 assert.deepEqual(result.byFace[1],[5,7,6,5,8,7,5,9,8]);
 assert.equal(JSON.stringify({v,faces,source}),original);
 assert.equal(triangulateFacesWithReport(v,faces,true).report.unmatchedTriangles,0);
 const asymmetric=v.map(p=>[...p] as [number,number,number]);asymmetric[9][2]=.1;
 assert.deepEqual(mirrorTrianglesX(asymmetric,faces,source).byFace,source);
 assert.equal(mirrorTrianglesX(asymmetric,faces,source).report.unmatchedTriangles,null);
});
test('center spanning quad reports unresolved symmetry rather than inventing vertices',()=>{
 const v:[number,number,number][]=[[-1,0,0],[1,0,0],[1,1,0],[-1,1,0]];
 const faces=[[0,1,2,3]],source=[[0,1,2,0,2,3]];
 const r=mirrorTrianglesX(v,faces,source);
 assert.deepEqual(r.byFace,source);assert.equal(r.report.unmatchedTriangles,2);assert.deepEqual(r.report.unresolvedFaces,[0]);
});


import {projectionResiduals,residualColor} from '../src/components/referenceCalibration';
test('projection residual map ranks measured landmarks without treating missing targets as zero',()=>{
 const v:Vec3[]=[[0,0,0],[1,0,0],[0,1,0]];
 const c={cx:500,cy:500,scale:100,flip:false,rotation:0};
 const report=projectionResiduals(v,[{vertex:0,front:[503,504]},{vertex:1,front:[620,500]},{vertex:2,side:[500,400]},{vertex:99,front:[0,0]}],'front',c);
 assert.equal(report.count,2);assert.deepEqual(report.rows.map(r=>r.id),[1,0]);assert.equal(report.max,20);
 assert.ok(Math.abs(report.rms-Math.sqrt(212.5))<1e-9);
 assert.equal(residualColor(5,5),'#65d995');assert.equal(residualColor(10,5),'#ffcc66');assert.equal(residualColor(11,5),'#ff6666');
 assert.equal(projectionResiduals(v,[],'front',c).count,0);
});


import {quadReconnectChoices,reconnectQuadEdge} from '../src/components/edgeReconnect';
function hexPatch(offset=0){
 const vertices=Array.from({length:6},(_,i)=>[offset+Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3),0] as [number,number,number]);
 return {vertices,faces:[[0,1,2,3],[3,4,5,0]]};
}
test('quad reconnect rotates the shared edge and keeps six vertices, two faces and the outer boundary',()=>{
 const mesh=hexPatch(),snapshot=JSON.stringify(mesh);
 const options=quadReconnectChoices(mesh,[0,3]);
 assert.equal(options.length,2);
 for(const target of options){
  const next=reconnectQuadEdge(mesh,[0,3],target);
  assert.deepEqual(next.vertices,mesh.vertices);
  assert.equal(next.faces.length,2);
  assert.ok(next.faces.every(f=>f.length===4));
  assert.deepEqual(validateControlTopology(next),validateControlTopology(mesh));
  const shared=next.faces[0].filter(v=>next.faces[1].includes(v)).sort((a,b)=>a-b);
  assert.deepEqual(shared,[...target].sort((a,b)=>a-b));
  assert.equal(triangulateFaces(next.vertices,next.faces).length,12);
 }
 assert.equal(JSON.stringify(mesh),snapshot);
});
test('quad reconnect rejects boundaries, non-alternate edges, distinct material colors and invalid geometry',()=>{
 const mesh=hexPatch();
 assert.throws(()=>reconnectQuadEdge(mesh,[0,1],[1,4]),/相邻四边面/);
 assert.throws(()=>reconnectQuadEdge(mesh,[0,3],[0,3]),/另一条对角线/);
 assert.throws(()=>reconnectQuadEdge({...mesh,faceColors:['#000000','#ffffff']},[0,3],[1,4]),/颜色/);
 const broken=hexPatch();broken.vertices[1]=[0,-2,0];
 assert.throws(()=>reconnectQuadEdge(broken,[0,3],[1,4]));
 assert.throws(()=>reconnectQuadEdge(mesh,[0,3],[1,4],true),/镜像区域|镜像顶点/);
});
test('mirrored reconnect is atomic, preserves all vertex coordinates and mirrored face winding',()=>{
 const p=hexPatch(3);
 const mesh={vertices:[...p.vertices,...p.vertices.map(([x,y,z])=>[-x,y,z] as [number,number,number])],faces:[...p.faces,...p.faces.map(f=>f.map(i=>i+6).reverse())]};
 const next=reconnectQuadEdge(mesh,[0,3],[1,4],true);
 assert.deepEqual(next.vertices,mesh.vertices);
 assert.deepEqual(validateControlTopology(next),validateControlTopology(mesh));
 const match=(a:number[],b:number[])=>a.some((_,k)=>a.every((v,i)=>v===b[(i+k)%b.length]));
 for(const f of next.faces.slice(0,2))assert.ok(next.faces.slice(2).some(g=>match(f.map(i=>i+6).reverse(),g)));
 const asymmetric={...mesh,vertices:mesh.vertices.map(p=>[...p] as [number,number,number])};asymmetric.vertices[7][2]=.01;
 assert.throws(()=>reconnectQuadEdge(asymmetric,[0,3],[1,4],true),/镜像顶点/);
});
