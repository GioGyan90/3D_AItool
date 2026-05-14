import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, ContactShadows, useGLTF, useTexture, Text3D, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { SceneNode } from '../types';

// Add BVH support to THREE
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

interface Canvas3DProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  sceneRef?: React.MutableRefObject<THREE.Group | null>;
  orbitControlsRef?: React.MutableRefObject<any>;
  showGrid?: boolean;
  onHoverNode?: (id: string | null) => void;
  onClickNode?: (id: string) => void;
  isPreviewMode?: boolean;
  activeTool?: string;
}

// Helper to ensure a value is a valid number
const ensureNumber = (val: any, fallback: number): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const applyBend = (geo: THREE.BufferGeometry, amount: number) => {
  if (amount === 0) return geo;
  
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
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

    pos.setXYZ(
      i,
      r * Math.sin(theta),
      y,
      radius - r * Math.cos(theta)
    );
  }
  
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const applyTaper = (geo: THREE.BufferGeometry, amount: number) => {
  if (amount === 0) return geo;
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (size.y === 0) return geo;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Normalize Y to [0, 1] relative to bottom of box
    const normY = (y - box.min.y) / size.y;
    const scale = 1 + amount * normY;

    pos.setXYZ(i, (x - center.x) * scale + center.x, y, (z - center.z) * scale + center.z);
  }
  
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const applyStretch = (geo: THREE.BufferGeometry, amount: number) => {
  if (amount === 0) return geo;
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Stretch along Y, compress X and Z to approximate volume preservation
    const factor = 1 + amount;
    const radialFactor = factor > 0 ? 1 / Math.sqrt(factor) : 1;
    
    pos.setXYZ(
      i, 
      (x - center.x) * radialFactor + center.x, 
      (y - center.y) * factor + center.y, 
      (z - center.z) * radialFactor + center.z
    );
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const applyInflate = (geo: THREE.BufferGeometry, amount: number) => {
  if (amount === 0) return geo;
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  
  if (!normal) {
    geo.computeVertexNormals();
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    
    const nx = geo.attributes.normal.getX(i);
    const ny = geo.attributes.normal.getY(i);
    const nz = geo.attributes.normal.getZ(i);

    pos.setXYZ(i, x + nx * amount, y + ny * amount, z + nz * amount);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const applyTwist = (geo: THREE.BufferGeometry, twist: [number, number, number]) => {
  if (!twist || (twist[0] === 0 && twist[1] === 0 && twist[2] === 0)) return geo;
  
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Twist around Y (common)
    if (twist[1] !== 0) {
      const angle = (y - center.y) * twist[1];
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const nx = (x - center.x) * c - (z - center.z) * s + center.x;
      const nz = (x - center.x) * s + (z - center.z) * c + center.z;
      x = nx;
      z = nz;
    }

    // Twist around X
    if (twist[0] !== 0) {
      const angle = (x - center.x) * twist[0];
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const ny = (y - center.y) * c - (z - center.z) * s + center.y;
      const nz = (y - center.y) * s + (z - center.z) * c + center.z;
      y = ny;
      z = nz;
    }

    // Twist around Z
    if (twist[2] !== 0) {
      const angle = (z - center.z) * twist[2];
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const nx = (x - center.x) * c - (y - center.y) * s + center.x;
      const ny = (x - center.x) * s + (y - center.y) * c + center.y;
      x = nx;
      y = ny;
    }

    pos.setXYZ(i, x, y, z);
  }
  
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const Model = ({ node }: { node: SceneNode }) => {
  const url = node.url || '';
  const color = node.color;
  const { scene } = useGLTF(url);
  
  const isTransparent = (node.material?.opacity ?? 1) < 1 || (node.material?.transmission ?? 0) > 0;
  
  // Clone the scene to avoid issues with multiple instances
  const clonedScene = useMemo(() => {
    try {
      if (!scene) return new THREE.Group();
      
      const clone = scene.clone();
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Handle both single material and array of materials
          const processMaterial = (oldMat: THREE.Material) => {
            if (!oldMat) return new THREE.MeshPhysicalMaterial();
            
            const newMat = new THREE.MeshPhysicalMaterial();
            try {
              if ((oldMat as any).copy) {
                newMat.copy(oldMat as any);
              }
            } catch (e) {
              console.warn('Could not copy material, using default', e);
            }
            
            if (color && color.toLowerCase() !== '#ffffff') {
              newMat.color.set(color);
            } else if (oldMat && (oldMat as any).color) {
              newMat.color.copy((oldMat as any).color);
            }
            
            newMat.opacity = node.material?.opacity ?? (oldMat as any).opacity ?? 1;
            newMat.transparent = isTransparent || (oldMat as any).transparent;
            newMat.metalness = ensureNumber(node.material?.metalness, (oldMat as any).metalness ?? 0);
            newMat.roughness = ensureNumber(node.material?.roughness, (oldMat as any).roughness ?? 0.5);
            newMat.transmission = ensureNumber(node.material?.transmission, (oldMat as any).transmission ?? 0);
            newMat.thickness = ensureNumber(node.material?.thickness, (oldMat as any).thickness ?? 0.5);
            newMat.ior = ensureNumber(node.material?.ior, (oldMat as any).ior ?? 1.5);
            newMat.clearcoat = ensureNumber(node.material?.clearcoat, (oldMat as any).clearcoat ?? 0);
            newMat.clearcoatRoughness = ensureNumber(node.material?.clearcoatRoughness, (oldMat as any).clearcoatRoughness ?? 0);
            newMat.wireframe = node.material?.wireframe ?? (oldMat as any).wireframe ?? false;
            newMat.envMapIntensity = 1.0; // Ensure environment affects physical material
            
            return newMat;
          };

          if (Array.isArray(child.material)) {
            child.material = child.material.map(processMaterial);
          } else {
            child.material = processMaterial(child.material);
          }
        }
      });
      return clone;
    } catch (error) {
      console.error('Error processing model:', error);
      return new THREE.Group(); // Return empty group on failure
    }
  }, [scene, color, node.material, isTransparent]);
  
  return <primitive object={clonedScene} />;
};

