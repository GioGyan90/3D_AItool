import type {ControlMesh, SceneNode} from '../types';

type V = [number, number, number];
type Primitive = Extract<SceneNode['type'], 'box' | 'sphere' | 'cylinder'>;
const vertex = (x: number, y: number, z: number): V => [x, y, z];
const keyOf = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function createPrimitiveControlMesh(type: Primitive, radius = 0.5): ControlMesh {
  if (type === 'box') {
    return {
      vertices: [
        vertex(-.5, -.5, -.5), vertex(.5, -.5, -.5),
        vertex(.5, .5, -.5), vertex(-.5, .5, -.5),
        vertex(-.5, -.5, .5), vertex(.5, -.5, .5),
        vertex(.5, .5, .5), vertex(-.5, .5, .5),
      ],
      // CCW from outside. Shared vertices (rather than six separate panels)
      // are essential for manifold edge-loop subdivision.
      faces: [
        [4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3],
        [5, 1, 2, 6], [7, 6, 2, 3], [0, 1, 5, 4],
      ],
    };
  }
  const segments = 12;
  if (type === 'cylinder') {
    const vertices: V[] = [];
    for (let j = 0; j < 2; j++) {
      const y = j === 0 ? .5 : -.5;
      for (let i = 0; i < segments; i++) {
        const theta = i * Math.PI * 2 / segments;
        vertices.push(vertex(.5 * Math.sin(theta), y, .5 * Math.cos(theta)));
      }
    }
    const faces: number[][] = [];
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      faces.push([i, segments + i, segments + next, next]);
    }
    faces.push(Array.from({length: segments}, (_, i) => i));
    faces.push(Array.from({length: segments}, (_, i) => segments + segments - i - 1));
    return {vertices, faces};
  }
  // Low-density UV sphere: quads around the body, triangles at both poles.
  // Loops that would cross the pole triangles are rejected rather than
  // producing T-junctions or silently introducing extra triangulation.
  const rows = 6;
  const vertices: V[] = [vertex(0, radius, 0)];
  for (let row = 1; row < rows; row++) {
    const phi = Math.PI * row / rows;
    for (let i = 0; i < segments; i++) {
      const theta = i * 2 * Math.PI / segments;
      vertices.push(vertex(radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta)));
    }
  }
  const bottom = vertices.length;
  vertices.push(vertex(0, -radius, 0));
  const at = (row: number, i: number) => 1 + (row - 1) * segments + (i + segments) % segments;
  const faces: number[][] = [];
  for (let i = 0; i < segments; i++) faces.push([0, at(1, i), at(1, i + 1)]);
  for (let row = 1; row < rows - 1; row++) {
    for (let i = 0; i < segments; i++) {
      faces.push([at(row, i), at(row + 1, i), at(row + 1, i + 1), at(row, i + 1)]);
    }
  }
  for (let i = 0; i < segments; i++) faces.push([bottom, at(rows - 1, i + 1), at(rows - 1, i)]);
  return {vertices, faces};
}

interface EdgeOwner {face: number; slot: number}
interface CutFace {slot: number; fraction: number}

/**
 * Insert a complete quad edge loop by splitting opposite edges of each quad.
 * The insertion propagates in BOTH directions until a boundary or closure.
 * A shared edge receives exactly one vertex; ambiguous/non-quad paths fail
 * instead of creating disconnected outlines or T-junctions.
 */
