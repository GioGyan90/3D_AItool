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
