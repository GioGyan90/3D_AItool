import type {ControlMesh} from '../types';
import {createPrimitiveControlMesh,insertQuadEdgeLoop,validateControlTopology} from './meshTopology';

/**
 * Build the Rubik's cube from ONE box and six real quad edge loops.
 * No independent boxlets or disconnected sticker geometry are added to
 * the control cage: 56 shared vertices, 54 quads and 108 shared edges.
 */
export const RUBIK_FACE_COLORS = {
  right: '#e94236', left: '#f28d28',
  top: '#f3f0e4', bottom: '#efcc31',
  front: '#24b169', back: '#3276d8',
} as const;

const EPS = 1e-7;

function locateCut(mesh: ControlMesh, axis: number, plane: number) {
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (face.length !== 4) continue;
    for (let slot = 0; slot < 4; slot++) {
      const a = mesh.vertices[face[slot]],b = mesh.vertices[face[(slot+1)%4]];
      const c = mesh.vertices[face[(slot+2)%4]],d = mesh.vertices[face[(slot+3)%4]];
      if (!(Math.min(a[axis],b[axis])+EPS < plane && plane < Math.max(a[axis],b[axis])-EPS)) continue;
      if (!(Math.min(c[axis],d[axis])+EPS < plane && plane < Math.max(c[axis],d[axis])-EPS)) continue;
      // Both opposite edges must run parallel to the intended coordinate.
      if ([0,1,2].some(k=>k!==axis &&
        (Math.abs(a[k]-b[k])>EPS || Math.abs(c[k]-d[k])>EPS))) continue;
      const t=(plane-a[axis])/(b[axis]-a[axis]);
      return {face: fi, slot, fraction:t};
    }
  }
  throw new Error(`无法在轴 ${axis} 坐标 ${plane} 处找到可连接的四边面环线。`);
}

function faceColor(mesh: ControlMesh, face: number[]) {
  const centroid = [0,0,0];
  for (const id of face)
    for (let k=0;k<3;k++)centroid[k]+=mesh.vertices[id][k]/face.length;
  // Every Rubik face lives on one of the six unmodified box planes.
  const dominant=centroid.reduce((best,value,k)=>
    Math.abs(value)>Math.abs(centroid[best]) ? k:best,0);
  if (Math.abs(Math.abs(centroid[dominant])-0.5)>EPS)
    throw new Error('魔方表面不在基础立方体外壳上。');
  const positive=centroid[dominant]>0;
  return dominant===0 ? (positive?RUBIK_FACE_COLORS.right:RUBIK_FACE_COLORS.left) :
    dominant===1 ? (positive?RUBIK_FACE_COLORS.top:RUBIK_FACE_COLORS.bottom) :
    (positive?RUBIK_FACE_COLORS.front:RUBIK_FACE_COLORS.back);
}

export function createRubikBuildSteps(): ControlMesh[] {
  let mesh=createPrimitiveControlMesh('box');
  const steps=[mesh];
  // Grid lines at -1/6 and +1/6 along X,Y,Z. These are genuine shared
  // edge loop operations, not a procedurally substituted dense grid.
  for (const axis of [0,1,2]) {
    for (const plane of [-1/6,1/6]) {
      const cut=locateCut(mesh,axis,plane);
      mesh=insertQuadEdgeLoop(mesh,cut.face,cut.slot,cut.fraction);
      steps.push(mesh);
    }
  }
  return steps;
}

export function createRubikControlMesh(): ControlMesh {
  const mesh=createRubikBuildSteps().at(-1)!;
  validateControlTopology(mesh);
  if (mesh.vertices.length!==56 || mesh.faces.length!==54 ||
      !mesh.faces.every(face=>face.length===4))
    throw new Error('魔方拓扑不符合 56 顶点、54 四边面的设计。');
  const faceColors=mesh.faces.map(face=>faceColor(mesh,face));
  for (const color of Object.values(RUBIK_FACE_COLORS))
    if (faceColors.filter(value=>value===color).length!==9)
      throw new Error('魔方六个表面的九宫格数量不正确。');
  return {...mesh,faceColors};
}
