import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useLoader, useFrame, useThree, createPortal } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, ContactShadows, useGLTF, useTexture, Text3D, Center, Environment, useVideoTexture } from '@react-three/drei';
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

const applyAsymmetricScale = (geo: THREE.BufferGeometry, amount: [number, number, number]) => {
  if (!amount || (amount[0] === 0 && amount[1] === 0 && amount[2] === 0)) return geo;
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (size.y === 0) return geo;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Normalize Y to [0, 1] relative to bottom of box
    const normY = (y - box.min.y) / size.y;
    
    // Scale X and Z independently based on normY and the amount factors
    const scaleX = 1 + amount[0] * normY;
    const scaleY = 1 + amount[1] * normY;
    const scaleZ = 1 + amount[2] * normY;

    pos.setXYZ(
      i, 
      (x - center.x) * scaleX + center.x, 
      (y - center.y) * scaleY + center.y, 
      (z - center.z) * scaleZ + center.z
    );
  }
  
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const applyEdgeShift = (geo: THREE.BufferGeometry, amount: [number, number, number]) => {
  if (!amount || (amount[0] === 0 && amount[1] === 0 && amount[2] === 0)) return geo;
  const pos = geo.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.x === 0 || size.y === 0 || size.z === 0) return geo;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const normY = Math.max(0, Math.min(1, (y - box.min.y) / size.y));
    const normX = Math.max(0, Math.min(1, (x - box.min.x) / size.x));

    // Shift only the top-right corner edge smoothly
    const weight = Math.pow(normY, 2) * Math.pow(normX, 2);

    pos.setXYZ(
      i,
      x + amount[0] * weight,
      y + amount[1] * weight,
      z + amount[2] * weight
    );
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

interface PathPointHandleProps {
  node: SceneNode;
  pointIndex: number;
  point: [number, number, number];
  isActive: boolean;
  onClickHandle: () => void;
  onPointDrag: (index: number, localPos: [number, number, number]) => void;
  onPointDragEnd: (index: number, localPos: [number, number, number]) => void;
  orbitControlsRef?: React.MutableRefObject<any>;
}

const PathPointHandle: React.FC<PathPointHandleProps> = ({
  node,
  pointIndex,
  point,
  isActive,
  onClickHandle,
  onPointDrag,
  onPointDragEnd,
  orbitControlsRef
}) => {
  const { scene } = useThree();
  const [mesh, setMesh] = React.useState<THREE.Mesh | null>(null);
  const isDraggingRef = React.useRef(false);

  // Sync position imperatively when not dragging
  React.useEffect(() => {
    if (mesh && !isDraggingRef.current) {
      mesh.position.set(point[0], point[1], point[2]);
    }
  }, [point, mesh]);

  const getLocalPos = (): [number, number, number] | null => {
    if (!mesh) return null;
    return [mesh.position.x, mesh.position.y, mesh.position.z];
  };

  const handleUpdate = () => {
    const local = getLocalPos();
    if (local) {
      onPointDrag(pointIndex, local);
    }
  };

  const handleUpdateEnd = () => {
    isDraggingRef.current = false;
    const local = getLocalPos();
    if (local) {
      onPointDragEnd(pointIndex, local);
    }
  };

  return (
    <group>
      {isActive && mesh && createPortal(
        <TransformControls
          object={mesh}
          mode="translate"
          onMouseDown={() => {
            isDraggingRef.current = true;
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = false;
          }}
          onObjectChange={handleUpdate}
          onMouseUp={() => {
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = true;
            handleUpdateEnd();
          }}
        />,
        scene
      )}
      <mesh
        ref={setMesh}
        onClick={(e) => {
          e.stopPropagation();
          onClickHandle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (document.body) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (document.body) document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[isActive ? 0.22 : 0.14, 16, 16]} />
        <meshBasicMaterial color={isActive ? "#fbbf24" : "#818cf8"} depthTest={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
};

const MotionPathNode = ({
  node,
  isSelected,
  activeTool,
  onUpdateNode,
  orbitControlsRef,
  isPreviewMode
}: {
  node: SceneNode;
  isSelected: boolean;
  activeTool?: string;
  onUpdateNode: any;
  orbitControlsRef: any;
  isPreviewMode?: boolean;
}) => {
  const points = node.parameters?.pathPoints || [];
  const selectedPointIndex = node.selectedPathPointIndex !== undefined ? node.selectedPathPointIndex : 0;
  const lineRef = useRef<any>(null);

  // Keep local points vector array for high-performance visual edits
  const localPointsRef = useRef<THREE.Vector3[]>([]);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      localPointsRef.current = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      updateLineGeometry();
    }
  }, [points]);

  const updateLineGeometry = () => {
    if (!lineRef.current) return;
    const curvePoints = localPointsRef.current;
    if (curvePoints.length === 0) return;

    const pathType = node.parameters?.pathType || 'smooth';
    const curve = (pathType === 'smooth' && curvePoints.length > 1) ? new THREE.CatmullRomCurve3(curvePoints) : null;
    const linePoints = curve ? curve.getPoints(50) : curvePoints;
    const floatArray = new Float32Array(linePoints.flatMap(p => [p.x, p.y, p.z]));

    const geom = lineRef.current.geometry;
    geom.setAttribute('position', new THREE.BufferAttribute(floatArray, 3));
    geom.attributes.position.needsUpdate = true;
  };

  const handlePointDrag = (index: number, localPos: [number, number, number]) => {
    isDraggingRef.current = true;
    localPointsRef.current[index] = new THREE.Vector3(localPos[0], localPos[1], localPos[2]);
    updateLineGeometry();
  };

  const handlePointDragEnd = (index: number, localPos: [number, number, number]) => {
    isDraggingRef.current = false;
    const updatedPoints = [...points];
    updatedPoints[index] = localPos;

    onUpdateNode(node.id, {
      selectedPathPointIndex: index,
      parameters: {
        ...node.parameters,
        pathPoints: updatedPoints
      }
    });
  };

  if (points.length === 0) return null;
  if (!node.visible && isPreviewMode) return null;

  const curvePoints = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const pathType = node.parameters?.pathType || 'smooth';
  const curve = (pathType === 'smooth' && points.length > 1) ? new THREE.CatmullRomCurve3(curvePoints) : null;
  const initialLinePoints = curve ? curve.getPoints(50) : curvePoints;

  return (
    <group>
      <line ref={lineRef}>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(initialLinePoints.flatMap(p => [p.x, p.y, p.z])), 3]}
            count={initialLinePoints.length}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial attach="material" color={isSelected ? "#818cf8" : "#4b5563"} linewidth={3} />
      </line>

      {isSelected && points.map((pt, index) => (
        <PathPointHandle
          key={index}
          node={node}
          pointIndex={index}
          point={pt}
          isActive={index === selectedPointIndex}
          onClickHandle={() => {
            onUpdateNode(node.id, { selectedPathPointIndex: index });
          }}
          onPointDrag={handlePointDrag}
          onPointDragEnd={handlePointDragEnd}
          orbitControlsRef={orbitControlsRef}
        />
      ))}
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

