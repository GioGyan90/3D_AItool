import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Canvas3D } from './components/Canvas3D';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LayersPanel } from './components/LayersPanel';
import { AICommander } from './components/AICommander';
import { UVEditor } from './components/UVEditor';
import { BoneRigEditor } from './components/BoneRigEditor';
import { SceneNode, NodeType, PropertyTrack, AnimationData, Keyframe } from './types';
import { Timeline } from './components/Timeline';
import { CodeEditor } from './components/CodeEditor';
import { 
  Box, 
  Circle, 
  Cylinder, 
  Torus, 
  Square, 
  Layers as ExtrudeIcon, 
  Folder,
  FolderPlus,
  FolderMinus,
  ChevronDown,
  Triangle,
  Upload,
  Combine,
  Scissors,
  Bone,
  BoxSelect,
  Loader2,
  Eye,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ADDITION, SUBTRACTION, INTERSECTION, DIFFERENCE, Evaluator, Brush } from 'three-bvh-csg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const INITIAL_NODES: SceneNode[] = [
  {
    id: 'ambient-light',
    name: 'Ambient Light',
    type: 'ambientLight',
    parentId: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#ffffff',
    parameters: { intensity: 0.4 },
    visible: true,
    locked: true
  },
  {
    id: '1',
    name: 'Initial Cube',
    type: 'box',
    parentId: null,
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#4a90e2',
    parameters: {},
    visible: true
  }
];

// Helper to ensure a value is a valid number
const ensureNumber = (val: any, fallback: number): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

