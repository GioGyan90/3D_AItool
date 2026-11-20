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
  const faceColors: string[] = [];
  mesh.faces.forEach((face, i) => {
    const hit = visited.get(i);
    if (!hit) {
      faces.push([...face]);
      if (mesh.faceColors) faceColors.push(mesh.faceColors[i]);
      return;
    }
    const a = face[hit.slot], b = face[(hit.slot + 1) % 4];
    const c = face[(hit.slot + 2) % 4], d = face[(hit.slot + 3) % 4];
    const p = cuts.get(keyOf(a, b))!.id, q = cuts.get(keyOf(c, d))!.id;
    faces.push([a, p, q, d], [p, b, c, q]);
    if (mesh.faceColors) faceColors.push(mesh.faceColors[i],mesh.faceColors[i]);
  });
  if (faces.length > 10000 || faces.reduce((n, f) => n + f.length, 0) > 30000) {
    throw new Error('超过控制面或顶点引用数量上限。');
  }
  return {vertices, faces,...(mesh.faceColors ? {faceColors} : {})};
}


/** Verify the indexed control cage, not the triangulated render buffers. */
export function validateControlTopology(mesh: ControlMesh): {edges: number; boundaryEdges: number} {
  if (mesh.vertices.length > 5000 || mesh.faces.length > 10000 ||
      mesh.faces.reduce((sum, face) => sum + face.length, 0) > 30000)
    throw new Error('控制网格超出 5000 顶点 / 10000 面 / 30000 引用限制。');
  if (mesh.faceColors && (mesh.faceColors.length!==mesh.faces.length ||
      mesh.faceColors.some(color=>!/^#[0-9a-f]{6}$/i.test(color))))
    throw new Error('每个控制面必须有一条有效的 #RRGGBB 颜色记录。');
  for (const p of mesh.vertices)
    if (p.length !== 3 || !p.every(Number.isFinite))
      throw new Error('控制网格包含无效顶点坐标。');
  const owners = new Map<string, {from: number; to: number}[]>();
  for (const face of mesh.faces) {
    if (face.length < 3 || face.length > 64 || new Set(face).size !== face.length)
      throw new Error('控制面包含重复顶点或不合法的面。');
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      if (!Number.isInteger(a) || !Number.isInteger(b) ||
          a < 0 || b < 0 || a >= mesh.vertices.length || b >= mesh.vertices.length)
        throw new Error('控制面引用了不存在的顶点。');
      const key = keyOf(a, b), entries = owners.get(key) ?? [];
      entries.push({from: a, to: b});
      if (entries.length > 2) throw new Error('控制网格包含非流形边（超过两个相邻面）。');
      owners.set(key, entries);
    }
  }
  for (const entries of owners.values()) {
    if (entries.length === 2 &&
        (entries[0].from !== entries[1].to || entries[0].to !== entries[1].from))
      throw new Error('相邻面的共享边绕序相同，请先修复法线方向。');
  }
  return {edges: owners.size, boundaryEdges: [...owners.values()].filter(x => x.length === 1).length};
}

function finishTopologyEdit(vertices: V[], faces: number[][], faceColors?: string[]): ControlMesh {
  const next = {vertices, faces,...(faceColors ? {faceColors} : {})};
  validateControlTopology(next);
  return next;
}

/**
 * Local quad cut. Unlike a partial edge loop, this ALSO divides both neighboring
 * faces at the cut edges: every midpoint has the same index on both sides,
 * and no face is left with a hanging T-junction. Only the selected quad
 * continues as two quads; its neighbors acquire a small triangle + polygon.
 */
export function splitQuadLocally(
  mesh: ControlMesh, faceIndex: number, slot: number, fraction = 0.5,
): ControlMesh {
  validateControlTopology(mesh);
  const f = mesh.faces[faceIndex];
  if (!f || f.length !== 4 || !Number.isInteger(slot) || slot < 0 || slot > 3)
    throw new Error('局部切割需要选中四边面及其起始边。');
  if (!(fraction > 0.01 && fraction < 0.99)) throw new Error('切割位置必须在 1%–99% 之间。');
  const vertices = mesh.vertices.map(v => vertex(...v));
  const cut = new Map<string, number>();
  const pointOn = (a: number, b: number, t: number) => {
    const id = vertices.length, A = mesh.vertices[a], B = mesh.vertices[b];
    vertices.push(vertex(A[0] * (1-t) + B[0]*t, A[1]*(1-t)+B[1]*t, A[2]*(1-t)+B[2]*t));
    cut.set(keyOf(a, b), id);
    return id;
  };
  const [a, b, c, d] = [0,1,2,3].map(i => f[(slot+i)%4]);
  const p = pointOn(a,b,fraction);
  const q = pointOn(c,d,1-fraction);
  const faces: number[][] = [];
  const faceColors: string[] = [];
  const push = (fi:number,...pieces:number[][]) => {
    faces.push(...pieces);
    if (mesh.faceColors) faceColors.push(...pieces.map(()=>mesh.faceColors![fi]));
  };
  mesh.faces.forEach((face, fi) => {
    if (fi === faceIndex) {
      push(fi,[a,p,q,d], [p,b,c,q]);
      return;
    }
    const slots = face.map((v,i) => cut.has(keyOf(v,face[(i+1)%face.length])) ? i : -1).filter(i=>i>=0);
    if (slots.length > 1)
      throw new Error('相邻面同时接触两条切割边，无法安全局部布线。');
    if (!slots.length) {push(fi,[...face]); return;}
    const i=slots[0];
    // Rotate until shared edge is first, then triangulate exactly once
    // without leaving a collinear vertex inside a polygon boundary.
    const rotated = [...face.slice(i), ...face.slice(0,i)];
    const mid = cut.get(keyOf(rotated[0],rotated[1]))!;
    push(fi,[rotated[rotated.length-1],rotated[0],mid], [mid,...rotated.slice(1)]);
  });
  return finishTopologyEdit(vertices,faces,mesh.faceColors?faceColors:undefined);
}

/** Create a ring of QUADS around one selected face without touching neighbors. */
export function insetControlFace(mesh: ControlMesh, faceIndex: number, fraction=0.25): ControlMesh {
  validateControlTopology(mesh);
  const face = mesh.faces[faceIndex];
  if (!face) throw new Error('请先选择需要内插的控制面。');
  if (!(fraction > .01 && fraction < .95)) throw new Error('内插比例必须在 1%–95% 之间。');
  const center: V = [0,0,0];
  face.forEach(id=>mesh.vertices[id].forEach((n,k)=>{center[k]+=n/face.length}));
  const vertices = mesh.vertices.map(v=>vertex(...v));
  const inner = face.map(id => {
    const p = mesh.vertices[id], next = vertices.length;
    vertices.push(vertex(...p.map((value,k)=>value*(1-fraction)+center[k]*fraction) as V));
    return next;
  });
  const faces = mesh.faces.flatMap((f,i)=>i===faceIndex
    ? [...f.map((a,k)=>[a,f[(k+1)%f.length],inner[(k+1)%f.length],inner[k]]),inner]
    : [[...f]]);
  const colors=mesh.faceColors?.flatMap((value,i)=>Array(i===faceIndex?face.length+1:1).fill(value));
  return finishTopologyEdit(vertices,faces,colors);
}

/** Extrude a selected face along its own outward normal; keep the old border shared. */
export function extrudeControlFace(mesh: ControlMesh, faceIndex: number, distance=0.2): ControlMesh {
  validateControlTopology(mesh);
  const face = mesh.faces[faceIndex];
  if (!face) throw new Error('请先选择需要挤出的控制面。');
  if (!Number.isFinite(distance) || Math.abs(distance)<1e-6 || Math.abs(distance)>100)
    throw new Error('挤出距离必须为非零有限值且不超过 100。');
  // Newell's stable polygon normal for triangles, quads and n-gons.
  const normal: V = [0,0,0];
  face.forEach((id,i)=>{
    const a=mesh.vertices[id],b=mesh.vertices[face[(i+1)%face.length]];
    normal[0]+=(a[1]-b[1])*(a[2]+b[2]);
    normal[1]+=(a[2]-b[2])*(a[0]+b[0]);
    normal[2]+=(a[0]-b[0])*(a[1]+b[1]);
  });
  const length = Math.hypot(...normal);
  if (length<1e-10) throw new Error('无法计算退化控制面的挤出法线。');
  const vertices=mesh.vertices.map(v=>vertex(...v));
  const top=face.map(id=>{
    const p=mesh.vertices[id],next=vertices.length;
    vertices.push(vertex(...p.map((v,k)=>v+distance*normal[k]/length) as V));
    return next;
  });
  const sides=face.map((id,i)=>[id,face[(i+1)%face.length],top[(i+1)%face.length],top[i]]);
  const faces=mesh.faces.flatMap((f,i)=>i===faceIndex?[top,...sides]:[[...f]]);
  const colors=mesh.faceColors?.flatMap((value,i)=>Array(i===faceIndex?face.length+1:1).fill(value));
  return finishTopologyEdit(vertices,faces,colors);
}

/**
 * Mirror a true half-model over X=0. Seam vertices are welded, seam-only
 * caps are removed (so they do not become internal duplicate faces), and
 * mirrored face winding is reversed to preserve outward surface normals.
 */
export function mirrorControlMeshX(mesh: ControlMesh, tolerance=1e-6): ControlMesh {
  validateControlTopology(mesh);
  const xs=mesh.vertices.map(v=>v[0]),min=Math.min(...xs),max=Math.max(...xs);
  if (!xs.length || min < -tolerance && max > tolerance)
    throw new Error('X 镜像需要先制作 X≥0 或 X≤0 的半模型，不能镜像跨越中心线的完整物体。');
  if (!xs.some(x=>Math.abs(x)<=tolerance) || !xs.some(x=>Math.abs(x)>tolerance))
    throw new Error('X 镜像要求中心线上有可焊接顶点，并存在至少一个非中心顶点。');
  const vertices=mesh.vertices.map(v=>vertex(Math.abs(v[0])<=tolerance?0:v[0],v[1],v[2]));
  const mapped=new Map<number,number>();
  mesh.vertices.forEach((p,i)=>{
    if (Math.abs(p[0])<=tolerance) {mapped.set(i,i);return;}
    mapped.set(i,vertices.length);
    vertices.push(vertex(-p[0],p[1],p[2]));
  });
  const indices=mesh.faces.map((_,i)=>i).filter(fi=>!mesh.faces[fi].every(i=>Math.abs(mesh.vertices[i][0])<=tolerance));
  const sourceFaces=indices.map(i=>mesh.faces[i]);
  const faces=[...sourceFaces.map(f=>[...f]),...sourceFaces.map(f=>f.map(i=>mapped.get(i)!).reverse())];
  const colors=mesh.faceColors && [...indices.map(i=>mesh.faceColors![i]),...indices.map(i=>mesh.faceColors![i])];
  return finishTopologyEdit(vertices,faces,colors);
}
