import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Canvas3D } from './components/Canvas3D';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LayersPanel } from './components/LayersPanel';
import { AIChat } from './components/AIChat';
import { SceneNode, NodeType } from './types';
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
  BoxSelect,
  Loader2
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

export default function App() {
  const [nodes, setNodes] = useState<SceneNode[]>(INITIAL_NODES);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
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

  const handleExportGLB = useCallback(() => {
    if (!sceneRef.current) return;
    
    const exporter = new GLTFExporter();
    exporter.parse(
      sceneRef.current,
      (result) => {
        const output = result instanceof ArrayBuffer ? result : JSON.stringify(result, null, 2);
        const blob = new Blob([output], { type: result instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'scene.glb';
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error('An error happened during export', error);
      },
      { binary: true }
    );
  }, []);

  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene.png';
    link.click();
  }, []);

  const handleExportSVG = useCallback(async () => {
    if (!sceneRef.current || !orbitControlsRef.current) return;
    
    const { SVGRenderer } = await import('three-stdlib');
    const renderer = new SVGRenderer();
    
    const canvas = document.querySelector('canvas');
    const width = canvas?.clientWidth || window.innerWidth;
    const height = canvas?.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    
    // 1. Create a temporary scene
    const tempScene = new THREE.Scene();
    // SVGRenderer doesn't support scene.background directly in the output file, 
    // we'll handle background manually if needed or let it be transparent.
    
    // 2. Enhanced Lighting for better vector shading
    // Ambient light for base color
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    tempScene.add(ambientLight);
    
    // Directional light is best for SVGRenderer to calculate face normals
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7);
    tempScene.add(dirLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-10, 5, -10);
    tempScene.add(pointLight);

    // 3. Add a vector GridHelper
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x222222);
      tempScene.add(gridHelper);
    }
    
    // 4. Clone and prepare nodes
    const clone = sceneRef.current.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const oldMat = child.material as THREE.MeshStandardMaterial;
        // MeshPhongMaterial provides better highlights in SVGRenderer
        child.material = new THREE.MeshPhongMaterial({
          color: oldMat.color,
          opacity: oldMat.opacity,
          transparent: oldMat.transparent,
          side: THREE.DoubleSide,
          shininess: 30,
          specular: new THREE.Color(0x222222)
        });
        // Ensure geometry has normals for shading
        child.geometry.computeVertexNormals();
      }
    });
    tempScene.add(clone);
    
    // 5. Use the current camera
    const currentCamera = orbitControlsRef.current.object;
    
    // 6. Render
    renderer.render(tempScene, currentCamera);
    
    // 7. Post-process SVG to add a background rect (optional but helps visibility)
    let svgString = renderer.domElement.outerHTML;
    const bgRect = `<rect width="100%" height="100%" fill="#0e0e0e"/>`;
    svgString = svgString.replace(/<svg([^>]*)>/, `<svg$1>${bgRect}`);
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene.svg';
    link.click();
    URL.revokeObjectURL(url);
  }, [showGrid]);

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
      resultGeometry.boundingBox?.getCenter(center);
      resultGeometry.translate(-center.x, -center.y, -center.z);
      
      // 4. Create a new node for the result
      const newId = crypto.randomUUID();
      const newNode: SceneNode = {
        id: newId,
        name: `Boolean ${operationType.toUpperCase()}`,
        type: 'csg',
        parentId: null,
        position: [center.x, center.y, center.z], // Set node position to the geometry center
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

    const url = URL.createObjectURL(file);
    const newId = crypto.randomUUID();
    const isSvg = file.name.toLowerCase().endsWith('.svg');

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
      position: properties?.position || [0, 0.5, 0],
      rotation: properties?.rotation || [0, 0, 0],
      scale: properties?.scale || [1, 1, 1],
      color: properties?.color || (type === 'pointLight' ? '#ffffff' : '#4a90e2'),
      parameters: type === 'extruded' ? { thickness: 0.2 } : 
                  type === 'pointLight' ? { intensity: 1, decay: 2, distance: 10 } : {},
      visible: true,
      ...properties
    };
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setSelectedIds([newId]);
    pushHistory(nextNodes, [newId]);
  }, [nodes, pushHistory]);

  const handleUpdateNode = useCallback((id: string, updates: Partial<SceneNode>) => {
    const nextNodes = nodes.map(n => {
      if (n.id === id) {
        // Allow updating the 'locked' property itself, but block others if locked
        if (n.locked && Object.keys(updates).some(k => k !== 'locked' && k !== 'visible')) {
          return n;
        }
        const updated = { ...n, ...updates };
        if (updates.parameters) {
          updated.parameters = { ...n.parameters, ...updates.parameters };
        }
        return updated;
      }
      return n;
    });
    setNodes(nextNodes);
    pushHistory(nextNodes, selectedIds);
  }, [nodes, selectedIds, pushHistory]);

  const handleDeleteNode = useCallback((id: string) => {
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

  const setMaterialPreset = (preset: 'metal' | 'plastic' | 'matte' | 'glass') => {
    if (!selectedNode) return;
    
    let material = {};
    switch (preset) {
      case 'metal':
        material = { metalness: 0.9, roughness: 0.1 };
        break;
      case 'plastic':
        material = { metalness: 0.0, roughness: 0.2 };
        break;
      case 'matte':
        material = { metalness: 0.0, roughness: 0.8 };
        break;
      case 'glass':
        material = { metalness: 0.2, roughness: 0.0 };
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
        <header className="h-12 bg-[#181818] border-b border-[#2e2e2e] flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-6">
            <div className="font-bold tracking-tighter text-base flex items-center gap-1 text-[#e0e0e0]">
              PRISM<span className="text-[#4a90e2]">3D</span>
            </div>
            
            <div className="h-6 w-px bg-[#2e2e2e]" />
            
            <div className="flex items-center gap-4">
              <Toolbar 
                onAddShape={handleAddNode} 
                onDeleteSelected={handleDeleteSelected}
                onDuplicate={handleDuplicate}
                onUndo={handleUndo}
                onRedo={handleRedo}
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
              <input type="file" accept=".glb,.gltf,.svg" className="hidden" onChange={handleImport} />
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger className="bg-[#4a90e2] hover:bg-[#357abd] text-white px-3 py-1 rounded text-[11px] font-bold tracking-wider transition-colors flex items-center gap-1 outline-none">
                EXPORT
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#181818] border-[#2e2e2e] text-[#e0e0e0] w-32">
                <DropdownMenuItem onClick={handleExportGLB} className="text-xs hover:bg-white/5 cursor-pointer">
                  Export as GLB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPNG} className="text-xs hover:bg-white/5 cursor-pointer">
                  Export as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSVG} className="text-xs hover:bg-white/5 cursor-pointer">
                  Export as SVG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <LayersPanel 
            nodes={nodes}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onUpdateNode={handleUpdateNode}
            onReorder={setNodes}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            onResetCamera={handleResetCamera}
          />

          {/* Main Content: Canvas */}
          <main className="flex-1 relative bg-[#0e0e0e]">
            <Canvas3D 
              nodes={nodes} 
              selectedIds={selectedIds} 
              onSelect={setSelectedIds}
              onUpdateNode={handleUpdateNode}
              sceneRef={sceneRef}
              orbitControlsRef={orbitControlsRef}
              showGrid={showGrid}
            />
            
            {/* Viewport Info */}
            <div className="absolute bottom-5 left-5 bg-black/50 border border-[#2e2e2e] px-3 py-2 rounded-md text-[11px] font-mono text-[#888888] pointer-events-none flex flex-col gap-1">
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

          </main>
          
          <AIChat 
            nodes={nodes}
            selectedIds={selectedIds}
            onAddNode={handleAddNode}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onSelectNodes={setSelectedIds}
            clearScene={clearScene}
          />

          {/* Right Sidebar: Properties */}
          <PropertiesPanel 
            selectedShape={selectedNode} 
            onUpdateShape={handleUpdateNode} 
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