const VideoMaterial = ({ node, overrideColor }: { node: SceneNode; overrideColor?: string }) => {
  const [videoTexture, setVideoTexture] = React.useState<THREE.VideoTexture | null>(null);
  const url = node.material?.videoMap;
  const materialRef = React.useRef<THREE.MeshPhysicalMaterial>(null);

  React.useEffect(() => {
    if (!url) {
      setVideoTexture(null);
      return;
    }

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.crossOrigin = "Anonymous";
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('playsinline', 'true');
    
    // Explicitly load the video
    video.load();
    
    // For many browsers, we need to try playing
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("Video auto-play failed or was interrupted:", err);
      });
    }

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    // Initial wrapping modes
    const wrapSMode = node.material?.mapWrapS === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
    const wrapTMode = node.material?.mapWrapT === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
      
    texture.wrapS = wrapSMode;
    texture.wrapT = wrapTMode;

    // Initial repeats and offsets with mirroring/flipping support
    const rx = node.material?.mapRepeatX ?? 1;
    const ry = node.material?.mapRepeatY ?? 1;
    const baseOx = node.material?.mapOffsetX ?? 0;
    const baseOy = node.material?.mapOffsetY ?? 0;

    const finalRx = node.material?.mapWrapS === 'mirror' ? -rx : rx;
    const finalRy = node.material?.mapWrapT === 'mirror' ? -ry : ry;

    const finalOx = node.material?.mapWrapS === 'mirror' ? baseOx + rx : baseOx;
    const finalOy = node.material?.mapWrapT === 'mirror' ? baseOy + ry : baseOy;

    texture.repeat.set(finalRx, finalRy);
    texture.offset.set(finalOx, finalOy);

    // Initial rotation
    const rotDeg = node.material?.mapRotation ?? 0;
    texture.center.set(0.5, 0.5);
    texture.rotation = (rotDeg * Math.PI) / 180;
    
    setVideoTexture(texture);

    return () => {
      video.pause();
      video.src = "";
      video.load();
      texture.dispose();
    };
  }, [url]);

  React.useEffect(() => {
    if (!videoTexture) return;

    let changed = false;

    // wrapping modes
    const wrapSMode = node.material?.mapWrapS === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
    const wrapTMode = node.material?.mapWrapT === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);

    if (videoTexture.wrapS !== wrapSMode) {
      videoTexture.wrapS = wrapSMode;
      changed = true;
    }
    if (videoTexture.wrapT !== wrapTMode) {
      videoTexture.wrapT = wrapTMode;
      changed = true;
    }

    // repeats and offsets with mirroring/flipping support
    const rx = node.material?.mapRepeatX ?? 1;
    const ry = node.material?.mapRepeatY ?? 1;
    const baseOx = node.material?.mapOffsetX ?? 0;
    const baseOy = node.material?.mapOffsetY ?? 0;

    const finalRx = node.material?.mapWrapS === 'mirror' ? -rx : rx;
    const finalRy = node.material?.mapWrapT === 'mirror' ? -ry : ry;

    const finalOx = node.material?.mapWrapS === 'mirror' ? baseOx + rx : baseOx;
    const finalOy = node.material?.mapWrapT === 'mirror' ? baseOy + ry : baseOy;

    if (videoTexture.repeat.x !== finalRx || videoTexture.repeat.y !== finalRy) {
      videoTexture.repeat.set(finalRx, finalRy);
      changed = true;
    }

    if (videoTexture.offset.x !== finalOx || videoTexture.offset.y !== finalOy) {
      videoTexture.offset.set(finalOx, finalOy);
      changed = true;
    }

    // rotation
    const rotDeg = node.material?.mapRotation ?? 0;
    const rotRad = (rotDeg * Math.PI) / 180;
    if (videoTexture.rotation !== rotRad) {
      videoTexture.center.set(0.5, 0.5);
      videoTexture.rotation = rotRad;
      changed = true;
    }

    if (changed) {
      videoTexture.needsUpdate = true;
      if (materialRef.current) {
        materialRef.current.needsUpdate = true;
      }
    }
  }, [
    videoTexture,
    node.material?.mapOffsetX,
    node.material?.mapOffsetY,
    node.material?.mapRepeatX,
    node.material?.mapRepeatY,
    node.material?.mapRotation,
    node.material?.mapWrapS,
    node.material?.mapWrapT
  ]);

  const isTransparent = (node.material?.opacity ?? 1) < 1 || (node.material?.transmission ?? 0) > 0;
  const color = overrideColor || node.color;

  return (
    <meshPhysicalMaterial 
      ref={materialRef}
      key={`video-${node.id}`}
      color={videoTexture ? "#ffffff" : color} 
      metalness={node.material?.metalness ?? 0}
      roughness={node.material?.roughness ?? 0.5}
      map={videoTexture}
      transmission={node.material?.transmission ?? 0}
      thickness={node.material?.thickness ?? (node.parameters?.thickness || 0.5)}
      opacity={node.material?.opacity ?? 1}
      transparent={isTransparent}
      ior={node.material?.ior ?? 1.5}
      wireframe={node.material?.wireframe ?? false}
      envMapIntensity={2.0}
      attenuationDistance={node.material?.attenuationDistance ?? 5}
      attenuationColor={new THREE.Color(node.material?.attenuationColor ?? node.color)}
      side={THREE.DoubleSide}
    />
  );
};

