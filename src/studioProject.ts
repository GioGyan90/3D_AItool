import * as THREE from 'three';
import { triangulateFaces } from './components/traceGeometry';
import type { AnimationData, ControlMesh, NodeType, SceneNode } from './types';

export interface StudioProject {
  format: 'shape3d-studio';
  version: 1;
  name: string;
  nodes: SceneNode[];
  animation: AnimationData;
  selectedIds: string[];
}

const projectNodeTypes = new Set<NodeType>([
  'box', 'sphere', 'cylinder', 'torus', 'plane', 'extruded', 'group', 'circle',
  'rect', 'triangle', 'polygon', 'model', 'csg', 'svg', 'pointLight',
  'ambientLight', 'text', 'motion_path',
]);
const environmentPresets = new Set([
  'none', 'city', 'studio', 'apartment', 'lobby', 'night', 'warehouse', 'sunset', 'dawn', 'park', 'forest',
]);
const supportedBufferTypes = new Set([
  'Float32Array', 'Float64Array', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array',
  'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function validateHierarchy<T extends { id: string }>(
  items: T[], parentOf: (item: T) => string | null, label: string,
) {
  const byId = new Map(items.map(item => [item.id, item]));
  if (byId.size !== items.length) throw Error(`${label}含有重复编号。`);
  const checked = new Set<string>();
  for (const item of items) {
    const pending = new Set<string>();
    let current: T | undefined = item;
    while (current && !checked.has(current.id)) {
      if (pending.has(current.id)) throw Error(`${label}的父子关系存在循环。`);
      pending.add(current.id);
      const parentId = parentOf(current);
      current = parentId === null ? undefined : byId.get(parentId);
      if (parentId !== null && !current) throw Error(`${label}引用了不存在的父级。`);
    }
    pending.forEach(id => checked.add(id));
  }
}

function validateControlMesh(value: unknown): ControlMesh {
  if (!isRecord(value) || !Array.isArray(value.vertices) || !Array.isArray(value.faces)) {
    throw Error('控制网格需要 vertices 和 faces 数组。');
  }
  const { vertices, faces } = value;
  if (vertices.length > 5_000 || faces.length > 10_000 ||
      !vertices.every(vertex => isVector(vertex, 3))) {
    throw Error('控制网格顶点无效，最多支持 5000 个顶点和 10000 个面。');
  }
  let references = 0;
  for (const face of faces) {
    if (!Array.isArray(face) || face.length < 3 || face.length > 64 ||
        !face.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) {
      throw Error('控制网格面索引无效。');
    }
    references += face.length;
  }
  if (references > 30_000) throw Error('控制网格超过 30000 个面顶点引用。');
  if (value.faceColors!==undefined &&
      (!Array.isArray(value.faceColors) || value.faceColors.length!==faces.length ||
       !value.faceColors.every(color=>typeof color==='string' && /^#[0-9a-f]{6}$/i.test(color))))
    throw Error('控制网格面颜色需要逐面提供 #RRGGBB 色值。');
  return value as unknown as ControlMesh;
}

/**
 * Rendering-only sticker geometry. The control mesh remains one welded cage:
 * inset colored stickers are visual overlays, not extra control faces/vertices.
 */
export function buildPaintStickerGeometry(mesh: ControlMesh): THREE.BufferGeometry {
  const positions:number[]=[], colors:number[]=[];
  const paint=mesh.faceColors??[];
  mesh.faces.forEach((face,fi)=>{
    if (!paint[fi])return;
    const center=new THREE.Vector3();
    const normal=new THREE.Vector3();
    face.forEach((id,i)=>{
      const a=mesh.vertices[id],b=mesh.vertices[face[(i+1)%face.length]];
      center.add(new THREE.Vector3(...a));
      normal.x+=(a[1]-b[1])*(a[2]+b[2]);
      normal.y+=(a[2]-b[2])*(a[0]+b[0]);
      normal.z+=(a[0]-b[0])*(a[1]+b[1]);
    });
    if(normal.lengthSq()<1e-14)return;
    center.multiplyScalar(1/face.length);
    normal.normalize().multiplyScalar(.0025);
    const inner=face.map(id=>{
      const p=new THREE.Vector3(...mesh.vertices[id]);
      return p.lerp(center,.105).add(normal).toArray() as [number,number,number];
    });
    let indices:number[];
    try{indices=triangulateFaces(inner,[face.map((_,i)=>i)])}catch{return}
    const color=new THREE.Color(paint[fi]);
    for(const id of indices){
      positions.push(...inner[id]);
      colors.push(color.r,color.g,color.b);
    }
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(positions.length)geometry.computeVertexNormals();
  return geometry;
}

export function buildEditableGeometry(mesh: ControlMesh) {
  const indices = triangulateFaces(mesh.vertices, mesh.faces);
  const geometry = new THREE.BufferGeometry();
  if (mesh.faceColors?.length) {
    // A dark body and inset stickers share one render BufferGeometry so the
    // main scene can use a single vertex-colored material. These render
    // triangles do not change the 56-vertex / 54-face Rubik control cage.
    const positions:number[]=[],colors:number[]=[];
    const base=new THREE.Color('#171b24');
    for (const id of indices) {
      positions.push(...mesh.vertices[id]);
      colors.push(base.r,base.g,base.b);
    }
    const decals=buildPaintStickerGeometry(mesh);
    const p=decals.getAttribute('position').array;
    const c=decals.getAttribute('color').array;
    for(const v of p)positions.push(v);
    for(const v of c)colors.push(v);
    decals.dispose();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  } else {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices.flat(), 3));
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  if (mesh.vertices.length > 0) geometry.computeBoundingSphere();
  const serialized = geometry.toJSON();
  geometry.dispose();
  return serialized;
}

function validateResource(value: unknown, label: string) {
  if (value === undefined || value === '') return;
  if (typeof value !== 'string') throw Error(`${label}需要有效的资源地址。`);
  const url = value.trim();
  if (/^blob:/i.test(url)) throw Error(`${label}使用了临时资源，关闭当前页面后无法重新载入。`);
  if (/^data:(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|webm|ogg)|model\/(gltf-binary|gltf\+json)|application\/(octet-stream|gltf-buffer));base64,/i.test(url) ||
      /^https?:\/\/[^\s]+$/i.test(url)) return;
  throw Error(`${label}需要可重新载入的 HTTP(S) 地址或内嵌资源。`);
}

function validateRig(value: unknown) {
  if (value === undefined) return;
  if (!isRecord(value) || !['none', 'L', 'Z', 'chain'].includes(String(value.type)) ||
      !Array.isArray(value.joints)) throw Error('骨架数据无效。');
  const joints: { id: string; parentJointId: string | null }[] = [];
  for (const joint of value.joints) {
    if (!isRecord(joint) || !isId(joint.id) || typeof joint.name !== 'string' ||
        !(joint.parentJointId === null || isId(joint.parentJointId)) ||
        !isVector(joint.position, 3) || !isVector(joint.rotation, 3) || !isFiniteNumber(joint.length)) {
      throw Error('骨架关节数据无效。');
    }
    joints.push({ id: joint.id, parentJointId: joint.parentJointId as string | null });
  }
  validateHierarchy(joints, joint => joint.parentJointId, '骨架');
  if (value.binds !== undefined && (!Array.isArray(value.binds) ||
      value.binds.some(bind => !isRecord(bind) || !isId(bind.nodeId) || !isId(bind.jointId)))) {
    throw Error('骨架绑定数据无效。');
  }
}

function validateBufferGeometry(value: unknown) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.attributes)) {
    throw Error('自定义网格缺少几何数据。');
  }
  const { data } = value;
  function attribute(attr: unknown, itemSize?: number) {
    if (!isRecord(attr) || !supportedBufferTypes.has(String(attr.type)) ||
        !Number.isInteger(attr.itemSize) || Number(attr.itemSize) < 1 || Number(attr.itemSize) > 4 ||
        (itemSize !== undefined && attr.itemSize !== itemSize) ||
        !Array.isArray(attr.array) || attr.array.length % Number(attr.itemSize) !== 0 ||
        !attr.array.every(isFiniteNumber) || attr.isInterleavedBufferAttribute) {
      throw Error('自定义网格含有无效或不支持的顶点属性。');
    }
  }
  const attributes = data.attributes as Record<string, unknown>;
  attribute(attributes.position, 3);
  for (const attr of Object.values(attributes)) attribute(attr);
  if (data.index !== undefined) {
    const index = data.index;
    const position = attributes.position as { array: number[] };
    if (!isRecord(index) || !['Uint16Array', 'Uint32Array'].includes(String(index.type)) ||
        !Array.isArray(index.array) || index.array.length % 3 ||
        !index.array.every(i => Number.isInteger(i) && i >= 0 && i < position.array.length / 3)) {
      throw Error('自定义网格含有无效的三角索引。');
    }
  }
  if (data.morphAttributes !== undefined) {
    if (!isRecord(data.morphAttributes)) throw Error('自定义网格的形变属性无效。');
    for (const morphs of Object.values(data.morphAttributes)) {
      if (!Array.isArray(morphs)) throw Error('自定义网格的形变属性无效。');
      morphs.forEach(morph => attribute(morph));
    }
  }
}

function validateNode(value: unknown): SceneNode {
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== 'string' ||
      !(value.parentId === null || isId(value.parentId)) ||
      !isVector(value.position, 3) || !isVector(value.rotation, 3) || !isVector(value.scale, 3) ||
      typeof value.color !== 'string' || typeof value.visible !== 'boolean' || !isRecord(value.parameters)) {
    throw Error('项目图层缺少有效的编号、变换或参数。');
  }
  if (value.type === 'js_object' || value.script !== undefined) {
    throw Error(`图层「${value.name}」含有脚本，项目文件不支持载入可执行脚本。`);
  }
  if (!projectNodeTypes.has(value.type as NodeType)) throw Error(`项目含有不支持的图层类型。`);
  const label = `图层「${value.name}」的资源`;
  validateResource(value.url, label);
  if ((value.type === 'model' || value.type === 'svg') && !value.url) throw Error(`${label}缺失。`);
  if (value.material !== undefined) {
    if (!isRecord(value.material)) throw Error(`${label}的材质数据无效。`);
    validateResource(value.material.map, `图层「${value.name}」的贴图`);
    validateResource(value.material.videoMap, `图层「${value.name}」的视频贴图`);
  }
  const params = value.parameters;
  if (!environmentPresets.has(String(params.environment))) validateResource(params.environment, '环境图');
  validateRig(params.boneRig);
  for (const [key, size] of [['points', 2], ['anchorPoints', 3], ['pathPoints', 3]] as const) {
    const list = params[key];
    if (list !== undefined && (!Array.isArray(list) || !list.every(point => isVector(point, size)))) {
      throw Error(`图层「${value.name}」的顶点或路径参数无效。`);
    }
  }
  for (const key of ['twist', 'asymmetricScale', 'edgeShift'] as const) {
    if (params[key] !== undefined && !isVector(params[key], 3)) throw Error('图层的形变参数无效。');
  }
  if (params.customUVs !== undefined && (!Array.isArray(params.customUVs) ||
      params.customUVs.length % 2 !== 0 || !params.customUVs.every(isFiniteNumber))) {
    throw Error('图层 UV 坐标无效。');
  }
  for (const key of ['thickness', 'radialSegments', 'tubularSegments', 'bevelSegments', 'sides'] as const) {
    const parameter = params[key];
    if (parameter !== undefined && (!isFiniteNumber(parameter) || Math.abs(parameter) > 512)) {
      throw Error(`图层「${value.name}」的网格参数超出支持范围。`);
    }
  }
  const node = value as unknown as SceneNode;
  if (value.controlMesh !== undefined) {
    if (value.type !== 'csg') throw Error('只有自定义网格图层可以附带控制网格。');
    const controlMesh = validateControlMesh(value.controlMesh);
    return { ...node, controlMesh, geometryData: buildEditableGeometry(controlMesh) };
  }
  if (value.type === 'csg') validateBufferGeometry(value.geometryData);
  return node;
}