const SVGNode = ({ node }: { node: SceneNode }) => {
  const url = node.url || '';
  const color = node.color;
  const thickness = node.parameters?.thickness || 0.1;
  const svgData = useLoader(SVGLoader, url);
  
  const { shapes, boundingBox } = useMemo(() => {
    const allShapes: { shape: THREE.Shape; color: THREE.Color; index: number }[] = [];
    const box = new THREE.Box3();

    svgData.paths.forEach((path, i) => {
      // SVGLoader.createShapes handles complex paths with holes correctly
      const pathShapes = SVGLoader.createShapes(path);
      pathShapes.forEach((shape) => {
        allShapes.push({
          shape,
          color: path.color,
          index: i
        });
        
        // Update bounding box to center the SVG later
        const points = shape.getPoints();
        if (Array.isArray(points)) {
          points.forEach(p => {
            if (p && typeof p.x === 'number' && typeof p.y === 'number') {
              box.expandByPoint(new THREE.Vector3(p.x, p.y, 0));
            }
          });
        }
        
        if (Array.isArray(shape.holes)) {
          shape.holes.forEach(hole => {
            const holePoints = hole.getPoints();
            if (Array.isArray(holePoints)) {
              holePoints.forEach(p => {
                if (p && typeof p.x === 'number' && typeof p.y === 'number') {
                  box.expandByPoint(new THREE.Vector3(p.x, p.y, 0));
                }
              });
            }
          });
        }
      });
    });

    return { shapes: allShapes, boundingBox: box };
  }, [svgData]);

  const depth = thickness || 0.1;
  const isDefaultColor = color.toLowerCase() === '#ffffff';

  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  return (
    <group 
      rotation={[Math.PI, 0, 0]} 
      scale={0.01} 
      position={[-center.x * 0.01, center.y * 0.01, 0]} // Centering the SVG
    >
      {shapes.map((item, index) => (
        <mesh key={index} castShadow receiveShadow>
          {thickness > 0 ? (
            <extrudeGeometry
              args={[
                item.shape,
                { 
                  depth: thickness * 100, 
                  bevelEnabled: false,
                  curveSegments: 32
                }
              ]}
            />
          ) : (
            <shapeGeometry args={[item.shape, 32]} />
          )}
          <Material 
            node={node} 
            overrideColor={isDefaultColor ? `#${item.color.getHexString()}` : color} 
          />
        </mesh>
      ))}
    </group>
  );
};

