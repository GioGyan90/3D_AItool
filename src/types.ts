export type NodeType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'extruded' | 'group' | 'circle' | 'rect' | 'triangle' | 'model' | 'csg' | 'svg' | 'pointLight' | 'ambientLight' | 'text';

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
  geometryData?: any; // For storing serialized CSG geometry or custom mesh data
  parameters: {
    radius?: number;
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
  };
  material?: {
    metalness?: number;
    roughness?: number;
    map?: string; // URL to texture
  };
  uniformScale?: boolean;
  visible: boolean;
  locked?: boolean;
}

export interface EditorState {
  nodes: SceneNode[];
  selectedIds: string[];
}