const StaticMaterial = ({ node, overrideColor }: { node: SceneNode; overrideColor?: string }) => {
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const url = node.material?.map;
  const materialRef = React.useRef<THREE.MeshPhysicalMaterial>(null);

  React.useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      loader.setCrossOrigin('anonymous');
    }

    let isMounted = true;
    loader.load(
      url,
      (tex) => {
        if (!isMounted) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        
        // Initial wrapping modes
        const wrapSMode = node.material?.mapWrapS === 'mirror' 
          ? THREE.MirroredRepeatWrapping 
          : (node.material?.mapWrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
        const wrapTMode = node.material?.mapWrapT === 'mirror' 
          ? THREE.MirroredRepeatWrapping 
          : (node.material?.mapWrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
        
        tex.wrapS = wrapSMode;
        tex.wrapT = wrapTMode;

        // Initial repeats and offsets with mirroring/flipping support
        const rx = node.material?.mapRepeatX ?? 1;
        const ry = node.material?.mapRepeatY ?? 1;
        const baseOx = node.material?.mapOffsetX ?? 0;
        const baseOy = node.material?.mapOffsetY ?? 0;

        const finalRx = node.material?.mapWrapS === 'mirror' ? -rx : rx;
        const finalRy = node.material?.mapWrapT === 'mirror' ? -ry : ry;

        const finalOx = node.material?.mapWrapS === 'mirror' ? baseOx + rx : baseOx;
        const finalOy = node.material?.mapWrapT === 'mirror' ? baseOy + ry : baseOy;

        tex.repeat.set(finalRx, finalRy);
        tex.offset.set(finalOx, finalOy);

        // Initial rotation
        const rotDeg = node.material?.mapRotation ?? 0;
        tex.center.set(0.5, 0.5);
        tex.rotation = (rotDeg * Math.PI) / 180;

        tex.flipY = false; // Match standard GLTF/web expectations
        tex.needsUpdate = true;
        
        setTexture(tex);
      },
      undefined,
      (err) => console.error("Failed to load texture for mesh:", url, err)
    );

    return () => {
      isMounted = false;
    };
  }, [url]);

  React.useEffect(() => {
    return () => {
      if (texture) texture.dispose();
    };
  }, [texture, url]);

  React.useEffect(() => {
    if (!texture) return;

    let changed = false;

    // wrapping modes
    const wrapSMode = node.material?.mapWrapS === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
    const wrapTMode = node.material?.mapWrapT === 'mirror' 
      ? THREE.MirroredRepeatWrapping 
      : (node.material?.mapWrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);

    if (texture.wrapS !== wrapSMode) {
      texture.wrapS = wrapSMode;
      changed = true;
    }
    if (texture.wrapT !== wrapTMode) {
      texture.wrapT = wrapTMode;
      changed = true;
    }

    // repeats and offsets with mirroring/flipping support
    const rx = node.material?.mapRepeatX ?? 1;
    const ry = node.material?.mapRepeatY ?? 1;
    const baseOx = node.material?.mapOffsetX ?? 0;
    const baseOy = node.material?.mapOffsetY ?? 0;

    const finalRx = node.material?.mapWrapS === 'mirror' ? -rx : rx;
    const finalRy = node.material?.mapWrapT === 'mirror' ? -ry : ry;

    const finalOx = node.material?.mapWrapS === 'mirror' ? baseOx + rx : baseOx;
    const finalOy = node.material?.mapWrapT === 'mirror' ? baseOy + ry : baseOy;

    if (texture.repeat.x !== finalRx || texture.repeat.y !== finalRy) {
      texture.repeat.set(finalRx, finalRy);
      changed = true;
    }

    if (texture.offset.x !== finalOx || texture.offset.y !== finalOy) {
      texture.offset.set(finalOx, finalOy);
      changed = true;
    }

    // rotation
    const rotDeg = node.material?.mapRotation ?? 0;
    const rotRad = (rotDeg * Math.PI) / 180;
    if (texture.rotation !== rotRad) {
      texture.center.set(0.5, 0.5);
      texture.rotation = rotRad;
      changed = true;
    }

    if (changed) {
      texture.needsUpdate = true;
      if (materialRef.current) {
        materialRef.current.needsUpdate = true;
      }
    }
  }, [
    texture,
    node.material?.mapOffsetX,
    node.material?.mapOffsetY,
    node.material?.mapRepeatX,
    node.material?.mapRepeatY,
    node.material?.mapRotation,
    node.material?.mapWrapS,
    node.material?.mapWrapT
  ]);

  const isTransparent = (node.material?.opacity ?? 1) < 1 || (node.material?.transmission ?? 0) > 0;
  const color = overrideColor || node.color;
  
  return (
    <meshPhysicalMaterial 
      ref={materialRef}
      key={`static-mat-${node.id}-${texture ? 'textured' : 'plain'}`}
      color={texture ? "#ffffff" : color} 
      metalness={node.material?.metalness ?? 0}
      roughness={node.material?.roughness ?? 0.5}
      map={texture}
      transmission={node.material?.transmission ?? 0}
      thickness={node.material?.thickness ?? (node.parameters?.thickness || 0.5)}
      opacity={node.material?.opacity ?? 1}
      transparent={isTransparent || !!texture}
      ior={node.material?.ior ?? 1.5}
      wireframe={node.material?.wireframe ?? false}
      envMapIntensity={2.0}
      attenuationDistance={node.material?.attenuationDistance ?? 5}
      attenuationColor={new THREE.Color(node.material?.attenuationColor ?? node.color)}
      side={THREE.DoubleSide}
      onUpdate={(m) => {
        if (texture) {
          m.needsUpdate = true;
        }
      }}
    />
  );
};