const Text3DNode = ({ node }: { node: SceneNode }) => {
  const { text = "Text", thickness = 0.2, size = 0.5 } = node.parameters || {};
  // Standard helvetiker font from three.js examples
  const fontUrl = "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/helvetiker_bold.typeface.json";

  return (
    <Center top>
      <Text3D
        font={fontUrl}
        size={size}
        height={thickness}
        curveSegments={12}
        bevelEnabled
        bevelThickness={0.02}
        bevelSize={0.02}
        bevelOffset={0}
        bevelSegments={5}
      >
        {text}
        <Material node={node} />
      </Text3D>
    </Center>
  );
};

const PointLightNode = ({ node, isSelected }: { node: SceneNode; isSelected: boolean }) => {
  const { intensity = 1, decay = 2, distance = 10 } = node.parameters || {};
  
  return (
    <group>
      <pointLight 
        color={node.color} 
        intensity={intensity} 
        decay={decay} 
        distance={distance} 
        castShadow 
      />
      {/* Visual helper for the light source */}
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={node.color} />
      </mesh>
      {isSelected && (
        <mesh scale={[1.2, 1.2, 1.2]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
    </group>
  );
};

const AmbientLightNode = ({ node }: { node: SceneNode }) => {
  const { intensity = 0.5 } = node.parameters || {};
  // Hemisphere light provides a more natural sky/ground gradient
  // Use node.color as sky color and a slightly darker version or gray as ground color
  return (
    <hemisphereLight 
      color={node.color} 
      groundColor="#444444" 
      intensity={intensity} 
    />
  );
};

const Material = ({ node, overrideColor }: { node: SceneNode; overrideColor?: string }) => {
  const texture = node.material?.map ? useTexture(node.material.map) : null;
  const isTransparent = (node.material?.opacity ?? 1) < 1 || (node.material?.transmission ?? 0) > 0;
  const color = overrideColor || node.color;
  
  return (
    <meshPhysicalMaterial 
      key={isTransparent ? 'transparent' : 'opaque'}
      color={color} 
      metalness={node.material?.metalness ?? 0}
      roughness={node.material?.roughness ?? 0.5}
      map={texture}
      transmission={node.material?.transmission ?? 0}
      thickness={node.material?.thickness ?? (node.parameters?.thickness || 0.5)}
      opacity={node.material?.opacity ?? 1}
      transparent={isTransparent}
      ior={node.material?.ior ?? 1.5}
      wireframe={node.material?.wireframe ?? false}
      envMapIntensity={2.0}
      attenuationDistance={node.material?.attenuationDistance ?? 5}
      attenuationColor={new THREE.Color(node.material?.attenuationColor ?? node.color)}
    />
  );
};

const JSObjectNode = ({ node }: { node: SceneNode }) => {
  const object = useMemo(() => {
    if (!node.script) return null;
    try {
      // Create a function that has THREE and the node's properties in its scope.
      // We provide a pre-defined 'group' that the user can add items to.
      // We also inject all parameters and basic properties like color into the scope.
      
      const filteredParameters = { ...(node.parameters || {}) };
      // Remove keys that might conflict with injected variables
      delete (filteredParameters as any).THREE;
      delete (filteredParameters as any).color;
      delete (filteredParameters as any).group;
      
      const paramKeys = Object.keys(filteredParameters);
      const paramValues = Object.values(filteredParameters);
      
      let scriptToRun = node.script || '';
      
      // Heuristic to support files that define a function but don't call it.
      // We look for a pattern like: function createSomething(THREE) { ... }
      // and if we don't find a call to it in the code (ignoring comments), we append the call.
      
      // Look for common function declaration patterns: 
      // 1. function name(THREE) { ... }
      // 2. const name = (THREE) => { ... }
      const funcDeclRegex = /(?:function\s+([a-zA-Z0-9_]+)\s*\(\s*THREE\s*\))|(?:(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)/;
      const funcDeclMatch = scriptToRun.match(funcDeclRegex);
      
      if (funcDeclMatch) {
        const funcName = funcDeclMatch[1] || funcDeclMatch[2];
        // Check if it's actually called later in the same script (ignoring comments)
        const cleanScript = scriptToRun.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        // Search for the function name followed by a call token '(', but not as part of the declaration itself
        const callPattern = new RegExp(`(?<!function\\s+|const\\s+|let\\s+|var\\s+)${funcName}\\s*\\(`);
        
        if (!callPattern.test(cleanScript)) {
          scriptToRun += `\n\n// Automatically calling detected entry point\nreturn ${funcName}(THREE);`;
        }
      }

      const wrappedScript = `
        const group = new THREE.Group();
        ${scriptToRun}
        if (typeof createScene === 'function') {
          return createScene(THREE);
        }
        return group;
      `;
      
      // Inject parameters as arguments to the function
      const scriptFunc = new Function('THREE', 'color', ...paramKeys, wrappedScript);
      const result = scriptFunc(THREE, node.color, ...paramValues);
      
      if (result instanceof THREE.Object3D) {
        // Apply deformations to meshes within the custom object
        result.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            const params = node.parameters || {};
            if (params.bend) applyBend(child.geometry, params.bend);
            if (params.twist) applyTwist(child.geometry, params.twist);
            if (params.taper) applyTaper(child.geometry, params.taper);
            if (params.stretch) applyStretch(child.geometry, params.stretch);
            if (params.inflate) applyInflate(child.geometry, params.inflate);
          }
        });
        return result;
      }
      console.warn('JS Object script must return a THREE.Object3D instance or add to the pre-defined "group"');
      return null;
    } catch (e) {
      console.error('JS Object execution failed:', e);
      return null;
    }
  }, [node.script, JSON.stringify(node.parameters), node.color]);

  if (!object) return null;

  return <primitive object={object} />;
};

const Node = ({ 
  node, 
  allNodes,
  selectedIds, 
  onSelect, 
  onUpdateNode,
  orbitControlsRef,
  onHoverNode,
  onClickNode,
  isPreviewMode,
  activeTool
}: { 
  node: SceneNode; 
  allNodes: SceneNode[];
  selectedIds: string[]; 
  onSelect: (ids: string[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  orbitControlsRef?: React.MutableRefObject<any>;
  onHoverNode?: (id: string | null) => void;
  onClickNode?: (id: string) => void;
  isPreviewMode?: boolean;
  activeTool?: string;
}) => {
  const [mesh, setMesh] = React.useState<THREE.Group | null>(null);
  const draggingRef = useRef<{ 
    startX: number; 
    startY: number; 
    initialTwist: [number, number, number];
    initialTaper: number;
    initialStretch: number;
    initialInflate: number;
  } | null>(null);
  const isSelected = selectedIds.includes(node.id);
  const isPrimarySelection = selectedIds[selectedIds.length - 1] === node.id;
  const children = useMemo(() => allNodes.filter(n => n.parentId === node.id), [allNodes, node.id]);
  const initialPositions = useRef<{[key: string]: THREE.Vector3}>({});

  const geometry = useMemo(() => {
    const { type } = node;
    const parameters = node.parameters || {};
    const thickness = parameters.thickness || 0;
    const bevelRadius = parameters.bevelRadius || 0;
    const bevelSegments = parameters.bevelSegments || 4;
    const bend = parameters.bend || 0;
    const sides = parameters.sides || 5;
    const innerRadius = parameters.innerRadius || 0.5;
    const isStar = parameters.isStar || false;

    const createPolygonShape = (sides: number, radius: number, innerRadius: number, isStar: boolean) => {
      const shape = new THREE.Shape();
      const points = isStar ? sides * 2 : sides;
      // Start from top
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

    const createRoundedRect = (w: number, h: number, r: number) => {
      const shape = new THREE.Shape();
      const safeW = Math.max(0.001, w);
      const safeH = Math.max(0.001, h);
      const x = -safeW / 2;
      const y = -safeH / 2;
      const radius = Math.min(r, safeW / 2, safeH / 2);

      if (radius < 0.001) {
        shape.moveTo(x, y);
        shape.lineTo(x + safeW, y);
        shape.lineTo(x + safeW, y + safeH);
        shape.lineTo(x, y + safeH);
        shape.lineTo(x, y);
      } else {
        shape.moveTo(x + radius, y);
        shape.lineTo(x + safeW - radius, y);
        shape.quadraticCurveTo(x + safeW, y, x + safeW, y + radius);
        shape.lineTo(x + safeW, y + safeH - radius);
        shape.quadraticCurveTo(x + safeW, y + safeH, x + safeW - radius, y + safeH);
        shape.lineTo(x + radius, y + safeH);
        shape.quadraticCurveTo(x, y + safeH, x, y + h - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
      }
      return shape;
    };


    let baseGeometry: THREE.BufferGeometry;

    if (type === 'csg' && node.geometryData) {
      try {
        const loader = new THREE.BufferGeometryLoader();
        baseGeometry = loader.parse(node.geometryData);
      } catch (e) {
        console.error('Failed to parse CSG geometry', e);
        baseGeometry = new THREE.BufferGeometry();
      }
    } else if (type === 'box') {
      if (bevelRadius > 0) {
        const r = Math.min(bevelRadius, 0.495);
        const innerSide = Math.max(0.001, 1 - r * 2);
        const shape = createRoundedRect(innerSide, innerSide, r);
        baseGeometry = new THREE.ExtrudeGeometry(shape, { 
          depth: innerSide, 
          bevelEnabled: true, 
          bevelThickness: r, 
          bevelSize: r, 
          bevelSegments: bevelSegments,
          curveSegments: bend > 0 ? 64 : 12
        });
        baseGeometry.center();
      } else {
        baseGeometry = new THREE.BoxGeometry(1, 1, 1, bend > 0 ? 64 : 1, 1, 1);
      }
    } else if (thickness > 0 || type === 'extruded' || (bevelRadius > 0 && (type === 'rect' || type === 'plane' || type === 'circle' || type === 'triangle'))) {
      const depth = thickness || 0.2;
      let shape2D: THREE.Shape;

      switch (type) {
        case 'circle':
          shape2D = new THREE.Shape();
          shape2D.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
          break;
        case 'rect':
        case 'plane':
        case 'extruded':
          shape2D = createRoundedRect(1, 1, bevelRadius);
          break;
        case 'triangle':
          shape2D = new THREE.Shape();
          shape2D.moveTo(0, 0.5);
          shape2D.lineTo(0.5, -0.5);
          shape2D.lineTo(-0.5, -0.5);
          shape2D.lineTo(0, 0.5);
          break;
        case 'polygon':
          shape2D = createPolygonShape(sides, 0.5, innerRadius, isStar);
          break;
        default:
          return new THREE.BufferGeometry();
      }
      
      baseGeometry = new THREE.ExtrudeGeometry(shape2D, { 
        depth, 
        bevelEnabled: bevelRadius > 0, 
        bevelThickness: bevelRadius, 
        bevelSize: bevelRadius, 
        bevelSegments: bevelSegments,
        curveSegments: bend > 0 ? 64 : 12
      });
      baseGeometry.center();
    } else {
      switch (type) {
        case 'sphere': baseGeometry = new THREE.SphereGeometry(0.5, bend > 0 ? 64 : 32, 32); break;
        case 'cylinder': baseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, bend > 0 ? 64 : 32); break;
        case 'torus': baseGeometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100); break;
        case 'plane': baseGeometry = new THREE.PlaneGeometry(1, 1, bend > 0 ? 64 : 1, 1); break;
        case 'circle': baseGeometry = new THREE.CircleGeometry(0.5, bend > 0 ? 64 : 32); break;
        case 'rect': baseGeometry = new THREE.PlaneGeometry(1, 1, bend > 0 ? 64 : 1, 1); break;
        case 'triangle': baseGeometry = new THREE.CircleGeometry(0.5, 3); break;
        case 'polygon': 
          const polygonShape = createPolygonShape(sides, 0.5, innerRadius, isStar);
          baseGeometry = new THREE.ShapeGeometry(polygonShape, 32); 
          break;
        default: return new THREE.BufferGeometry();
      }
    }

    if (bend > 0) {
      applyBend(baseGeometry, bend);
    }

    if (node.parameters.twist) {
      applyTwist(baseGeometry, node.parameters.twist);
    }

    if (node.parameters.taper) {
      applyTaper(baseGeometry, node.parameters.taper);
    }

    if (node.parameters.stretch) {
      applyStretch(baseGeometry, node.parameters.stretch);
    }

    if (node.parameters.inflate) {
      applyInflate(baseGeometry, node.parameters.inflate);
    }

    // Ensure BVH is computed for CSG and raycasting
    if (!(baseGeometry as any).boundsTree) {
      (baseGeometry as any).computeBoundsTree();
    }

    return baseGeometry;
  }, [node.type, JSON.stringify(node.parameters)]);

  // Cleanup geometry on unmount or change
  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (!node.visible && !isPreviewMode) return null;

  return (
    <>
      <group
        ref={setMesh}
        name={node.id}
        position={node.position}
        rotation={node.rotation}
        scale={node.scale}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverNode?.(node.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverNode?.(null);
        }}
        onPointerDown={(e) => {
          if (!['twist', 'taper', 'stretch', 'inflate'].includes(activeTool || '')) return;
          e.stopPropagation();
          (e.target as any).setPointerCapture(e.pointerId);
          draggingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialTwist: node.parameters.twist ? [...node.parameters.twist] : [0, 0, 0],
            initialTaper: node.parameters.taper || 0,
            initialStretch: node.parameters.stretch || 0,
            initialInflate: node.parameters.inflate || 0
          };
          if (orbitControlsRef?.current) orbitControlsRef.current.enabled = false;
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current || !activeTool) return;
          e.stopPropagation();
          const dx = (e.clientX - draggingRef.current.startX);
          const dy = (e.clientY - draggingRef.current.startY);
          
          const updates: Partial<SceneNode> = {};
          
          if (activeTool === 'twist') {
            const twistDx = dx * 0.05;
            const twistDy = dy * 0.05;
            updates.parameters = {
              ...node.parameters,
              twist: [
                draggingRef.current.initialTwist[0] + twistDy,
                draggingRef.current.initialTwist[1] + twistDx,
                draggingRef.current.initialTwist[2]
              ]
            };
          } else if (activeTool === 'taper') {
            updates.parameters = {
              ...node.parameters,
              taper: draggingRef.current.initialTaper - dy * 0.01
            };
          } else if (activeTool === 'stretch') {
            updates.parameters = {
              ...node.parameters,
              stretch: draggingRef.current.initialStretch - dy * 0.01
            };
          } else if (activeTool === 'inflate') {
            updates.parameters = {
              ...node.parameters,
              inflate: draggingRef.current.initialInflate + dx * 0.01
            };
          }
          
          if (Object.keys(updates).length > 0) {
            onUpdateNode(node.id, updates);
          }
        }}
        onPointerUp={(e) => {
          if (!['twist', 'taper', 'stretch', 'inflate'].includes(activeTool || '')) return;
          e.stopPropagation();
          (e.target as any).releasePointerCapture(e.pointerId);
          draggingRef.current = null;
          if (orbitControlsRef?.current) orbitControlsRef.current.enabled = true;
        }}
        onClick={(e) => {
          e.stopPropagation();
          
          // Trigger the interaction click handler
          onClickNode?.(node.id);
          
          if (e.shiftKey || e.metaKey) {
            onSelect(selectedIds.includes(node.id) 
              ? selectedIds.filter(id => id !== node.id)
              : [...selectedIds, node.id]
            );
          } else {
            onSelect([node.id]);
          }
        }}
      >
        {node.type === 'model' && node.url ? (
          <Model node={node} />
        ) : node.type === 'svg' && node.url ? (
          <SVGNode node={node} />
        ) : node.type === 'text' ? (
          <Text3DNode node={node} />
        ) : node.type === 'js_object' ? (
          <JSObjectNode node={node} />
        ) : node.type === 'pointLight' ? (
          <PointLightNode node={node} isSelected={isSelected} />
        ) : node.type === 'ambientLight' ? (
          <AmbientLightNode node={node} />
        ) : node.type !== 'group' ? (
          <mesh geometry={geometry} name={node.id}>
            {!node.visible && isPreviewMode ? (
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            ) : (
              node.type === 'csg' && Array.isArray(geometry.groups) && geometry.groups.length > 0 ? (
                geometry.groups.map((_, index) => (
                  <Material key={index} node={node} />
                ))
              ) : (
                <Material node={node} />
              )
            )}
          </mesh>
        ) : null}
        
        {children.map(child => (
          <Node 
            key={child.id} 
            node={child} 
            allNodes={allNodes}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onUpdateNode={onUpdateNode}
            orbitControlsRef={orbitControlsRef}
            onHoverNode={onHoverNode}
            onClickNode={onClickNode}
            isPreviewMode={isPreviewMode}
            activeTool={activeTool}
          />
        ))}
      </group>
      
      {isPrimarySelection && mesh && !node.locked && activeTool === 'select' && (
        <TransformControls
          object={mesh}
          mode="translate"
          onMouseDown={() => {
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = false;
            
            // Store initial positions of all selected objects for delta calculation
            initialPositions.current = {};
            selectedIds.forEach(id => {
              const targetNode = allNodes.find(n => n.id === id);
              if (targetNode && Array.isArray(targetNode.position)) {
                initialPositions.current[id] = new THREE.Vector3(...targetNode.position);
              }
            });
          }}
          onObjectChange={() => {
            if (selectedIds.length > 1 && mesh && mesh.position) {
              const initialPos = initialPositions.current[node.id] || mesh.position;
              if (!initialPos) return;
              
              const delta = new THREE.Vector3().copy(mesh.position).sub(initialPos);
              
              // Move other selected objects visually (real-time feedback)
              selectedIds.forEach(id => {
                if (id === node.id) return;
                const otherMesh = mesh.parent?.getObjectByName(id);
                const initialPosOther = initialPositions.current[id];
                if (otherMesh && otherMesh.position && initialPosOther) {
                  otherMesh.position.copy(initialPosOther).add(delta);
                }
              });
            }
          }}
          onMouseUp={() => {
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = true;
            if (mesh && mesh.position) {
              const initialPosPrimary = initialPositions.current[node.id];
              if (!initialPosPrimary) return;

              const delta = new THREE.Vector3().copy(mesh.position).sub(initialPosPrimary);
              
              // Apply updates to all selected nodes
              selectedIds.forEach(id => {
                const targetNode = allNodes.find(n => n.id === id);
                if (targetNode && Array.isArray(targetNode.position)) {
                  const initialPos = initialPositions.current[id] || new THREE.Vector3(...targetNode.position);
                  if (!initialPos) return;
                  
                  const newPos = initialPos.clone().add(delta);
                  
                  // For the primary mesh, we also update rotation/scale if they changed
                  if (id === node.id) {
                    onUpdateNode(id, {
                      position: [newPos.x, newPos.y, newPos.z],
                      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
                      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
                    });
                  } else {
                    onUpdateNode(id, {
                      position: [newPos.x, newPos.y, newPos.z],
                    });
                  }
                }
              });
            }
          }}
        />
      )}
    </>
  );
};

