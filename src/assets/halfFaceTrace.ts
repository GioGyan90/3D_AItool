import source from './half-face-study-source.json';

type Vec3 = [number, number, number];
/** Preserve polygon faces and point indices for the reference tracing workspace.
 * Source: X right / Z up / -Y forward. Editor: X right / Y up / +Z forward.
 * Centering in Y keeps the half-face in the default orthographic work area.
 */
export function createHalfFaceTrace() {
  return {
    vertices: source.vertices.map(([x, y, z]): Vec3 => [x, z - 1, -y]),
    faces: source.faces.map(face => [...face]),
    meta: {
      source: 'cheek-profile-revision-v2',
      note: '半脸大形草模；Y 向上、Z 向前；保留原始控制面和共享顶点。'
    }
  };
}