const Material = ({ node, overrideColor }: { node: SceneNode; overrideColor?: string }) => {
  // Use a simple selection logic without Suspense to prevent the 'static flag' and 'scene disappearing' issues
  if (node.material?.videoMap) {
    return <VideoMaterial node={node} overrideColor={overrideColor} />;
  }
  
  return <StaticMaterial node={node} overrideColor={overrideColor} />;
};

const JSObjectNode = ({ node }: { node: SceneNode }) => {
  const object = useMemo(() => {
    if (!node.script) return null;
    try {
      const filteredParameters = { ...(node.parameters || {}) };
      delete (filteredParameters as any).THREE;
      delete (filteredParameters as any).color;
      delete (filteredParameters as any).group;
      
      const paramKeys = Object.keys(filteredParameters);
      const paramValues = Object.values(filteredParameters);
      
      let scriptToRun = node.script || '';
      const rootMock: any = { THREE };
      
      // Inject parameters as arguments to the function
      // We wrap the script to support the UMD pattern which expects 'root' or 'window'
      const wrappedScript = `
        const group = new THREE.Group();
        const window = root;
        const globalThis = root;
        const self = root;
        
        // Execute the user script
        try {
          ${scriptToRun}
        } catch (e) {
          console.error("Error executing custom script:", e);
        }
        
        // Entry point detection
        
        // 1. Check for specific createScene or createModel function in script scope or root
        if (typeof globalThis.createScene === 'function') return globalThis.createScene(THREE, root);
        if (typeof createScene === 'function') return createScene(THREE, root);
        
        // Search local scope for any function starting with 'create'
        try {
          const localFuncs = Object.keys(root).filter(k => typeof root[k] === 'function');
          const creator = localFuncs.find(k => k.toLowerCase().startsWith('create'));
          if (creator) return root[creator](THREE, root);
        } catch(e) {}

        // 2. Try to find an exported function on root (UMD pattern)
        const exportedFuncs = Object.entries(root).filter(([k, v]) => typeof v === 'function' && k !== 'THREE');
        if (exportedFuncs.length > 0) {
           const creator = exportedFuncs.find(([k]) => k.toLowerCase().startsWith('create')) || exportedFuncs[0];
           return creator[1](THREE, root);
        }

        // 3. Last fallback: group has children
        if (group.children.length > 0) return group;
        
        return group;
      `;

      const scriptFunc = new Function('THREE', 'color', 'root', ...paramKeys, wrappedScript);
      const result = scriptFunc(THREE, node.color, rootMock, ...paramValues);
      
      if (result instanceof THREE.Object3D) {
        // Apply deformations and material properties to meshes within the custom object
        result.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Apply material properties if node has them
            if (node.material || node.color) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => {
                  if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhongMaterial) {
                    if (node.color && node.color.toLowerCase() !== '#ffffff') m.color.set(node.color);
                    if (node.material?.metalness !== undefined) (m as any).metalness = node.material.metalness;
                    if (node.material?.roughness !== undefined) (m as any).roughness = node.material.roughness;
                    if (node.material?.opacity !== undefined) {
                      m.opacity = node.material.opacity;
                      m.transparent = m.opacity < 1;
                    }
                  }
                });
              } else if (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial) {
                const m = child.material;
                if (node.color && node.color.toLowerCase() !== '#ffffff') m.color.set(node.color);
                if (node.material?.metalness !== undefined) (m as any).metalness = node.material.metalness;
                if (node.material?.roughness !== undefined) (m as any).roughness = node.material.roughness;
                if (node.material?.opacity !== undefined) {
                  m.opacity = node.material.opacity;
                  m.transparent = m.opacity < 1;
                }
              }
            }

            if (child.geometry) {
              const params = node.parameters || {};
              if (params.bend) applyBend(child.geometry, params.bend);
              if (params.twist) applyTwist(child.geometry, params.twist);
              if (params.taper) applyTaper(child.geometry, params.taper);
              if (params.stretch) applyStretch(child.geometry, params.stretch);
              if (params.inflate) applyInflate(child.geometry, params.inflate);
              if (params.asymmetricScale) applyAsymmetricScale(child.geometry, params.asymmetricScale);
              if (params.edgeShift) applyEdgeShift(child.geometry, params.edgeShift);
            }
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

  useFrame((state) => {
    if (object && object.userData.animate) {
      try {
        // In the provided library format, the first arg is an entity object with a 'mesh' property
        // and the second arg is time in ms
        object.userData.animate({ mesh: object }, state.clock.elapsedTime * 1000);
      } catch (e) {
        // Ignore errors in custom animation scripts
      }
    }
  });

  if (!object) return null;

  return <primitive object={object} />;
};