export function insertQuadEdgeLoop(
  mesh: ControlMesh, startFace: number, startSlot: number, fraction = 0.5,
): ControlMesh {
  if (!Number.isInteger(startFace) || startFace < 0 || startFace >= mesh.faces.length ||
    mesh.faces[startFace].length !== 4) {
    throw new Error('请先选择一个四边面。');
  }
  if (!Number.isInteger(startSlot) || startSlot < 0 || startSlot > 3) {
    throw new Error('请选择该四边面的四条边之一。');
  }
  if (!(fraction > 0.01 && fraction < 0.99)) {
    throw new Error('布线位置必须位于边内部（1%–99%）。');
  }
  const owners = new Map<string, EdgeOwner[]>();
  mesh.faces.forEach((face, fi) => {
    face.forEach((v, slot) => {
      const k = keyOf(v, face[(slot + 1) % face.length]);
      const entry = owners.get(k) ?? [];
      entry.push({face: fi, slot});
      owners.set(k, entry);
    });
  });
  const vertices = mesh.vertices.map(v => vertex(...v));
  const cuts = new Map<string, {id: number; fraction: number; a: number; b: number}>();
  const visited = new Map<number, CutFace>();
  const queue: {face: number; slot: number; fraction: number}[] =
    [{face: startFace, slot: startSlot, fraction}];

  const registerCut = (a: number, b: number, t: number) => {
    const k = keyOf(a, b);
    const sortedT = a < b ? t : 1 - t;
    const old = cuts.get(k);
    if (old) {
      if (Math.abs(old.fraction - sortedT) > 1e-7) {
        throw new Error('环线在此处发生扭转，无法无歧义地连接。');
      }
      return old.id;
    }
    if (vertices.length >= 5000) throw new Error('超过 5000 顶点限制。');
    const A = mesh.vertices[a], B = mesh.vertices[b];
    const id = vertices.length;
    vertices.push(vertex(...A.map((v, i) => v * (1 - t) + B[i] * t) as V));
    cuts.set(k, {id, fraction: sortedT, a, b});
    return id;
  };

  while (queue.length) {
    const current = queue.shift()!;
    const {face: faceId, slot, fraction: t} = current;
    const previous = visited.get(faceId);
    if (previous) {
      // A valid closed loop returns to one of its two previously cut edges.
      const samePath = previous.slot === slot && Math.abs(previous.fraction - t) < 1e-7;
      const reversePath = (previous.slot + 2) % 4 === slot &&
        Math.abs(1 - previous.fraction - t) < 1e-7;
      if (!samePath && !reversePath) throw new Error('环线重复穿过同一面，可能存在非流形连接。');
      continue;
    }
    const face = mesh.faces[faceId];
    if (face.length !== 4) throw new Error('环线遇到三角面或多边面；请先改为四边面。');
    visited.set(faceId, {slot, fraction: t});
    const opposite = (slot + 2) % 4;
    registerCut(face[slot], face[(slot + 1) % 4], t);
    registerCut(face[opposite], face[(opposite + 1) % 4], 1 - t);

    for (const [edgeSlot, localT] of [[slot, t], [opposite, 1 - t]] as const) {
      const a = face[edgeSlot], b = face[(edgeSlot + 1) % 4];
      const linked = owners.get(keyOf(a, b)) ?? [];
      if (linked.length > 2) throw new Error('存在非流形边（超过两个相邻面）。');
      const adjacent = linked.find(owner => owner.face !== faceId);
      if (!adjacent) continue;
      const neighborFace = mesh.faces[adjacent.face];
      if (neighborFace.length !== 4) {
        throw new Error('环线遇到非四边面，已阻止可能产生 T 形断线的操作。');
      }
      const na = neighborFace[adjacent.slot];
      const nb = neighborFace[(adjacent.slot + 1) % neighborFace.length];
      const nextT = na === a && nb === b ? localT : 1 - localT;
      queue.push({face: adjacent.face, slot: adjacent.slot, fraction: nextT});
    }
  }

  const faces: number[][] = [];
  mesh.faces.forEach((face, i) => {
    const hit = visited.get(i);
    if (!hit) { faces.push([...face]); return; }
    const a = face[hit.slot], b = face[(hit.slot + 1) % 4];
    const c = face[(hit.slot + 2) % 4], d = face[(hit.slot + 3) % 4];
    const p = cuts.get(keyOf(a, b))!.id, q = cuts.get(keyOf(c, d))!.id;
    faces.push([a, p, q, d], [p, b, c, q]);
  });
  if (faces.length > 10000 || faces.reduce((n, f) => n + f.length, 0) > 30000) {
    throw new Error('超过控制面或顶点引用数量上限。');
  }
  return {vertices, faces};
}
