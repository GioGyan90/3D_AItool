import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Environment, ContactShadows, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three-stdlib';
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
}

const Model = ({ url, color }: { url: string; color: string }) => {
  const { scene } = useGLTF(url);
  // Clone the scene to avoid issues with multiple instances
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Create a new material to avoid affecting other instances if they share materials
        child.material = child.material.clone();
        child.material.color.set(color);
      }
    });
    return clone;
  }, [scene, color]);
  
  return <primitive object={clonedScene} />;
};

const SVGNode = ({ url, color, thickness }: { url: string; color: string; thickness: number }) => {
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
        if (points.length > 0) {
          points.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, p.y, 0)));
        }
        
        shape.holes.forEach(hole => {
          const holePoints = hole.getPoints();
          if (holePoints.length > 0) {
            holePoints.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, p.y, 0)));
          }
        });
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
          <meshStandardMaterial 
            color={isDefaultColor ? item.color : color} 
            side={thickness > 0 ? THREE.FrontSide : THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

const PointLightNode = ({ node, isSelected }: { node: SceneNode; isSelected: boolean }) => {
  const { intensity = 1, decay = 2, distance = 10 } = node.parameters;
  
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

const Material = ({ node }: { node: SceneNode }) => {
  const texture = node.material?.map ? useTexture(node.material.map) : null;
  
  return (
    <meshStandardMaterial 
      color={node.color} 
      metalness={node.material?.metalness ?? 0}
      roughness={node.material?.roughness ?? 0.5}
      map={texture}
    />
  );
};

const Node = ({ 
  node, 
  allNodes,
  selectedIds, 
  onSelect, 
  onUpdateNode,
  orbitControlsRef
}: { 
  node: SceneNode; 
  allNodes: SceneNode[];
  selectedIds: string[]; 
  onSelect: (ids: string[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  orbitControlsRef?: React.MutableRefObject<any>;
}) => {
  const [mesh, setMesh] = React.useState<THREE.Group | null>(null);
  const isSelected = selectedIds.includes(node.id);
  const isPrimarySelection = selectedIds[selectedIds.length - 1] === node.id;
  const children = useMemo(() => allNodes.filter(n => n.parentId === node.id), [allNodes, node.id]);
  const initialPositions = useRef<{[key: string]: THREE.Vector3}>({});

  const geometry = useMemo(() => {
    const { type, parameters } = node;
    const thickness = parameters.thickness || 0;
    const bevelRadius = parameters.bevelRadius || 0;
    const bevelSegments = parameters.bevelSegments || 4;
    const bend = parameters.bend || 0;

    const createRoundedRect = (w: number, h: number, r: number) => {
      const shape = new THREE.Shape();
      const x = -w / 2;
      const y = -h / 2;
      const radius = Math.min(r, w / 2, h / 2);

      if (radius === 0) {
        shape.moveTo(x, y);
        shape.lineTo(x + w, y);
        shape.lineTo(x + w, y + h);
        shape.lineTo(x, y + h);
        shape.lineTo(x, y);
      } else {
        shape.moveTo(x + radius, y);
        shape.lineTo(x + w - radius, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + radius);
        shape.lineTo(x + w, y + h - radius);
        shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        shape.lineTo(x + radius, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
      }
      return shape;
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
        const r = bevelRadius;
        const shape = createRoundedRect(1 - r * 2, 1 - r * 2, r);
        baseGeometry = new THREE.ExtrudeGeometry(shape, { 
          depth: 1 - r * 2, 
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
        default: return new THREE.BufferGeometry();
      }
    }

    if (bend > 0) {
      applyBend(baseGeometry, bend);
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

  if (!node.visible) return null;

  return (
    <>
      <group
        ref={setMesh}
        position={node.position}
        rotation={node.rotation}
        scale={node.scale}
        onClick={(e) => {
          e.stopPropagation();
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
          <Model url={node.url} color={node.color} />
        ) : node.type === 'svg' && node.url ? (
          <SVGNode url={node.url} color={node.color} thickness={node.parameters.thickness || 0.1} />
        ) : node.type === 'pointLight' ? (
          <PointLightNode node={node} isSelected={isSelected} />
        ) : node.type !== 'group' ? (
          <mesh geometry={geometry} name={node.id}>
            {node.type === 'csg' && geometry.groups && geometry.groups.length > 0 ? (
              geometry.groups.map((_, index) => (
                <Material key={index} node={node} />
              ))
            ) : (
              <Material node={node} />
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
          />
        ))}
      </group>
      
      {isPrimarySelection && mesh && !node.locked && (
        <TransformControls
          object={mesh}
          mode="translate"
          onMouseDown={() => {
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = false;
            
            // Store initial positions of all selected objects for delta calculation
            initialPositions.current = {};
            selectedIds.forEach(id => {
              const targetNode = allNodes.find(n => n.id === id);
              if (targetNode) {
                initialPositions.current[id] = new THREE.Vector3(...targetNode.position);
              }
            });
          }}
          onObjectChange={() => {
            if (selectedIds.length > 1 && mesh) {
              const delta = new THREE.Vector3().copy(mesh.position).sub(initialPositions.current[node.id] || mesh.position);
              
              // Move other selected objects visually (real-time feedback)
              selectedIds.forEach(id => {
                if (id === node.id) return;
                const otherMesh = mesh.parent?.getObjectByName(id);
                const initialPos = initialPositions.current[id];
                if (otherMesh && initialPos) {
                  otherMesh.position.copy(initialPos).add(delta);
                }
              });
            }
          }}
          onMouseUp={() => {
            if (orbitControlsRef?.current) orbitControlsRef.current.enabled = true;
            if (mesh) {
              const delta = new THREE.Vector3().copy(mesh.position).sub(initialPositions.current[node.id] || mesh.position);
              
              // Apply updates to all selected nodes
              selectedIds.forEach(id => {
                const targetNode = allNodes.find(n => n.id === id);
                if (targetNode) {
                  const initialPos = initialPositions.current[id] || new THREE.Vector3(...targetNode.position);
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
  showGrid = true
}) => {
  const rootNodes = useMemo(() => nodes.filter(n => !n.parentId), [nodes]);

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
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <pointLight position={[10, 10, 10]} intensity={0.8} castShadow />
          <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={0.8} castShadow />
          
          <Grid 
            infiniteGrid 
            fadeDistance={30} 
            fadeStrength={5} 
            sectionSize={1} 
            sectionColor="#2e2e2e" 
            cellColor="#1a1a1a" 
            visible={showGrid}
          />
          
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
              />
            ))}
          </group>

          <OrbitControls 
            ref={orbitControlsRef}
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 1.75} 
          />
          <Environment preset="city" />
          <ContactShadows position={[0, -0.01, 0]} opacity={0.3} scale={20} blur={2.5} far={4.5} />
        </Suspense>
      </Canvas>
    </div>
  );
};