export const Canvas3D: React.FC<Canvas3DProps> = ({ 
  nodes, 
  selectedIds, 
  onSelect, 
  onUpdateNode,
  sceneRef,
  orbitControlsRef,
  showGrid = true,
  onHoverNode,
  onClickNode,
  isPreviewMode,
  activeTool
}) => {
  const rootNodes = useMemo(() => nodes.filter(n => !n.parentId), [nodes]);
  const ambientNode = useMemo(() => nodes.find(n => n.type === 'ambientLight'), [nodes]);
  const envValue = ambientNode?.parameters?.environment || 'city';
  const isPreset = ['city', 'studio', 'apartment', 'lobby', 'night', 'warehouse', 'sunset', 'dawn', 'park', 'forest'].includes(envValue);

  return (
    <div className="w-full h-full bg-[#0e0e0e]">
      <Canvas 
        shadows={{ type: THREE.PCFShadowMap }} 
        camera={{ position: [5, 5, 5], fov: 50 }} 
        onPointerMissed={() => onSelect([])}
        gl={{ 
          antialias: true, 
          alpha: false, 
          preserveDrawingBuffer: true,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <pointLight position={[10, 10, 10]} intensity={0.8} />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={0.8} />
        
        <Grid 
          infiniteGrid 
          fadeDistance={30} 
          fadeStrength={5} 
          sectionSize={1} 
          sectionColor="#2e2e2e" 
          cellColor="#1a1a1a" 
          visible={showGrid}
        />
        
        <Suspense fallback={null}>
          {isPreset ? (
            <Environment preset={envValue as any} />
          ) : (
            <Environment files={envValue} />
          )}
          <group ref={sceneRef}>
            {rootNodes.map((node) => (
              <Node 
                key={node.id} 
                node={node} 
                allNodes={nodes}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onUpdateNode={onUpdateNode}
                orbitControlsRef={orbitControlsRef}
                onHoverNode={onHoverNode}
                onClickNode={onClickNode}
                isPreviewMode={isPreviewMode}
                activeTool={activeTool}
              />
            ))}
          </group>
        </Suspense>

        <OrbitControls 
          ref={orbitControlsRef}
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 1.75} 
        />
        <ContactShadows position={[0, -0.01, 0]} opacity={0.3} scale={20} blur={2.5} far={4.5} />
        <color attach="background" args={["#0e0e0e"]} />
      </Canvas>
    </div>
  );
};
