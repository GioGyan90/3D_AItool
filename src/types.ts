export type NodeType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'extruded' | 'group' | 'circle' | 'rect' | 'triangle' | 'model' | 'csg' | 'svg' | 'pointLight' | 'ambientLight' | 'text' | 'js_object';

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  url?: string; // For imported models
  script?: string; // For JS Object code
  geometryData?: any; // For storing serialized CSG geometry or custom mesh data
  parameters: {
    radius?: number;
    radiusTop?: number;
    radiusBottom?: number;
    width?: number;
    height?: number;
    depth?: number;
    thickness?: number;
    radialSegments?: number;
    tubularSegments?: number;
    tube?: number;
    points?: [number, number][];
    bevelRadius?: number;
    bevelSegments?: number;
    bend?: number; // 0 to 1, where 1 is a full circle bend
    intensity?: number;
    decay?: number;
    distance?: number;
    text?: string;
    size?: number;
    font?: string;
    environment?: string; // Preset name or URL
  };
  material?: {
    metalness?: number;
    roughness?: number;
    opacity?: number;
    transmission?: number;
    ior?: number;
    thickness?: number; // Volume thickness for refraction
    map?: string; // URL to texture
    preset?: 'metal' | 'plastic' | 'matte' | 'glass' | 'custom';
    attenuationDistance?: number;
    attenuationColor?: string;
  };
  uniformScale?: boolean;
  visible: boolean;
  locked?: boolean;
}

export interface Keyframe {
  id: string;
  time: number; // in seconds
  value: number | [number, number, number];
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface PropertyTrack {
  nodeId: string;
  property: 'position' | 'rotation' | 'scale' | 'color' | 'intensity';
  keyframes: Keyframe[];
}

export interface AnimationData {
  tracks: PropertyTrack[];
  duration: number; // in seconds
  loopStart: number;
  loopEnd: number;
}

export interface EditorState {
  nodes: SceneNode[];
  selectedIds: string[];
  animation: AnimationData;
  currentTime: number;
}
