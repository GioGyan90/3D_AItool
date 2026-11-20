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