export default function App() {
  const [nodes, setNodes] = useState<SceneNode[]>(INITIAL_NODES);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [isCodeEditorOpen, setIsCodeEditorOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isUvEditorOpen, setIsUvEditorOpen] = useState(false);
  const [isBoneRigOpen, setIsBoneRigOpen] = useState(false);
  const [activeTool, setActiveTool] = useState('select');
  const [isLayersCollapsed, setIsLayersCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  
  // Interaction state for animation triggers
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverStartTimes, setHoverStartTimes] = useState<Record<string, number>>({});
  const [clickedNodeIds, setClickedNodeIds] = useState<Set<string>>(new Set());
  const [clickTimes, setClickTimes] = useState<Record<string, number>>({});
  
  // Animation state
  const [animation, setAnimation] = useState<AnimationData>({
    tracks: [],
    duration: 60,
    loopStart: 0,
    loopEnd: 3
  });
  const timerRef = useRef<THREE.Timer>(new THREE.Timer());
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Playback loop
  useEffect(() => {
    let frameId: number;
    
    const tick = (now: number) => {
      timerRef.current.update(now);
      const delta = timerRef.current.getDelta();

      if (isPlaying || isPreviewMode) {
        setCurrentTime(prev => {
          let next = prev + delta;
          
          if (isPreviewMode) {
            // In preview mode, we just let the global clock run for relative interaction timings
            return next;
          }

          if (next >= animation.loopEnd) {
            return animation.loopStart;
          }
          if (next < animation.loopStart) {
            return animation.loopStart;
          }
          return next;
        });
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isPreviewMode, animation.loopStart, animation.loopEnd]);

  useEffect(() => {
    if (isPreviewMode) {
      setClickedNodeIds(new Set());
      setHoveredNodeId(null);
      setClickTimes({});
      setHoverStartTimes({});
      setCurrentTime(0); // Reset global clock when entering preview
    }
  }, [isPreviewMode]);

  // Interpolation helper
  const interpolate = (val1: any, val2: any, ratio: number) => {
    if (isNaN(ratio) || !isFinite(ratio)) return val1;
    if (val1 === undefined || val1 === null) return val2;
    if (val2 === undefined || val2 === null) return val1;

    if (Array.isArray(val1) && Array.isArray(val2)) {
      return val1.map((v, i) => {
        const v2 = val2[i] !== undefined ? val2[i] : v;
        const res = v + (v2 - v) * ratio;
        return isNaN(res) ? v : res;
      });
    }
    if (typeof val1 === 'string' && val1.startsWith('#')) {
      // Color interpolation
      try {
        const c1 = new THREE.Color(val1);
        const c2 = new THREE.Color(val2);
        return `#${c1.lerp(c2, ratio).getHexString()}`;
      } catch (e) {
        return val1;
      }
    }
    if (typeof val1 === 'number' && typeof val2 === 'number') {
      const res = val1 + (val2 - val1) * ratio;
      return isNaN(res) ? val1 : res;
    }
    return val1;
  };

  const getAnimatedValue = useCallback((nodeId: string, property: string, baseValue: any) => {
    const track = animation.tracks.find(t => t.nodeId === nodeId && t.property === property);
    if (!track || track.keyframes.length === 0) return baseValue;

    const trigger = track.trigger || 'auto';
    const triggerNodeId = track.triggerNodeId || nodeId;
    const loopMode = track.loopMode || 'infinite';
    
    let timeToUse = currentTime;

    if (isPreviewMode) {
      if (trigger === 'hover') {
        const startTime = hoverStartTimes[triggerNodeId] ?? -1;
        timeToUse = startTime !== -1 ? (currentTime - startTime) : 0;
      } else if (trigger === 'click') {
        const startTime = clickTimes[triggerNodeId] ?? -1;
        timeToUse = startTime !== -1 ? (currentTime - startTime) : 0;
      }

      // Handle loop mode
      const sortedKFForDuration = [...track.keyframes].sort((a, b) => a.time - b.time);
      const trackDuration = sortedKFForDuration[sortedKFForDuration.length - 1].time;
      
      if (trackDuration > 0) {
        if (loopMode === 'once') {
          timeToUse = Math.min(timeToUse, trackDuration);
        } else if (loopMode === 'repeat2') {
          if (timeToUse >= trackDuration * 2) {
            timeToUse = trackDuration;
          } else {
            timeToUse = timeToUse % trackDuration;
          }
        } else {
          // infinite
          timeToUse = timeToUse % trackDuration;
        }
      }
    }

    const sortedKF = [...track.keyframes].sort((a, b) => a.time - b.time);
    
    if (timeToUse <= sortedKF[0].time) return sortedKF[0].value;
    if (timeToUse >= sortedKF[sortedKF.length - 1].time) return sortedKF[sortedKF.length - 1].value;

    for (let i = 0; i < sortedKF.length - 1; i++) {
      const kf1 = sortedKF[i];
      const kf2 = sortedKF[i + 1];
      if (timeToUse >= kf1.time && timeToUse <= kf2.time) {
        const ratio = (timeToUse - kf1.time) / (kf2.time - kf1.time);
        return interpolate(kf1.value, kf2.value, ratio);
      }
    }
    return baseValue;
  }, [animation, currentTime, isPreviewMode, hoveredNodeId, clickedNodeIds]);

  const getPointOnPath = useCallback((pathPoints: [number, number, number][], progress: number, pathNode: SceneNode) => {
    if (pathPoints.length === 0) return [0, 0, 0] as [number, number, number];
    if (pathPoints.length === 1) {
      const pt = pathPoints[0];
      const vec = new THREE.Vector3(pt[0], pt[1], pt[2]);
      vec.x *= pathNode.scale[0];
      vec.y *= pathNode.scale[1];
      vec.z *= pathNode.scale[2];
      const euler = new THREE.Euler(pathNode.rotation[0], pathNode.rotation[1], pathNode.rotation[2]);
      vec.applyEuler(euler);
      vec.x += pathNode.position[0];
      vec.y += pathNode.position[1];
      vec.z += pathNode.position[2];
      return [vec.x, vec.y, vec.z] as [number, number, number];
    }

    const pathType = pathNode?.parameters?.pathType || 'smooth';
    let targetPt: THREE.Vector3;

    if (pathType === 'polyline') {
      const pts = pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const cumLengths = [0];
      let totalLength = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dist = pts[i].distanceTo(pts[i + 1]);
        totalLength += dist;
        cumLengths.push(totalLength);
      }
      if (totalLength === 0) {
        targetPt = pts[0].clone();
      } else {
        const targetLength = progress * totalLength;
        let segmentIndex = 0;
        for (let i = 0; i < cumLengths.length - 1; i++) {
          if (targetLength >= cumLengths[i] && targetLength <= cumLengths[i + 1]) {
            segmentIndex = i;
            break;
          }
        }
        const segStart = cumLengths[segmentIndex];
        const segEnd = cumLengths[segmentIndex + 1];
        const segLength = segEnd - segStart;
        const segRatio = segLength > 0 ? (targetLength - segStart) / segLength : 0;
        targetPt = new THREE.Vector3().lerpVectors(pts[segmentIndex], pts[segmentIndex + 1], segRatio);
      }
    } else {
      const curvePoints = pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(curvePoints);
      targetPt = curve.getPointAt(progress);
    }
    
    const vec = targetPt.clone();
    vec.x *= pathNode.scale[0];
    vec.y *= pathNode.scale[1];
    vec.z *= pathNode.scale[2];

    const euler = new THREE.Euler(pathNode.rotation[0], pathNode.rotation[1], pathNode.rotation[2]);
    vec.applyEuler(euler);

    vec.x += pathNode.position[0];
    vec.y += pathNode.position[1];
    vec.z += pathNode.position[2];

    return [vec.x, vec.y, vec.z] as [number, number, number];
  }, []);

  const animatedNodes = useMemo(() => {
    return nodes.map(node => {
      let finalPosition = getAnimatedValue(node.id, 'position', node.position);

      if (node.motionPathId) {
        const pathNode = nodes.find(n => n.id === node.motionPathId);
        if (pathNode && pathNode.parameters?.pathPoints && pathNode.parameters.pathPoints.length > 0) {
          let duration = 3.0;
          if (node.motionPathSpeed !== undefined) {
            duration = Math.max(0.01, 3.0 / node.motionPathSpeed);
          } else if (node.motionPathDuration !== undefined) {
            duration = node.motionPathDuration;
          }
          const infinite = node.motionPathInfinite !== false;
          const loops = node.motionPathLoops || 1;

          let progress = 0;
          if (infinite) {
            progress = (currentTime % duration) / duration;
          } else {
            const totalTime = duration * loops;
            if (currentTime >= totalTime) {
              progress = 1.0;
            } else {
              progress = (currentTime % duration) / duration;
            }
          }
          finalPosition = getPointOnPath(pathNode.parameters.pathPoints, progress, pathNode);
        }
      }

      return {
        ...node,
        position: finalPosition,
        rotation: getAnimatedValue(node.id, 'rotation', node.rotation),
        scale: getAnimatedValue(node.id, 'scale', node.scale),
        color: getAnimatedValue(node.id, 'color', node.color),
        parameters: {
          ...node.parameters,
          intensity: getAnimatedValue(node.id, 'intensity', node.parameters?.intensity)
        }
      };
    });
  }, [nodes, getAnimatedValue, currentTime, getPointOnPath]);

  const handleAddKeyframe = useCallback((nodeId: string, property: PropertyTrack['property']) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;

    let value: any;
    if (property === 'position') value = [...node.position];
    else if (property === 'rotation') value = [...node.rotation];
    else if (property === 'scale') value = [...node.scale];
    else if (property === 'color') value = node.color;
    else if (property === 'intensity') value = node.parameters.intensity || 1;

    setAnimation(prev => {
      const nextTracks = [...prev.tracks];
      let trackIndex = nextTracks.findIndex(t => t.nodeId === nodeId && t.property === property);
      
      if (trackIndex === -1) {
        nextTracks.push({ nodeId, property, keyframes: [] });
        trackIndex = nextTracks.length - 1;
      }

      const track = { ...nextTracks[trackIndex] };
      const nextKeyframes = [...track.keyframes];
      
      const time = currentTimeRef.current;
      // Update existing keyframe at this time or add new one
      const existingKFIndex = nextKeyframes.findIndex(kf => Math.abs(kf.time - time) < 0.05);
      const newKF: Keyframe = {
        id: crypto.randomUUID(),
        time,
        value,
        easing: 'linear'
      };

      if (existingKFIndex !== -1) {
        nextKeyframes[existingKFIndex] = newKF;
      } else {
        nextKeyframes.push(newKF);
      }
      
      track.keyframes = nextKeyframes.sort((a, b) => a.time - b.time);
      nextTracks[trackIndex] = track;
      
      return { ...prev, tracks: nextTracks };
    });
  }, []);

  const handleRemoveKeyframe = useCallback((trackIndex: number, kfId: string) => {
    setAnimation(prev => {
      const nextTracks = [...prev.tracks];
      const track = { ...nextTracks[trackIndex] };
      const nextKeyframes = track.keyframes.filter(kf => kf.id !== kfId);
      
      if (nextKeyframes.length === 0) {
        nextTracks.splice(trackIndex, 1);
      } else {
        track.keyframes = nextKeyframes;
        nextTracks[trackIndex] = track;
      }
      
      return { ...prev, tracks: nextTracks };
    });
  }, []);

  const handleUpdateKeyframe = useCallback((trackIndex: number, kfId: string, newTime: number) => {
    setAnimation(prev => {
      const nextTracks = [...prev.tracks];
      const track = { ...nextTracks[trackIndex] };
      const nextKeyframes = track.keyframes.map(kf => 
        kf.id === kfId ? { ...kf, time: newTime } : kf
      );
      
      // Re-sort
      track.keyframes = nextKeyframes.sort((a, b) => a.time - b.time);
      nextTracks[trackIndex] = track;
      
      return { ...prev, tracks: nextTracks };
    });
  }, []);

  const handleDeleteTrack = useCallback((trackIndex: number) => {
    setAnimation(prev => {
      const nextTracks = [...prev.tracks];
      nextTracks.splice(trackIndex, 1);
      return { ...prev, tracks: nextTracks };
    });
  }, []);
  
  // History management using refs for stability and to avoid stale closures
  const historyRef = useRef<{ nodes: SceneNode[]; selectedIds: string[] }[]>([
    { nodes: INITIAL_NODES, selectedIds: [] }
  ]);
  const historyIndexRef = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0); // Used to trigger re-renders when history changes
  
  const sceneRef = React.useRef<THREE.Group | null>(null);
  const orbitControlsRef = useRef<any>(null);

  const handleResetCamera = useCallback(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.reset();
    }
  }, []);

  const nodesRef = useRef(nodes);
  const animationRef = useRef(animation);
  const currentTimeRef = useRef(currentTime);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { animationRef.current = animation; }, [animation]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const pushHistory = useCallback((newNodes: SceneNode[], newSelectedIds: string[]) => {
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
    sliced.push({ nodes: JSON.parse(JSON.stringify(newNodes)), selectedIds: [...newSelectedIds] });
    historyRef.current = sliced.slice(-50);
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryVersion(v => v + 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(JSON.parse(JSON.stringify(state.nodes)));
      setSelectedIds([...state.selectedIds]);
      setHistoryVersion(v => v + 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(JSON.parse(JSON.stringify(state.nodes)));
      setSelectedIds([...state.selectedIds]);
      setHistoryVersion(v => v + 1);
    }
  }, []);

  const handleExportGLB = useCallback((targetNodeId?: string) => {
    if (!sceneRef.current) return;
    
    // Create a temporary scene for export to ensure a clean environment
    const exportScene = new THREE.Scene();
    
    // If targetNodeId is provided, we only export that object and its children
    let sourceObject: THREE.Object3D | null = null;
    if (targetNodeId) {
      sourceObject = sceneRef.current.getObjectByName(targetNodeId) || null;
    } else {
      sourceObject = sceneRef.current;
    }

    if (!sourceObject) return;

    // We clone the group to avoid modifying the original scene during export
    const clone = sourceObject.clone(true);
    
    // Traverse and clean up the scene for export
    const toRemove: THREE.Object3D[] = [];
    clone.traverse((child) => {
      // More specific check for editor helpers to avoid removing valid model parts
      const isEditorHelper = 
        child.userData.isTransformControls || 
        child.type.includes('Controls') ||
        (child.name && (child.name.includes('TransformControls') || child.name.includes('SceneHelper'))) ||
        child.userData.helper;

      if (isEditorHelper) {
        toRemove.push(child);
        return;
      }

      if (child instanceof THREE.Mesh) {
        // Find source node to ensure properties match exactly and colors are properly converted
        let node = nodes.find(n => n.id === child.name);
        if (!node) {
          let parent = child.parent;
          while (parent && !node) {
            node = nodes.find(n => n.id === parent?.name);
            parent = parent?.parent || null;
          }
        }

        if (node && node.type !== 'ambientLight') {
          // Create a physical material to support more features (like transmission)
          const processMaterial = (oldMat: THREE.Material) => {
            const mat = new THREE.MeshPhysicalMaterial();
            if (oldMat && (oldMat as any).copy) {
              mat.copy(oldMat as any);
            }
            
            // Only override color if it's not the default white
            // This preserves imported model colors while allowing override for local shapes
            const nodeColor = node.color || '#ffffff';
            if (nodeColor.toLowerCase() !== '#ffffff') {
              mat.color.set(nodeColor);
            } else if (oldMat && (oldMat as any).color) {
              mat.color.copy((oldMat as any).color);
            }
            
            // Ensure other material properties are synced if node has them
            if (node.material) {
              mat.roughness = ensureNumber(node.material.roughness, (oldMat as any)?.roughness ?? 0.5);
              mat.metalness = ensureNumber(node.material.metalness, (oldMat as any)?.metalness ?? 0);
              mat.opacity = ensureNumber(node.material.opacity, (oldMat as any)?.opacity ?? 1);
              mat.transparent = mat.opacity < 1 || ((oldMat as any)?.transparent ?? false);
              mat.transmission = ensureNumber(node.material.transmission, (oldMat as any)?.transmission ?? 0);
              mat.thickness = ensureNumber(node.material.thickness, (oldMat as any)?.thickness ?? 0);
              mat.ior = ensureNumber(node.material.ior, (oldMat as any)?.ior ?? 1.5);
              mat.clearcoat = ensureNumber(node.material.clearcoat, (oldMat as any)?.clearcoat ?? 0);
              mat.clearcoatRoughness = ensureNumber(node.material.clearcoatRoughness, (oldMat as any)?.clearcoatRoughness ?? 0);
            }
            mat.envMapIntensity = 1.0;
            return mat;
          };

          if (Array.isArray(child.material)) {
            child.material = child.material.map(processMaterial);
          } else {
            child.material = processMaterial(child.material);
          }
        }
      }
    });

    toRemove.forEach(obj => {
      if (obj.parent) obj.parent.remove(obj);
    });

    exportScene.add(clone);
    
    const exporter = new GLTFExporter();
    exporter.parse(
      exportScene,
      (result) => {
        const output = result instanceof ArrayBuffer ? result : JSON.stringify(result, null, 2);
        const blob = new Blob([output], { type: result instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const name = targetNodeId ? (nodes.find(n => n.id === targetNodeId)?.name || 'object') : 'scene';
        link.download = `${name}.glb`;
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error('An error happened during export', error);
      },
      { 
        binary: true,
        includeCustomExtensions: true,
        onlyVisible: false // Allow exporting invisible trigger objects if desired
      }
    );
  }, [nodes]);

  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene.png';
    link.click();
  }, []);

  const handleExportAnimationJS = useCallback(() => {
    const animationCode = `
// Prism3D Animation Export
const animationData = ${JSON.stringify({ ...animation, duration: animation.loopEnd - animation.loopStart }, null, 2)};
const nodesData = ${JSON.stringify(nodes, null, 2)};
const loopOffset = ${animation.loopStart};

function interpolate(val1, val2, ratio) {
  if (Array.isArray(val1) && Array.isArray(val2)) {
    return val1.map((v, i) => v + (val2[i] - v) * ratio);
  }
  if (typeof val1 === 'string' && val1.startsWith('#')) {
    // Simple hex color interpolation
    const r1 = parseInt(val1.slice(1, 3), 16);
    const g1 = parseInt(val1.slice(3, 5), 16);
    const b1 = parseInt(val1.slice(5, 7), 16);
    const r2 = parseInt(val2.slice(1, 3), 16);
    const g2 = parseInt(val2.slice(3, 5), 16);
    const b2 = parseInt(val2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * ratio).toString(16).padStart(2, '0');
    const g = Math.round(g1 + (g2 - g1) * ratio).toString(16).padStart(2, '0');
    const b = Math.round(b1 + (b2 - b1) * ratio).toString(16).padStart(2, '0');
    return \`#\${r}\${g}\${b}\`;
  }
  return val1 + (val2 - val1) * ratio;
}

function getAnimatedValue(nodeId, property, baseValue, time) {
  const actualTime = time + loopOffset;
  const track = animationData.tracks.find(t => t.nodeId === nodeId && t.property === property);
  if (!track || track.keyframes.length === 0) return baseValue;

  const sortedKF = [...track.keyframes].sort((a, b) => a.time - b.time);
  
  if (actualTime <= sortedKF[0].time) return sortedKF[0].value;
  if (actualTime >= sortedKF[sortedKF.length - 1].time) return sortedKF[sortedKF.length - 1].value;

  for (let i = 0; i < sortedKF.length - 1; i++) {
    const kf1 = sortedKF[i];
    const kf2 = sortedKF[i + 1];
    if (actualTime >= kf1.time && actualTime <= kf2.time) {
      const ratio = (actualTime - kf1.time) / (kf2.time - kf1.time);
      return interpolate(kf1.value, kf2.value, ratio);
    }
  }
  return baseValue;
}

// Global animation state
let currentTime = 0;
const duration = animationData.duration;

function animate(time) {
  currentTime = (time / 1000) % duration;
  
  // Here you would update your Three.js objects
  nodesData.forEach(node => {
    const pos = getAnimatedValue(node.id, 'position', node.position, currentTime);
    const rot = getAnimatedValue(node.id, 'rotation', node.rotation, currentTime);
    const scale = getAnimatedValue(node.id, 'scale', node.scale, currentTime);
    // console.log(\`Node \${node.name} at time \${currentTime}: \`, pos);
  });
  
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
`;
    const blob = new Blob([animationCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'animation.js';
    link.click();
    URL.revokeObjectURL(url);
  }, [animation, nodes]);
  
  const handleExportGIF = useCallback(async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    // @ts-ignore
    const GIF = (await import('gif.js')).default;
    
    // Stop playing if it is
    setIsPlaying(false);

    // Fetch worker script to avoid CORS issues with cross-origin workers
    const workerResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
    const workerBlob = await workerResponse.blob();
    const workerUrl = URL.createObjectURL(workerBlob);
    
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: canvas.width,
      height: canvas.height,
      workerScript: workerUrl
    });

    const fps = 20;
    const loopDuration = animation.loopEnd - animation.loopStart;
    const frameCount = Math.ceil(loopDuration * fps);
    const step = 1 / fps;

    const originalTime = currentTime;

    for (let i = 0; i < frameCount; i++) {
      const time = animation.loopStart + i * step;
      setCurrentTime(time);
      
      // Wait for render
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      
      gif.addFrame(canvas, { copy: true, delay: (1 / fps) * 1000 });
      setGifProgress(Math.round(((i + 1) / frameCount) * 50));
    }

    // Reset time
    setCurrentTime(originalTime);

    gif.on('progress', (p: number) => {
      setGifProgress(Math.round(50 + p * 50));
    });

    gif.on('finished', (blob: Blob) => {
      setGifProgress(null);
      URL.revokeObjectURL(workerUrl);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'animation.gif';
      link.click();
      URL.revokeObjectURL(url);
    });

    gif.render();
  }, [animation.duration, currentTime]);

  const handleExportJSModel = useCallback((targetNodeId?: string) => {
    const nodesToExport = targetNodeId ? (() => {
      const node = nodes.find(n => n.id === targetNodeId);
      if (!node) return [];
      const findChildren = (parentId: string): SceneNode[] => {
        const direct = nodes.filter(n => n.parentId === parentId);
        return [...direct, ...direct.flatMap(d => findChildren(d.id))];
      };
      return [node, ...findChildren(node.id)];
    })() : nodes;

    if (nodesToExport.length === 0) return;

    const mainNode = targetNodeId ? nodes.find(n => n.id === targetNodeId) : null;
    const modelName = mainNode ? mainNode.name.replace(/[^a-zA-Z0-9]/g, '') : 'Scene';
    const funcName = `create${modelName}Model`;

    let code = `(function(root) {
    'use strict';

    function requireThree(THREERef) {
        const THREE = THREERef || root.THREE;
        if (!THREE) throw new Error('THREE is required to create the ${modelName} model.');
        return THREE;
    }

    function ${funcName}(THREERef) {
        const THREE = requireThree(THREERef);
        const group = new THREE.Group();

        // Helper for creating polygon/star shapes
        const createPolygonShape = (sides, radius, innerRadius, isStar) => {
            const shape = new THREE.Shape();
            const points = isStar ? sides * 2 : sides;
            const offset = -Math.PI / 2;
            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2 + offset;
                const r = isStar && i % 2 !== 0 ? radius * innerRadius : radius;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            }
            return shape;
        };

        const applyBend = (geo, amount) => {
            if (amount === 0) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const size = new THREE.Vector3();
            box.getSize(size);
            const width = size.x;
            const angle = amount * Math.PI * 2;
            if (Math.abs(angle) < 0.0001 || width === 0) return geo;
            const radius = width / angle;
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                let z = pos.getZ(i);
                const theta = x / radius;
                const r = radius - z;
                pos.setXYZ(i, r * Math.sin(theta), y, radius - r * Math.cos(theta));
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyTaper = (geo, amount) => {
            if (amount === 0) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);
            if (size.y === 0) return geo;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const normY = (y - box.min.y) / size.y;
                const scale = 1 + amount * normY;
                pos.setXYZ(i, (x - center.x) * scale + center.x, y, (z - center.z) * scale + center.z);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyStretch = (geo, amount) => {
            if (amount === 0) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const center = new THREE.Vector3();
            box.getCenter(center);
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const factor = 1 + amount;
                const radialFactor = factor > 0 ? 1 / Math.sqrt(factor) : 1;
                pos.setXYZ(i, (x - center.x) * radialFactor + center.x, (y - center.y) * factor + center.y, (z - center.z) * radialFactor + center.z);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyInflate = (geo, amount) => {
            if (amount === 0) return geo;
            const pos = geo.attributes.position;
            if (!geo.attributes.normal) geo.computeVertexNormals();
            const normal = geo.attributes.normal;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const nx = normal.getX(i);
                const ny = normal.getY(i);
                const nz = normal.getZ(i);
                pos.setXYZ(i, x + nx * amount, y + ny * amount, z + nz * amount);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyAsymmetricScale = (geo, amount) => {
            if (!amount || (amount[0] === 0 && amount[1] === 0 && amount[2] === 0)) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);
            if (size.y === 0) return geo;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const normY = (y - box.min.y) / size.y;
                const scaleX = 1 + amount[0] * normY;
                const scaleY = 1 + amount[1] * normY;
                const scaleZ = 1 + amount[2] * normY;
                pos.setXYZ(i, (x - center.x) * scaleX + center.x, (y - center.y) * scaleY + center.y, (z - center.z) * scaleZ + center.z);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyEdgeShift = (geo, amount) => {
            if (!amount || (amount[0] === 0 && amount[1] === 0 && amount[2] === 0)) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const size = new THREE.Vector3();
            box.getSize(size);
            if (size.x === 0 || size.y === 0 || size.z === 0) return geo;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const normY = Math.max(0, Math.min(1, (y - box.min.y) / size.y));
                const normX = Math.max(0, Math.min(1, (x - box.min.x) / size.x));
                const weight = Math.pow(normY, 2) * Math.pow(normX, 2);
                pos.setXYZ(i, x + amount[0] * weight, y + amount[1] * weight, z + amount[2] * weight);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

        const applyTwist = (geo, twist) => {
            if (!twist || (twist[0] === 0 && twist[1] === 0 && twist[2] === 0)) return geo;
            const pos = geo.attributes.position;
            const box = new THREE.Box3().setFromBufferAttribute(pos);
            const center = new THREE.Vector3();
            box.getCenter(center);
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                let z = pos.getZ(i);
                if (twist[1] !== 0) {
                    const angle = (y - center.y) * twist[1];
                    const s = Math.sin(angle);
                    const c = Math.cos(angle);
                    const nx = (x - center.x) * c - (z - center.z) * s + center.x;
                    const nz = (x - center.x) * s + (z - center.z) * c + center.z;
                    x = nx; z = nz;
                }
                if (twist[0] !== 0) {
                    const angle = (x - center.x) * twist[0];
                    const s = Math.sin(angle);
                    const c = Math.cos(angle);
                    const ny = (y - center.y) * c - (z - center.z) * s + center.y;
                    const nz = (y - center.y) * s + (z - center.z) * c + center.z;
                    y = ny; z = nz;
                }
                if (twist[2] !== 0) {
                    const angle = (z - center.z) * twist[2];
                    const s = Math.sin(angle);
                    const c = Math.cos(angle);
                    const nx = (x - center.x) * c - (y - center.y) * s + center.x;
                    const ny = (x - center.x) * s + (y - center.y) * c + center.y;
                    x = nx; y = ny;
                }
                pos.setXYZ(i, x, y, z);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        };

`;

    nodesToExport.forEach(node => {
      if (node.type === 'pointLight' || node.type === 'ambientLight') return;

      code += `        // ${node.name} (${node.type})\n`;
      
      let geometryCode = '';
      const params = node.parameters || {};
      const thickness = params.thickness || 0.1;
      const id = node.id.replace(/-/g, '_');
      
      let materialCode = `        const mat_${id} = new THREE.MeshPhongMaterial({ 
            color: '${node.color}',
            flatShading: true,
            transparent: ${ensureNumber(node.material?.opacity, 1) < 1},
            opacity: ${ensureNumber(node.material?.opacity, 1)},
            shininess: 50
        });\n`;

      switch (node.type) {
        case 'box':
          geometryCode = `new THREE.BoxGeometry(${params.width || 1}, ${params.height || 1}, ${params.depth || 1})`;
          break;
        case 'sphere':
          geometryCode = `new THREE.SphereGeometry(${params.radius || 0.5}, 32, 32)`;
          break;
        case 'cylinder':
          geometryCode = `new THREE.CylinderGeometry(${params.radiusTop || 0.5}, ${params.radiusBottom || 0.5}, ${params.height || 1}, 32)`;
          break;
        case 'torus':
          geometryCode = `new THREE.TorusGeometry(${params.radius || 0.5}, ${params.tube || 0.2}, 16, 100)`;
          break;
        case 'polygon':
          code += `        const shape_${id} = createPolygonShape(${params.sides || 5}, 0.5, ${params.innerRadius || 0.5}, ${params.isStar || false});\n`;
          geometryCode = `new THREE.ExtrudeGeometry(shape_${id}, { depth: ${thickness}, bevelEnabled: false })`;
          break;
        case 'rect':
        case 'plane':
          code += `        const shape_${id} = new THREE.Shape();
        shape_${id}.moveTo(-0.5, -0.5);
        shape_${id}.lineTo(0.5, -0.5);
        shape_${id}.lineTo(0.5, 0.5);
        shape_${id}.lineTo(-0.5, 0.5);
        shape_${id}.lineTo(-0.5, -0.5);\n`;
          geometryCode = `new THREE.ExtrudeGeometry(shape_${id}, { depth: ${thickness}, bevelEnabled: false })`;
          break;
        case 'triangle':
          code += `        const shape_${id} = new THREE.Shape();
        shape_${id}.moveTo(0, 0.5);
        shape_${id}.lineTo(0.5, -0.5);
        shape_${id}.lineTo(-0.5, -0.5);
        shape_${id}.lineTo(0, 0.5);\n`;
          geometryCode = `new THREE.ExtrudeGeometry(shape_${id}, { depth: ${thickness}, bevelEnabled: false })`;
          break;
        case 'circle':
          code += `        const shape_${id} = new THREE.Shape();
        shape_${id}.absarc(0, 0, ${params.radius || 0.5}, 0, Math.PI * 2, false);\n`;
          geometryCode = `new THREE.ExtrudeGeometry(shape_${id}, { depth: ${thickness}, bevelEnabled: false })`;
          break;
        case 'js_object': {
          const paramsObj = node.parameters || {};
          const paramInjections = Object.keys(paramsObj)
            .filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k))
            .map(k => `            const ${k} = parameters['${k}'];`)
            .join('\n');

          code += `        const mesh_${id} = (() => {
            const group = new THREE.Group();
            const parameters = ${JSON.stringify(paramsObj)};
            const color = '${node.color}';
${paramInjections}
            ${node.script?.split('\n').map(l => '            ' + l).join('\n')}
            
            const result = (typeof createScene === 'function') ? createScene(THREE) : group;
            if (result && result.traverse) {
                result.traverse(child => {
                    if (child.isMesh && child.geometry) {
${params.bend ? `                        applyBend(child.geometry, ${params.bend});` : ''}
${params.taper ? `                        applyTaper(child.geometry, ${params.taper});` : ''}
${params.stretch ? `                        applyStretch(child.geometry, ${params.stretch});` : ''}
${params.inflate ? `                        applyInflate(child.geometry, ${params.inflate});` : ''}
${params.twist ? `                        applyTwist(child.geometry, [${params.twist.join(', ')}]);` : ''}
${params.asymmetricScale ? `                        applyAsymmetricScale(child.geometry, [${params.asymmetricScale.join(', ')}]);` : ''}
${params.edgeShift ? `                        applyEdgeShift(child.geometry, [${params.edgeShift.join(', ')}]);` : ''}
                    }
                });
            }
            return result;
        })();\n`;
          break;
        }
        case 'text':
          geometryCode = `new THREE.BoxGeometry(${params.size || 0.5}, ${params.size || 0.5}, ${thickness})`; 
          break;
        default:
          geometryCode = `new THREE.BoxGeometry(1, 1, 1)`;
      }

      if (node.type !== 'js_object') {
        code += materialCode;
        code += `        const geometry_${id} = ${geometryCode};\n`;
        if (params.bend) code += `        applyBend(geometry_${id}, ${params.bend});\n`;
        if (params.taper) code += `        applyTaper(geometry_${id}, ${params.taper});\n`;
        if (params.stretch) code += `        applyStretch(geometry_${id}, ${params.stretch});\n`;
        if (params.inflate) code += `        applyInflate(geometry_${id}, ${params.inflate});\n`;
        if (params.twist) code += `        applyTwist(geometry_${id}, [${params.twist.join(', ')}]);\n`;
        if (params.asymmetricScale) code += `        applyAsymmetricScale(geometry_${id}, [${params.asymmetricScale.join(', ')}]);\n`;
        if (params.edgeShift) code += `        applyEdgeShift(geometry_${id}, [${params.edgeShift.join(', ')}]);\n`;
        code += `        const mesh_${id} = new THREE.Mesh(geometry_${id}, mat_${id});\n`;
      }

      code += `        if (mesh_${id}) {\n`;
      code += `            mesh_${id}.position.set(${node.position.join(', ')});\n`;
      code += `            mesh_${id}.rotation.set(${node.rotation.join(', ')});\n`;
      code += `            mesh_${id}.scale.set(${node.scale.join(', ')});\n`;
      code += `            group.add(mesh_${id});\n`;
      code += `        }\n\n`;
    });

    code += `        return group;\n    }\n\n    root.${funcName} = ${funcName};\n\n    if (typeof module !== 'undefined' && module.exports) {\n        module.exports = ${funcName};\n    }\n})(typeof window !== 'undefined' ? window : globalThis);\n`;

    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const name = targetNodeId ? (nodes.find(n => n.id === targetNodeId)?.name || 'model') : 'scene_models';
    link.download = `${name}.js`;
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes]);

  const handleBooleanOperation = useCallback(async (operationType: 'union' | 'subtract' | 'intersect' | 'xor') => {
    if (selectedIds.length !== 2 || !sceneRef.current || isProcessing) return;

    setIsProcessing(true);
    
    // Small delay to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const meshes: THREE.Mesh[] = [];
      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && selectedIds.includes(child.name)) {
          meshes.push(child);
        }
      });

      if (meshes.length !== 2) {
        throw new Error('请确保选中了两个相交的物体');
      }

      // Order: A is base, B is tool
      const meshA = meshes.find(m => m.name === selectedIds[0])!;
      const meshB = meshes.find(m => m.name === selectedIds[1])!;

      const evaluator = new Evaluator();
      evaluator.useGroups = true;
      
      let op;
      switch (operationType) {
        case 'union': op = ADDITION; break;
        case 'subtract': op = SUBTRACTION; break;
        case 'intersect': op = INTERSECTION; break;
        case 'xor': op = DIFFERENCE; break;
        default: op = ADDITION;
      }

      // 1. Prepare Brushes by BAKING world transforms into geometry
      // This ensures the CSG operation happens on the actual visual shapes
      const prepareBrush = (mesh: THREE.Mesh) => {
        const geometry = mesh.geometry.clone();
        mesh.updateMatrixWorld(true);
        geometry.applyMatrix4(mesh.matrixWorld);
        
        const brush = new Brush(geometry, mesh.material);
        brush.updateMatrixWorld(true);
        
        // Ensure BVH is computed for precision
        if (!(brush.geometry as any).boundsTree) {
          (brush.geometry as any).computeBoundsTree();
        }
        return brush;
      };

      const brushA = prepareBrush(meshA);
      const brushB = prepareBrush(meshB);

      // 2. Perform CSG
      const resultBrush = evaluator.evaluate(brushA, brushB, op);
      const resultGeometry = resultBrush.geometry;

      // 3. Center the resulting geometry so the gizmo is at the object's center
      resultGeometry.computeBoundingBox();
      const center = new THREE.Vector3();
      if (resultGeometry.boundingBox) {
        resultGeometry.boundingBox.getCenter(center);
      }
      
      const safeCenter = {
        x: Number.isFinite(center.x) ? center.x : 0,
        y: Number.isFinite(center.y) ? center.y : 0,
        z: Number.isFinite(center.z) ? center.z : 0
      };
      
      resultGeometry.translate(-safeCenter.x, -safeCenter.y, -safeCenter.z);
      
      // 4. Create a new node for the result
      const newId = crypto.randomUUID();
      const newNode: SceneNode = {
        id: newId,
        name: `Boolean ${operationType.toUpperCase()}`,
        type: 'csg',
        parentId: null,
        position: [safeCenter.x, safeCenter.y, safeCenter.z], // Set node position to the geometry center
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: meshA.material instanceof THREE.MeshStandardMaterial ? `#${meshA.material.color.getHexString()}` : '#4a90e2',
        geometryData: resultGeometry.toJSON(),
        parameters: {},
        visible: true
      };

      // Remove old nodes and add new one
      const nextNodes = nodes.filter(n => !selectedIds.includes(n.id)).concat(newNode);
      setNodes(nextNodes);
      setSelectedIds([newId]);
      pushHistory(nextNodes, [newId]);
    } catch (error) {
      console.error('Boolean operation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, nodes, pushHistory, isProcessing]);

  const handleBooleanXOR = () => handleBooleanOperation('xor' as any);

  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isSvg = fileName.endsWith('.svg');
    const isJs = fileName.endsWith('.js');

    if (isJs) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const scriptContent = e.target?.result as string;
        
        // Use regex for a quick check before calling AI
        const funcRegex = /function\s+create[a-zA-Z0-9_]+\s*\(/g;
        const matches = scriptContent.match(funcRegex) || [];

        if (matches.length > 1) {
          const confirmSplit = window.confirm(`Detected ${matches.length} possible models in this script. Would you like to use AI to intelligently extract them into individual layers?`);
          
          if (confirmSplit) {
            setIsProcessing(true);
            try {
              const { parseModelLibrary } = await import('./services/aiService');
              const extractedNodes = await parseModelLibrary(scriptContent);
              
              if (extractedNodes.length > 0) {
                const nodesToAdd = extractedNodes.map(data => ({
                  id: crypto.randomUUID(),
                  ...data,
                  visible: true
                } as SceneNode));

                const updatedNodes = [...nodes, ...nodesToAdd];
                setNodes(updatedNodes);
                setSelectedIds(nodesToAdd.map(n => n.id));
                pushHistory(updatedNodes, nodesToAdd.map(n => n.id));
                return;
              }
            } catch (err) {
              console.error("AI Split failed, falling back to basic import", err);
            } finally {
              setIsProcessing(false);
            }
          }
        }

        const newId = crypto.randomUUID();
        const newNode: SceneNode = {
          id: newId,
          name: file.name,
          type: 'js_object',
          parentId: null,
          script: scriptContent,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#ffffff',
          parameters: {},
          visible: true
        };
        const updatedNodes = [...nodes, newNode];
        setNodes(updatedNodes);
        setSelectedIds([newId]);
        pushHistory(updatedNodes, [newId]);
      };
      reader.readAsText(file);
      event.target.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    const newId = crypto.randomUUID();

    const newNode: SceneNode = {
      id: newId,
      name: file.name,
      type: isSvg ? 'svg' : 'model',
      parentId: null,
      url: url,
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
      parameters: isSvg ? { thickness: 0 } : {},
      visible: true
    };
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setSelectedIds([newId]);
    pushHistory(updatedNodes, [newId]);
    
    // Reset input
    event.target.value = '';
  }, [nodes, pushHistory]);

  const handleAddNode = useCallback((type: NodeType, properties?: Partial<SceneNode>) => {
    const newId = properties?.id || crypto.randomUUID();
    const typeLabel = type ? (type.charAt(0).toUpperCase() + type.slice(1)) : 'Node';
    const newNode: SceneNode = {
      id: newId,
      name: properties?.name || `${typeLabel} ${nodes.length + 1}`,
      type: type || 'box',
      parentId: null,
      position: properties?.position || (['js_object', 'motion_path'].includes(type) ? [0, 0, 0] : [0, 0.5, 0]),
      rotation: properties?.rotation || [0, 0, 0],
      scale: properties?.scale || [1, 1, 1],
      color: properties?.color || (type === 'pointLight' ? '#ffffff' : '#4a90e2'),
      script: type === 'js_object' ? `// Example: Torus Knot
const geometry = new THREE.TorusKnotGeometry(0.4, 0.1, 100, 16);
const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
const mesh = new THREE.Mesh(geometry, material);
return mesh;` : undefined,
      parameters: type === 'extruded' ? { thickness: 0.2 } : 
                  type === 'text' ? { text: 'Text', thickness: 0.2, size: 0.5 } :
                  type === 'pointLight' ? { intensity: 1, decay: 2, distance: 10 } : 
                  type === 'polygon' ? { sides: 5, innerRadius: 0.5, isStar: false } :
                  type === 'motion_path' ? { pathPoints: [[-2, 0, -2], [0, 1, 0], [2, 0, 2]] } : {},
      visible: true,
      ...properties
    };
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setSelectedIds([newId]);
    pushHistory(nextNodes, [newId]);
  }, [nodes, pushHistory]);

  const handleAiAddNodes = useCallback((newNodesData: Partial<SceneNode>[]) => {
    if (!Array.isArray(newNodesData)) return;
    const nodesToAdd: SceneNode[] = newNodesData.map((data, index) => ({
      id: crypto.randomUUID(),
      name: data.name || `AI Shape ${nodes.length + index + 1}`,
      type: data.type || 'box',
      parentId: null,
      position: data.position || [0, 0.5, 0],
      rotation: data.rotation || [0, 0, 0],
      scale: data.scale || [1, 1, 1],
      color: data.color || '#4a90e2',
      parameters: data.parameters || {},
      visible: true,
      ...data
    } as SceneNode));

    const updatedNodes = [...nodes, ...nodesToAdd];
    setNodes(updatedNodes);
    setSelectedIds(nodesToAdd.map(n => n.id));
    pushHistory(updatedNodes, nodesToAdd.map(n => n.id));
  }, [nodes, pushHistory]);

  const handleReplaceNodeWithPrimitives = useCallback((oldId: string, newNodesData: Partial<SceneNode>[]) => {
    if (!Array.isArray(newNodesData) || newNodesData.length === 0) return;
    
    const nodesToAdd = newNodesData.map((data, index) => ({
      id: crypto.randomUUID(),
      name: data.name || `Subpart ${index + 1}`,
      type: data.type || 'box',
      parentId: null,
      position: data.position || [0, 0, 0],
      rotation: data.rotation || [0, 0, 0],
      scale: data.scale || [1, 1, 1],
      color: data.color || '#4a90e2',
      parameters: data.parameters || {},
      visible: true,
      ...data
    } as SceneNode));

    const updatedNodes = nodes.filter(n => n.id !== oldId).concat(nodesToAdd);
    const newSelectedIds = nodesToAdd.map(n => n.id);
    
    setNodes(updatedNodes);
    setSelectedIds(newSelectedIds);
    pushHistory(updatedNodes, newSelectedIds);
  }, [nodes, pushHistory]);

  const handleUpdateTrackTrigger = useCallback((nodeId: string, trigger: 'auto' | 'click' | 'hover') => {
    setAnimation(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.nodeId === nodeId ? { ...t, trigger } : t)
    }));
  }, []);

  const handleUpdateTrackTriggerNode = useCallback((nodeId: string, triggerNodeId: string) => {
    setAnimation(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.nodeId === nodeId ? { ...t, triggerNodeId } : t)
    }));
  }, []);

  const handleUpdateTrackLoopMode = useCallback((nodeId: string, loopMode: 'once' | 'repeat2' | 'infinite') => {
    setAnimation(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.nodeId === nodeId ? { ...t, loopMode } : t)
    }));
  }, []);

  const handleHoverNode = useCallback((id: string | null) => {
    setHoveredNodeId(id);
    if (isPreviewMode && id) {
      setHoverStartTimes(prev => ({ ...prev, [id]: currentTime }));
    } else if (isPreviewMode && !id) {
      // We could clear it here, but keeping it might be useful for "hover out" if we had that.
      // But for trigger='hover', usually it only plays while hovered.
      // Let's clear when unhovered to reset the animation.
      setHoverStartTimes({});
    }
  }, [isPreviewMode, currentTime]);

  const handleUpdateNode = useCallback((id: string, updates: Partial<SceneNode>, skipHistory = false) => {
    let nextNodesResult: SceneNode[] = [];
    setNodes(prev => {
      nextNodesResult = prev.map(n => {
        if (n.id === id) {
          // Allow updating safe properties even if locked (especially for system lights)
          const safeProperties = ['locked', 'visible', 'color', 'parameters', 'name'];
          if (n.locked && Object.keys(updates).some(k => !safeProperties.includes(k))) {
            return n;
          }
          const updated = { ...n, ...updates };
          if (updates.parameters) {
            updated.parameters = { ...n.parameters, ...updates.parameters };
          }
          if (updates.material) {
            updated.material = { ...n.material, ...updates.material };
          }
          return updated;
        }
        return n;
      });
      return nextNodesResult;
    });

    // Auto-keyframe logic
    const animatedProps = ['position', 'rotation', 'scale', 'color', 'intensity'] as const;
    const currentTracks = animationRef.current.tracks;
    
    animatedProps.forEach(prop => {
      const isParam = prop === 'intensity';
      if (isParam ? updates.parameters?.intensity !== undefined : updates[prop as 'position'|'rotation'|'scale'|'color'] !== undefined) {
        const trackExists = currentTracks.findIndex(t => t.nodeId === id && t.property === prop) !== -1;
        if (trackExists) {
          handleAddKeyframe(id, prop);
        }
      }
    });

    // We can't easily push to history here because setNodes is async.
    // However, we can use historyRef to check if we should push.
    // Actually, we'll just push nextNodesResult which we captured.
    if (nextNodesResult.length > 0 && !skipHistory) {
      pushHistory(nextNodesResult, selectedIdsRef.current);
    }
  }, [pushHistory, handleAddKeyframe]);

  const handleDeleteNode = useCallback((id: string) => {
    // Prevent deletion of locked nodes
    const rootNode = nodes.find(n => n.id === id);
    if (rootNode?.locked) return;

    const toDelete = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(n => {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          changed = true;
        }
      });
    }
    const nextNodes = nodes.filter(n => !toDelete.has(n.id));
    const nextSelected = selectedIds.filter(sid => !toDelete.has(sid));
    setNodes(nextNodes);
    setSelectedIds(nextSelected);
    pushHistory(nextNodes, nextSelected);
  }, [nodes, selectedIds, pushHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length > 0) {
      // Filter out locked nodes from selection
      const deletableIds = selectedIds.filter(id => !nodes.find(n => n.id === id)?.locked);
      if (deletableIds.length === 0) return;

      const toDelete = new Set<string>(deletableIds);
      let changed = true;
      while (changed) {
        changed = false;
        nodes.forEach(n => {
          if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
            // Only delete children if they are not locked
            if (!n.locked) {
              toDelete.add(n.id);
              changed = true;
            }
          }
        });
      }
      const nextNodes = nodes.filter(n => !toDelete.has(n.id));
      setNodes(nextNodes);
      setSelectedIds([]);
      pushHistory(nextNodes, []);
    }
  }, [selectedIds, nodes, pushHistory]);

  const handleGroupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;

    const groupId = crypto.randomUUID();
    const groupNode: SceneNode = {
      id: groupId,
      name: `Group ${nodes.filter(n => n.type === 'group').length + 1}`,
      type: 'group',
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#4a90e2',
      parameters: {},
      visible: true
    };

    setNodes(prev => {
      // Find all nodes to be grouped and their descendants
      const toGroup = new Set<string>(selectedIds);
      let changed = true;
      while (changed) {
        changed = false;
        prev.forEach(n => {
          if (n.parentId && toGroup.has(n.parentId) && !toGroup.has(n.id)) {
            toGroup.add(n.id);
            changed = true;
          }
        });
      }

      const updatedNodes = prev.map(n => {
        // Only update the parentId of the top-level selected nodes
        if (selectedIds.includes(n.id)) {
          return { ...n, parentId: groupId };
        }
        return n;
      });
      return [...updatedNodes, groupNode];
    });
    setSelectedIds([groupId]);
  }, [selectedIds, nodes]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const groupId = selectedIds[0];
    const group = nodes.find(n => n.id === groupId);
    if (!group || group.type !== 'group') return;

    const children = nodes.filter(n => n.parentId === groupId);
    const nextNodes = nodes.map(n => 
      n.parentId === groupId ? { ...n, parentId: group.parentId } : n
    ).filter(n => n.id !== groupId);
    
    setNodes(nextNodes);
    setSelectedIds([]);
    pushHistory(nextNodes, []);
  }, [selectedIds, nodes, pushHistory]);

  const clearScene = useCallback(() => {
    setNodes([]);
    setSelectedIds([]);
    pushHistory([], []);
  }, [pushHistory]);

  const handleDuplicate = useCallback(() => {
    if (selectedIds.length === 0) return;

    const nodesToAdd: SceneNode[] = [];
    const newSelectedIds: string[] = [];

    const duplicateRecursive = (nodeId: string, newParentId: string | null, isTopLevel: boolean, currentNodes: SceneNode[]) => {
      const original = currentNodes.find(n => n.id === nodeId);
      if (!original) return;

      const newId = crypto.randomUUID();
      if (isTopLevel) newSelectedIds.push(newId);

      const newNode: SceneNode = {
        ...original,
        id: newId,
        name: `${original.name} (Copy)`,
        parentId: newParentId,
        position: [...original.position]
      };
      nodesToAdd.push(newNode);

      const children = currentNodes.filter(n => n.parentId === nodeId);
      children.forEach(child => duplicateRecursive(child.id, newId, false, currentNodes));
    };

    const topLevelToDuplicate = selectedIds.filter(id => {
      let current = nodes.find(n => n.id === id);
      while (current?.parentId) {
        if (selectedIds.includes(current.parentId)) return false;
        current = nodes.find(n => n.id === current.parentId);
      }
      return true;
    });

    topLevelToDuplicate.forEach(id => {
      const node = nodes.find(n => n.id === id);
      duplicateRecursive(id, node?.parentId || null, true, nodes);
    });

    const nextNodes = [...nodes, ...nodesToAdd];
    setNodes(nextNodes);
    setSelectedIds(newSelectedIds);
    pushHistory(nextNodes, newSelectedIds);
  }, [selectedIds, nodes, pushHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not typing in an input
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDuplicate, handleDeleteSelected, handleUndo, handleRedo]);

  const selectedNode = useMemo(() => 
    selectedIds.length === 1 ? nodes.find(n => n.id === selectedIds[0]) || null : null
  , [selectedIds, nodes]);

  const handleTextureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedNode) return;

    const url = URL.createObjectURL(file);
    handleUpdateNode(selectedNode.id, {
      material: {
        ...selectedNode.material,
        map: url
      }
    });
  };

  const setMaterialPreset = (preset: 'metal' | 'plastic' | 'matte' | 'glass' | 'frosted') => {
    if (!selectedNode) return;
    
    let material = {};
    switch (preset) {
      case 'metal':
        material = { metalness: 1.0, roughness: 0.15, transmission: 0, clearcoat: 0, preset: 'metal' };
        break;
      case 'plastic':
        material = { metalness: 0.0, roughness: 0.15, transmission: 0, clearcoat: 1.0, clearcoatRoughness: 0.02, ior: 1.45, preset: 'plastic' };
        break;
      case 'matte':
        material = { metalness: 0.0, roughness: 0.8, transmission: 0, clearcoat: 0, preset: 'matte' };
        break;
      case 'glass':
        material = { metalness: 0.0, roughness: 0.01, transmission: 1.0, ior: 1.5, thickness: 1.0, preset: 'glass' };
        break;
      case 'frosted':
        material = { metalness: 0.0, roughness: 0.5, transmission: 1.0, ior: 1.5, thickness: 2.0, clearcoat: 0.1, preset: 'frosted' };
        break;
    }
    
    handleUpdateNode(selectedNode.id, {
      material: {
        ...selectedNode.material,
        ...material
      }
    });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen bg-[#0e0e0e] overflow-hidden font-sans selection:bg-indigo-500/30">
        {/* Header */}
        {!isPreviewMode && (
          <header className="flex-none h-12 bg-[#181818] border-b border-[#2e2e2e] flex items-center justify-between px-4 z-50">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="font-bold tracking-tighter text-base flex items-center gap-1 text-[#e0e0e0]">
                  GIO<span className="text-[#4a90e2]">3D</span>
                </div>
                
                <div className="flex items-center gap-1 bg-[#121212] px-1.5 py-0.5 rounded-lg border border-[#2e2e2e]">
                  <Tooltip>
                    <TooltipTrigger 
                      onClick={() => setIsAiOpen(!isAiOpen)}
                      className={cn(
                        "p-1.5 rounded-md transition-all",
                        isAiOpen ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>AI Assistant</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger 
                      onClick={() => setIsUvEditorOpen(!isUvEditorOpen)}
                      className={cn(
                        "p-1.5 rounded-md transition-all",
                        isUvEditorOpen ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>UV Editor • UV展开编辑器</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger 
                      onClick={() => setIsBoneRigOpen(!isBoneRigOpen)}
                      className={cn(
                        "p-1.5 rounded-md transition-all",
                        isBoneRigOpen ? "bg-amber-600 text-white" : "text-[#888888] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Bone className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>Skeleton Rigging • 骨骼绑定工具</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger 
                      onClick={() => setIsPreviewMode(true)}
                      className="p-1.5 rounded-md text-[#888888] hover:text-white hover:bg-white/5 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>Preview Mode</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              
              <div className="h-6 w-px bg-[#2e2e2e]" />
            
            <div className="flex items-center gap-4">
              <Toolbar 
                activeTool={activeTool}
                onToolChange={setActiveTool}
                onAddShape={handleAddNode} 
                onDeleteSelected={handleDeleteSelected}
                onDuplicate={handleDuplicate}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onResetCamera={handleResetCamera}
                canUndo={historyIndexRef.current > 0}
                canRedo={historyIndexRef.current < historyRef.current.length - 1}
                hasSelection={selectedIds.length > 0}
              />

              {(selectedIds.length >= 2 || (selectedNode?.type === 'group')) && (
                <div className="flex items-center gap-2 ml-2">
                  <div className="h-4 w-px bg-[#2e2e2e] mr-2" />
                  {selectedIds.length === 2 && (
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleBooleanOperation('union')}
                        disabled={isProcessing}
                        className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="相加 (Union)"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Combine className="w-3 h-3" />} 相加
                      </button>
                      <button 
                        onClick={() => handleBooleanOperation('subtract')}
                        disabled={isProcessing}
                        className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="相减 (Subtract)"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />} 相减
                      </button>
                      <button 
                        onClick={() => handleBooleanOperation('intersect')}
                        disabled={isProcessing}
                        className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="内嵌 (Intersect)"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <BoxSelect className="w-3 h-3" />} 内嵌
                      </button>
                      <button 
                        onClick={handleBooleanXOR}
                        disabled={isProcessing}
                        className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="外嵌 (XOR)"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Combine className="w-3 h-3" />} 外嵌
                      </button>
                    </div>
                  )}
                  {selectedIds.length >= 2 && (
                    <button 
                      onClick={handleGroupSelected}
                      className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1"
                      title="编组 (Group)"
                    >
                      <FolderPlus className="w-3 h-3" /> 编组
                    </button>
                  )}
                  {selectedNode?.type === 'group' && (
                    <button 
                      onClick={handleUngroup}
                      className="bg-white/5 text-[#888888] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider hover:text-white transition-colors flex items-center gap-1"
                      title="取消编组 (Ungroup)"
                    >
                      <FolderMinus className="w-3 h-3" /> 解组
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="bg-white/5 hover:bg-white/10 text-[#e0e0e0] px-3 py-1 rounded text-[11px] font-bold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3 h-3" />
              IMPORT
              <input type="file" accept=".glb,.gltf,.js" className="hidden" onChange={handleImport} />
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger className="bg-[#4a90e2] hover:bg-[#357abd] text-white px-3 py-1 rounded text-[11px] font-bold tracking-wider transition-colors flex items-center gap-1 outline-none">
                EXPORT
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#181818] border-[#2e2e2e] text-[#e0e0e0] w-32">
                <DropdownMenuItem onClick={() => handleExportGLB()} className="text-xs hover:bg-white/5 cursor-pointer">
                  Export as GLB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPNG} className="text-xs hover:bg-white/5 cursor-pointer">
                  Export as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportAnimationJS()} className="text-xs hover:bg-white/5 cursor-pointer text-indigo-400 font-bold">
                  Export Animation JS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportGIF()} className="text-xs hover:bg-white/5 cursor-pointer text-pink-400">
                  Export as GIF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportJSModel()} className="text-xs hover:bg-white/5 cursor-pointer text-indigo-300">
                  Export JS Model
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      )}

      {gifProgress !== null && (
          <div className="fixed top-12 left-0 right-0 h-1 bg-indigo-900/30 z-[100]">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300" 
              style={{ width: `${gifProgress}%` }}
            />
            <div className="absolute top-2 right-4 text-[10px] text-indigo-400 font-mono bg-[#181818] px-2 py-1 rounded border border-indigo-500/20">
              GENERATING GIF: {gifProgress}%
            </div>
          </div>
        )}

        {/* Main Content Area: Canvas + Floating Panels */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          <main className="flex-1 relative bg-[#0e0e0e] min-w-0 overflow-hidden">
            {isPreviewMode && (
              <>
                <div className="absolute top-6 left-6 z-50">
                  <button 
                    onClick={() => setIsPreviewMode(false)}
                    className="flex items-center gap-2 bg-[#1c1c1c]/80 backdrop-blur-md border border-[#2e2e2e] px-4 py-2 rounded-full text-xs font-bold text-white hover:bg-[#2e2e2e] transition-all shadow-xl"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    BACK TO EDIT
                  </button>
                </div>

                <div className="absolute top-6 right-6 z-50">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="bg-[#4a90e2]/80 backdrop-blur-md hover:bg-[#357abd] text-white px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xl flex items-center gap-2 outline-none">
                      EXPORT
                      <ChevronDown className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-[#181818] border-[#2e2e2e] text-[#e0e0e0] w-44">
                      <DropdownMenuItem onClick={() => handleExportGLB()} className="text-xs hover:bg-white/5 cursor-pointer py-2">
                        Export as GLB
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPNG} className="text-xs hover:bg-white/5 cursor-pointer py-2">
                        Export as PNG
                      </DropdownMenuItem>
                      <div className="h-px bg-[#2e2e2e] my-1" />
                      <DropdownMenuItem onClick={() => handleExportAnimationJS()} className="text-xs hover:bg-white/5 cursor-pointer py-2 text-indigo-400 font-bold">
                        Export Animation JS
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportGIF()} className="text-xs hover:bg-white/5 cursor-pointer py-2 text-pink-400">
                        Export as GIF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportJSModel()} className="text-xs hover:bg-white/5 cursor-pointer py-2 text-indigo-300">
                        Export JS Model
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}

            <Canvas3D 
              activeTool={activeTool}
              nodes={animatedNodes} 
              selectedIds={isPreviewMode ? [] : selectedIds} 
              onSelect={isPreviewMode ? () => {} : setSelectedIds}
              onUpdateNode={handleUpdateNode}
              sceneRef={sceneRef}
              orbitControlsRef={orbitControlsRef}
              showGrid={isPreviewMode ? false : showGrid}
              onHoverNode={handleHoverNode}
              isPreviewMode={isPreviewMode}
              onClickNode={(id) => {
                if (isPreviewMode) {
                  const now = currentTime;
                  setClickTimes(prev => ({ ...prev, [id]: now }));
                  setClickedNodeIds(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }
              }}
            />
            
            {/* Viewport Info */}
            <div className="absolute bottom-5 left-5 bg-black/50 border border-[#2e2e2e] px-3 py-2 rounded-md text-[11px] font-mono text-[#888888] pointer-events-none flex flex-col gap-1 z-10">
              <div>NODES: {nodes.length} | SELECTED: {selectedIds.length}</div>
              <div className="text-[9px] opacity-70 uppercase tracking-tighter">
                {nodes.length === 0 ? "Scene is empty. Use the toolbar to add shapes." : "Scene is active"}
              </div>
            </div>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-[#181818]/80 backdrop-blur-sm border border-[#2e2e2e] p-8 rounded-2xl text-center max-w-xs pointer-events-auto shadow-2xl">
                  <Box className="w-12 h-12 text-[#4a90e2] mx-auto mb-4 opacity-50" />
                  <h3 className="text-[#e0e0e0] font-bold mb-2">Empty Scene</h3>
                  <p className="text-[#888888] text-xs mb-6 leading-relaxed">Your 3D canvas is waiting for your first creation. Add a shape to get started.</p>
                  <button 
                    onClick={() => handleAddNode('box')}
                    className="w-full bg-[#4a90e2] hover:bg-[#357abd] text-white py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-[#4a90e2]/20"
                  >
                    Add Initial Cube
                  </button>
                </div>
              </div>
            )}

            {!isPreviewMode && (
              <>
                <div className="absolute top-4 left-4 z-40 max-h-[calc(100%-12rem)]">
                    <LayersPanel 
                      nodes={nodes} 
                      selectedIds={selectedIds} 
                      onSelect={setSelectedIds} 
                      onUpdateNode={handleUpdateNode}
                      onReorder={setNodes}
                      onExportGLB={handleExportGLB}
                      onExportJS={handleExportJSModel}
                      isCollapsed={isLayersCollapsed}
                      onToggleCollapse={() => setIsLayersCollapsed(!isLayersCollapsed)}
                    />
                </div>

                <PropertiesPanel 
                  selectedShape={selectedNode} 
                  nodes={nodes}
                  onUpdateShape={handleUpdateNode} 
                  onAddNodes={handleAiAddNodes}
                  onReplaceNode={handleReplaceNodeWithPrimitives}
                  onDeleteNode={handleDeleteNode}
                  onOpenCodeEditor={() => {
                    if (selectedIds.length === 1) {
                      const node = nodes.find(n => n.id === selectedIds[0]);
                      if (node?.type === 'js_object') {
                        setEditingNodeId(node.id);
                        setIsCodeEditorOpen(true);
                      }
                    }
                  }}
                />
              </>
            )}
          </main>
        </div>

        {!isPreviewMode && (
          <Timeline 
            animation={animation}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTimeChange={setCurrentTime}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onStopPlay={() => setIsPlaying(false)}
            onAddKeyframe={handleAddKeyframe}
            onRemoveKeyframe={handleRemoveKeyframe}
            onUpdateKeyframe={handleUpdateKeyframe}
            onDeleteTrack={handleDeleteTrack}
            onUpdateAnimation={(data) => setAnimation(prev => ({ ...prev, ...data }))}
            selectedNodeId={selectedIds.length === 1 ? selectedIds[0] : null}
            nodes={nodes}
            animatedNodes={animatedNodes}
            onUpdateNode={handleUpdateNode}
            onUpdateTrackTrigger={handleUpdateTrackTrigger}
            onUpdateTrackTriggerNode={handleUpdateTrackTriggerNode}
            onUpdateTrackLoopMode={handleUpdateTrackLoopMode}
          />
        )}


        <CodeEditor 
          isOpen={isCodeEditorOpen}
          nodeName={editingNodeId ? (nodes.find(n => n.id === editingNodeId)?.name || 'Object') : 'Object'}
          initialCode={editingNodeId ? (nodes.find(n => n.id === editingNodeId)?.script || '') : ''}
          onSave={(code) => {
            if (editingNodeId) {
              handleUpdateNode(editingNodeId, { script: code });
            }
            setIsCodeEditorOpen(false);
            setEditingNodeId(null);
          }}
          onCancel={() => {
            setIsCodeEditorOpen(false);
            setEditingNodeId(null);
          }}
          onExtractLayer={(newNode) => {
            if (editingNodeId) {
              const editingNode = nodes.find(n => n.id === editingNodeId);
              if (editingNode) {
                // Add the new node relative to the edited node
                handleAiAddNodes([{
                  ...newNode,
                  position: [
                    (newNode.position?.[0] || 0) + editingNode.position[0],
                    (newNode.position?.[1] || 0) + editingNode.position[1],
                    (newNode.position?.[2] || 0) + editingNode.position[2]
                  ]
                }]);
              }
            }
          }}
        />



        <AICommander 
          nodes={nodes}
          selectedIds={selectedIds}
          onAddNode={handleAddNode}
          onAddNodes={handleAiAddNodes}
          onReplaceNode={handleReplaceNodeWithPrimitives}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onSelectNodes={setSelectedIds}
          clearScene={clearScene}
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
        />

        <UVEditor
          nodes={nodes}
          selectedIds={selectedIds}
          onUpdateNode={handleUpdateNode}
          isOpen={isUvEditorOpen}
          onClose={() => setIsUvEditorOpen(false)}
        />

        <BoneRigEditor
          nodes={nodes}
          selectedIds={selectedIds}
          onUpdateNode={handleUpdateNode}
          isOpen={isBoneRigOpen}
          onClose={() => setIsBoneRigOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}