interface JointMatrices {
  matrices: { [id: string]: THREE.Matrix4 };
  rests: { [id: string]: THREE.Matrix4 };
  skins: { [id: string]: THREE.Matrix4 };
}

export const computeJointMatrices = (boneRig: any): JointMatrices => {
  const matrices: { [id: string]: THREE.Matrix4 } = {};
  const rests: { [id: string]: THREE.Matrix4 } = {};
  const skins: { [id: string]: THREE.Matrix4 } = {};

  if (!boneRig || !Array.isArray(boneRig.joints) || boneRig.joints.length === 0) {
    return { matrices, rests, skins };
  }

  const jointsMap = new Map(boneRig.joints.map((j: any) => [j.id, j]));

  const getLocalMatrix = (joint: any, applyPose: boolean) => {
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3(...joint.position);
    const rot = new THREE.Euler();
    
    if (applyPose && Array.isArray(joint.rotation)) {
      const rx = (joint.rotation[0] || 0) * Math.PI / 180;
      const ry = (joint.rotation[1] || 0) * Math.PI / 180;
      const rz = (joint.rotation[2] || 0) * Math.PI / 180;
      rot.set(rx, ry, rz);
    }
    
    mat.makeRotationFromEuler(rot);
    mat.setPosition(pos);
    return mat;
  };

  const traverse = (jointId: string, parentMatrix: THREE.Matrix4, parentRest: THREE.Matrix4) => {
    const joint = jointsMap.get(jointId);
    if (!joint) return;

    // Pose local matrix
    const localPose = getLocalMatrix(joint, true);
    const globalPose = parentMatrix.clone().multiply(localPose);
    matrices[jointId] = globalPose;

    // Rest local matrix
    const localRest = getLocalMatrix(joint, false);
    const globalRest = parentRest.clone().multiply(localRest);
    rests[jointId] = globalRest;

    // Compute skin matrix: Pose * Rest_inv
    const restInv = globalRest.clone().invert();
    skins[jointId] = globalPose.clone().multiply(restInv);

    // Recursively handle descendants
    boneRig.joints.forEach((child: any) => {
      if (child.parentJointId === jointId) {
        traverse(child.id, globalPose, globalRest);
      }
    });
  };

  // Find roots (joints with parentJointId null or not present in mapping)
  boneRig.joints.forEach((j: any) => {
    if (!j.parentJointId || !jointsMap.has(j.parentJointId)) {
      traverse(j.id, new THREE.Matrix4(), new THREE.Matrix4());
    }
  });

  return { matrices, rests, skins };
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
  activeTool,
  parentBoneRig
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
  parentBoneRig?: any;
}) => {
  const [mesh, setMesh] = React.useState<THREE.Group | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const parentBinds = parentBoneRig?.binds || [];
  const childBind = parentBinds.find((b: any) => b.nodeId === node.id);
  const boundJointId = childBind?.jointId;

  useFrame(() => {
    if (!groupRef.current) return;

    if (parentBoneRig && boundJointId) {
      const { skins } = computeJointMatrices(parentBoneRig);
      const skinMat = skins[boundJointId];
      if (skinMat) {
        groupRef.current.matrixAutoUpdate = false;

        const localMat = new THREE.Matrix4();
        const pos = new THREE.Vector3(...node.position);
        
        const rot = new THREE.Euler(
          node.rotation[0] || 0,
          node.rotation[1] || 0,
          node.rotation[2] || 0
        );
        const q = new THREE.Quaternion().setFromEuler(rot);
        const scl = new THREE.Vector3(...node.scale);
        localMat.compose(pos, q, scl);

        const finalMat = skinMat.clone().multiply(localMat);
        groupRef.current.matrix.copy(finalMat);
      }
    } else {
      groupRef.current.matrixAutoUpdate = true;
    }
  });

  const draggingRef = useRef<{ 
    startX: number; 
    startY: number; 
    initialTwist: [number, number, number];
    initialTaper: number;
    initialStretch: number;
    initialInflate: number;
    initialBevel: number;
    initialAsymScale?: [number, number, number];
    initialEdgeShift?: [number, number, number];
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
        shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
        shape.absarc(x + w - radius, y + radius, radius, Math.PI * 1.5, Math.PI * 2, false);
        shape.absarc(x + w - radius, y + h - radius, radius, 0, Math.PI * 0.5, false);
        shape.absarc(x + radius, y + h - radius, radius, Math.PI * 0.5, Math.PI, false);
        shape.lineTo(x, y + radius);
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
        const r = Math.min(bevelRadius, 0.49);
        const innerW = 1 - r * 2;
        const shape = createRoundedRect(innerW, innerW, r);
        baseGeometry = new THREE.ExtrudeGeometry(shape, { 
          depth: innerW, 
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
    } else if (type === 'cylinder') {
      if (bevelRadius > 0) {
        const r = Math.min(bevelRadius, 0.49);
        const shape = new THREE.Shape();
        shape.absarc(0, 0, 0.5 - r, 0, Math.PI * 2, false);
        baseGeometry = new THREE.ExtrudeGeometry(shape, {
          depth: 1 - r * 2,
          bevelEnabled: true,
          bevelThickness: r,
          bevelSize: r,
          bevelSegments: bevelSegments,
          curveSegments: 32
        });
        baseGeometry.center();
      } else {
        baseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, bend > 0 ? 64 : 32);
      }
    } else if (thickness > 0 || type === 'extruded' || (bevelRadius > 0 && (type === 'rect' || type === 'plane' || type === 'circle' || type === 'triangle' || type === 'polygon'))) {
      const depth = thickness || 0.2;
      let shape2D: THREE.Shape;

      switch (type) {
        case 'circle':
          shape2D = new THREE.Shape();
          shape2D.absarc(0, 0, 0.5 - (bevelRadius > 0 ? bevelRadius : 0), 0, Math.PI * 2, false);
          break;
        case 'rect':
        case 'plane':
        case 'extruded':
          shape2D = createRoundedRect(1 - (bevelRadius > 0 ? bevelRadius * 2 : 0), 1 - (bevelRadius > 0 ? bevelRadius * 2 : 0), bevelRadius);
          break;
        case 'triangle':
          shape2D = new THREE.Shape();
          const tr = bevelRadius > 0 ? bevelRadius : 0;
          shape2D.moveTo(0, 0.5 - tr);
          shape2D.lineTo(0.5 - tr, -0.5 + tr);
          shape2D.lineTo(-0.5 + tr, -0.5 + tr);
          shape2D.lineTo(0, 0.5 - tr);
          break;
        case 'polygon':
          shape2D = createPolygonShape(sides, 0.5 - (bevelRadius > 0 ? bevelRadius : 0), innerRadius, isStar);
          break;
        default:
          return new THREE.BufferGeometry();
      }
      
      baseGeometry = new THREE.ExtrudeGeometry(shape2D, { 
        depth: Math.max(0.001, depth - (bevelRadius > 0 ? bevelRadius * 2 : 0)), 
        bevelEnabled: bevelRadius > 0, 
        bevelThickness: bevelRadius, 
        bevelSize: bevelRadius, 
        bevelSegments: bevelSegments,
        curveSegments: bend > 0 ? 64 : 12
      });
      baseGeometry.center();
    } else {
      switch (type) {
        case 'sphere': baseGeometry = new THREE.SphereGeometry(parameters.radius || 0.5, bend > 0 ? 64 : 32, 32); break;
        case 'torus': baseGeometry = new THREE.TorusGeometry(parameters.radius || 0.5, parameters.tube || 0.2, 16, 100); break;
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

    if (node.parameters.asymmetricScale) {
      applyAsymmetricScale(baseGeometry, node.parameters.asymmetricScale);
    }

    if (node.parameters.edgeShift) {
      applyEdgeShift(baseGeometry, node.parameters.edgeShift);
    }

    if (node.parameters?.customUVs) {
      try {
        const customUVsArray = new Float32Array(node.parameters.customUVs);
        baseGeometry.setAttribute('uv', new THREE.BufferAttribute(customUVsArray, 2));
      } catch (err) {
        console.warn('Failed to apply custom UVs:', err);
      }
    }

    if (node.parameters?.boneRig) {
      try {
        const rig = node.parameters.boneRig;
        const { rests, skins } = computeJointMatrices(rig);
        const posAttr = baseGeometry.getAttribute('position');
        
        if (posAttr && rig.joints && rig.joints.length > 0) {
          const originalPosition = posAttr.clone();
          const count = posAttr.count;
          
          const jointsMap = new Map(rig.joints.map((j: any) => [j.id, j]));
          const bones: { jointId: string; start: THREE.Vector3; end: THREE.Vector3 }[] = [];
          
          rig.joints.forEach((joint: any) => {
            const endPos = new THREE.Vector3();
            if (rests[joint.id]) {
              endPos.setFromMatrixPosition(rests[joint.id]);
            }
            
            const startPos = new THREE.Vector3();
            if (joint.parentJointId && rests[joint.parentJointId]) {
              startPos.setFromMatrixPosition(rests[joint.parentJointId]);
            } else {
              startPos.set(0, 0, 0);
            }
            bones.push({ jointId: joint.id, start: startPos, end: endPos });
          });

          const v = new THREE.Vector3();
          const vTransformed = new THREE.Vector3();
          const tempV = new THREE.Vector3();
          
          for (let i = 0; i < count; i++) {
            v.fromBufferAttribute(originalPosition, i);
            
            let weights: { jointId: string; weight: number }[] = [];
            
            bones.forEach((bone) => {
              const segment = new THREE.Line3(bone.start, bone.end);
              const closestPoint = new THREE.Vector3();
              segment.closestPointToPoint(v, true, closestPoint);
              const distSq = v.distanceToSquared(closestPoint);
              
              const w = 1.0 / (distSq + 0.1);
              weights.push({ jointId: bone.jointId, weight: w });
            });
            
            weights.sort((a, b) => b.weight - a.weight);
            const topWeights = weights.slice(0, 2);
            let sumTop = 0;
            topWeights.forEach(tw => sumTop += tw.weight);
            
            vTransformed.set(0, 0, 0);
            topWeights.forEach((tw) => {
              const normalizedW = tw.weight / (sumTop || 1);
              const skinMat = skins[tw.jointId];
              if (skinMat) {
                tempV.copy(v);
                tempV.applyMatrix4(skinMat);
                vTransformed.addScaledVector(tempV, normalizedW);
              }
            });
            
            posAttr.setXYZ(i, vTransformed.x, vTransformed.y, vTransformed.z);
          }
          
          posAttr.needsUpdate = true;
          baseGeometry.computeVertexNormals();
        }
      } catch (err) {
        console.warn('Failed to deform mesh vertices:', err);
      }
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
        ref={(el) => {
          setMesh(el);
          groupRef.current = el;
        }}
        name={node.id}
        position={node.position}
        rotation={node.rotation}
        scale={node.scale}
        visible={isPreviewMode ? node.visible !== false : true}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverNode?.(node.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverNode?.(null);
        }}
        onPointerDown={(e) => {
          if (!['twist', 'taper', 'stretch', 'inflate', 'bevel', 'asym_scale', 'edge_shift'].includes(activeTool || '')) return;
          e.stopPropagation();
          (e.target as any).setPointerCapture(e.pointerId);
          draggingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialTwist: node.parameters.twist ? [...node.parameters.twist] : [0, 0, 0],
            initialTaper: node.parameters.taper || 0,
            initialStretch: node.parameters.stretch || 0,
            initialInflate: node.parameters.inflate || 0,
            initialBevel: node.parameters.bevelRadius || 0,
            initialAsymScale: node.parameters.asymmetricScale ? [...node.parameters.asymmetricScale] : [0, 0, 0],
            initialEdgeShift: node.parameters.edgeShift ? [...node.parameters.edgeShift] : [0, 0, 0]
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
          } else if (activeTool === 'bevel') {
            updates.parameters = {
              ...node.parameters,
              bevelRadius: Math.max(0, Math.min(0.5, draggingRef.current.initialBevel + dx * 0.005))
            };
          } else if (activeTool === 'asym_scale') {
            const init = draggingRef.current.initialAsymScale || [0, 0, 0];
            updates.parameters = {
              ...node.parameters,
              asymmetricScale: [
                init[0] + dx * 0.01,
                init[1],
                init[2] - dy * 0.01
              ]
            };
          } else if (activeTool === 'edge_shift') {
            const init = draggingRef.current.initialEdgeShift || [0, 0, 0];
            updates.parameters = {
              ...node.parameters,
              edgeShift: [
                init[0] + dx * 0.01,
                init[1],
                init[2] - dy * 0.01
              ]
            };
          }
          
          if (Object.keys(updates).length > 0) {
            onUpdateNode(node.id, updates);
          }
        }}
        onPointerUp={(e) => {
          if (!['twist', 'taper', 'stretch', 'inflate', 'bevel', 'asym_scale', 'edge_shift'].includes(activeTool || '')) return;
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
        ) : node.type === 'motion_path' ? (
          <MotionPathNode 
            node={node} 
            isSelected={isSelected} 
            activeTool={activeTool} 
            onUpdateNode={onUpdateNode} 
            orbitControlsRef={orbitControlsRef} 
            isPreviewMode={isPreviewMode}
          />
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

        {node.parameters?.boneRig && (
          <group name="visual-skeleton">
            {(() => {
              const { matrices } = computeJointMatrices(node.parameters.boneRig);
              return node.parameters.boneRig.joints.map((joint: any) => {
                const jointPos = new THREE.Vector3();
                if (matrices[joint.id]) {
                  jointPos.setFromMatrixPosition(matrices[joint.id]);
                }
                
                const parentPos = new THREE.Vector3();
                if (joint.parentJointId && matrices[joint.parentJointId]) {
                  parentPos.setFromMatrixPosition(matrices[joint.parentJointId]);
                } else {
                  parentPos.set(0, 0, 0); 
                }

                return (
                  <group key={joint.id}>
                    {/* The Joint Sphere */}
                    <mesh position={jointPos}>
                      <sphereGeometry args={[0.045, 12, 12]} />
                      <meshBasicMaterial color="#06b6d4" depthTest={false} transparent opacity={0.9} />
                    </mesh>
                    
                    {/* The Bone Connection line/octahedron */}
                    {joint.parentJointId && (
                      <line>
                        <bufferGeometry attach="geometry" onUpdate={(self) => {
                          self.setFromPoints([parentPos, jointPos]);
                        }} />
                        <lineBasicMaterial attach="material" color="#f59e0b" linewidth={3} depthTest={false} transparent opacity={0.8} />
                      </line>
                    )}
                  </group>
                );
              });
            })()}
          </group>
        )}
        
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
            parentBoneRig={node.parameters.boneRig}
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