function validateAnimation(value: unknown): AnimationData {
  if (!isRecord(value) || !Array.isArray(value.tracks) || !isFiniteNumber(value.duration) ||
      !isFiniteNumber(value.loopStart) || !isFiniteNumber(value.loopEnd)) {
    throw Error('项目时间轴数据无效。');
  }
  for (const track of value.tracks) {
    if (!isRecord(track) || !isId(track.nodeId) || !Array.isArray(track.keyframes) ||
        !['position', 'rotation', 'scale', 'color', 'intensity'].includes(String(track.property)) ||
        (track.triggerNodeId !== undefined && !isId(track.triggerNodeId))) throw Error('项目动画轨道无效。');
    for (const key of track.keyframes) {
      if (!isRecord(key) || !isId(key.id) || !isFiniteNumber(key.time) ||
          !['linear', 'easeIn', 'easeOut', 'easeInOut'].includes(String(key.easing))) {
        throw Error('项目关键帧数据无效。');
      }
      const valid = track.property === 'color' ? typeof key.value === 'string' :
        track.property === 'intensity' ? isFiniteNumber(key.value) : isVector(key.value, 3);
      if (!valid) throw Error('项目关键帧值与动画属性不匹配。');
    }
  }
  return value as unknown as AnimationData;
}

export function parseStudioProject(raw: unknown): StudioProject {
  if (!isRecord(raw) || raw.format !== 'shape3d-studio' || raw.version !== 1) {
    throw Error('文件不是受支持的 Shape3D Studio 项目。');
  }
  if (typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.nodes) ||
      !Array.isArray(raw.selectedIds) || !raw.selectedIds.every(isId)) {
    throw Error('项目缺少有效的名称、图层或选择信息。');
  }
  const nodes = raw.nodes.map(validateNode);
  validateHierarchy(nodes, node => node.parentId, '项目图层');
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    format: 'shape3d-studio', version: 1, name: raw.name,
    nodes, animation: validateAnimation(raw.animation),
    selectedIds: [...new Set(raw.selectedIds)].filter(id => nodeIds.has(id)),
  };
}
