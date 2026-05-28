export type NodeType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'extruded' | 'group' | 'circle' | 'rect' | 'triangle' | 'polygon' | 'model' | 'csg' | 'svg' | 'pointLight' | 'ambientLight' | 'text' | 'js_object' | 'motion_path';

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
  motionPathId?: string;
  motionPathLoops?: number;
  motionPathInfinite?: boolean;
  motionPathDuration?: number;
  motionPathSpeed?: number;
  selectedPathPointIndex?: number;
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
    sides?: number;       // For polygon
    innerRadius?: number; // For star (0 to 1)
    isStar?: boolean;      // Toggle star/polygon
    twist?: [number, number, number]; // Twist deformation along x, y, z
    taper?: number;                  // Tapering factor (along Y axis)
    stretch?: number;                // Stretching factor (along Y axis)
    inflate?: number;                // Inflation/Spherize factor
    asymmetricScale?: [number, number, number]; // Asymmetric scaling along X, Y, Z
    edgeShift?: [number, number, number];       // Shift a single edge along X, Y, Z
    pathPoints?: [number, number, number][];    // List of 3D coordinates for motion path
    pathType?: 'smooth' | 'polyline';          // Path styling (smooth curves vs straight lines)
    customUVs?: number[];                      // Custom loaded or calculated UV float array
    boneRig?: {
      type: 'none' | 'L' | 'Z' | 'chain';
      joints: {
        id: string;
        name: string;
        parentJointId: string | null;
        position: [number, number, number];
        rotation: [number, number, number];
        length: number;
      }[];
      binds?: {
        nodeId: string;
        jointId: string;
      }[];
    };
  };
  material?: {
    metalness?: number;
    roughness?: number;
    opacity?: number;
    transmission?: number;
    ior?: number;
    thickness?: number; // Volume thickness for refraction
    map?: string; // URL to texture
    mapOffsetX?: number;
    mapOffsetY?: number;
    mapRepeatX?: number;
    mapRepeatY?: number;
    mapRotation?: number; // in degrees
    mapWrapS?: 'repeat' | 'clamp' | 'mirror';
    mapWrapT?: 'repeat' | 'clamp' | 'mirror';
    videoMap?: string; // URL to video or gif
    preset?: 'metal' | 'plastic' | 'matte' | 'glass' | 'frosted' | 'custom';
    attenuationDistance?: number;
    attenuationColor?: string;
    wireframe?: boolean;
    clearcoat?: number;
    clearcoatRoughness?: number;
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
  trigger?: 'auto' | 'click' | 'hover';
  triggerNodeId?: string;
  loopMode?: 'once' | 'repeat2' | 'infinite';
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
