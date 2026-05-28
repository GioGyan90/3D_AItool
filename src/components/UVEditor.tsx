import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Download, 
  Upload, 
  Maximize2, 
  RotateCcw, 
  Image as ImageIcon, 
  Grid2X2, 
  Scissors, 
  Grid,
  Sparkles,
  Layers,
  Info,
  HelpCircle
} from 'lucide-react';
import * as THREE from 'three';
import { SceneNode } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Extrude polygon shapes same as Canvas3D
const createPolygonShape = (sides: number, radius: number, innerRadius: number, isStar: boolean) => {
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

interface UVEditorProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function UVEditor({
  nodes,
  selectedIds,
  onUpdateNode,
  isOpen,
  onClose
}: UVEditorProps) {
  const [dimensions, setDimensions] = useState({ width: 780, height: 520 });
  const [panelPosition, setPanelPosition] = useState({ x: 120, y: 120 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [backgroundType, setBackgroundType] = useState<'none' | 'checker' | 'texture'>('checker');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  
  const activeNode = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return nodes.find(n => n.id === selectedIds[0]) || null;
  }, [nodes, selectedIds]);

  // Handle panel dragging
  const handlePanelHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX - panelPosition.x;
    const startY = e.clientY - panelPosition.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setPanelPosition({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY
      });
    };

    const stopDragging = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopDragging);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDragging);
  };

  // Handle resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dimensions.width;
    const startH = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setDimensions({
        width: Math.max(600, startW + (moveEvent.clientX - startX)),
        height: Math.max(400, startH + (moveEvent.clientY - startY))
      });
    };

    const stopResizing = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopResizing);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResizing);
  };

  // Build temporary three.js geometry to extract UV coordinates
  const geometryInfo = useMemo(() => {
    if (!activeNode) return null;
    const { type } = activeNode;
    const parameters = activeNode.parameters || {};
    const thickness = parameters.thickness || 0;
    const bevelRadius = parameters.bevelRadius || 0;
    const bevelSegments = parameters.bevelSegments || 4;
    const bend = parameters.bend || 0;
    const sides = parameters.sides || 5;
    const innerRadius = parameters.innerRadius || 0.5;
    const isStar = parameters.isStar || false;

    let baseGeometry: THREE.BufferGeometry;

    try {
      if (type === 'csg' && activeNode.geometryData) {
        const loader = new THREE.BufferGeometryLoader();
        baseGeometry = loader.parse(activeNode.geometryData);
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
          baseGeometry = new THREE.BoxGeometry(1, 1, 1, bend > 0 ? 32 : 1, 1, 1);
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
            curveSegments: 16
          });
          baseGeometry.center();
        } else {
          baseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, bend > 0 ? 32 : 16);
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
            baseGeometry = new THREE.BufferGeometry();
            return null;
        }
        
        baseGeometry = new THREE.ExtrudeGeometry(shape2D, { 
          depth: Math.max(0.001, depth - (bevelRadius > 0 ? bevelRadius * 2 : 0)), 
          bevelEnabled: bevelRadius > 0, 
          bevelThickness: bevelRadius, 
          bevelSize: bevelRadius, 
          bevelSegments: bevelSegments,
          curveSegments: bend > 0 ? 32 : 12
        });
        baseGeometry.center();
      } else {
        switch (type) {
          case 'sphere': baseGeometry = new THREE.SphereGeometry(parameters.radius || 0.5, 16, 16); break;
          case 'torus': baseGeometry = new THREE.TorusGeometry(parameters.radius || 0.5, parameters.tube || 0.2, 8, 32); break;
          case 'plane': baseGeometry = new THREE.PlaneGeometry(1, 1, 1, 1); break;
          case 'circle': baseGeometry = new THREE.CircleGeometry(0.5, 16); break;
          case 'rect': baseGeometry = new THREE.PlaneGeometry(1, 1, 1, 1); break;
          case 'triangle': baseGeometry = new THREE.CircleGeometry(0.5, 3); break;
          case 'polygon': 
            const polygonShape = createPolygonShape(sides, 0.5, innerRadius, isStar);
            baseGeometry = new THREE.ShapeGeometry(polygonShape, 16); 
            break;
          default:
            // Custom models or groups or lights
            return null;
        }
      }

      // Read custom UVs from parameters if defined, otherwise use standard UV attribute
      const count = baseGeometry.getAttribute('position').count;
      let uvArray = new Float32Array(count * 2);

      if (activeNode.parameters?.customUVs) {
        // Read custom stored UV from parameters
        const stored = activeNode.parameters.customUVs;
        for (let i = 0; i < Math.min(count * 2, stored.length); i++) {
          uvArray[i] = stored[i];
        }
        baseGeometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
      } else {
        const stdUvs = baseGeometry.getAttribute('uv') as THREE.BufferAttribute;
        if (stdUvs) {
          uvArray = stdUvs.array as Float32Array;
        } else {
          // Fallback planar
          const pos = baseGeometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < count; i++) {
            uvArray[i * 2] = pos.getX(i) + 0.5;
            uvArray[i * 2 + 1] = pos.getY(i) + 0.5;
          }
          baseGeometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
        }
      }

      const indexAttr = baseGeometry.getIndex();
      const faceIndices: number[] = [];
      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i++) {
          faceIndices.push(indexAttr.getX(i));
        }
      } else {
        for (let i = 0; i < count; i++) {
          faceIndices.push(i);
        }
      }

      const info = {
        geometry: baseGeometry,
        uvs: Array.from(baseGeometry.getAttribute('uv').array) as number[],
        positions: Array.from(baseGeometry.getAttribute('position').array) as number[],
        normals: baseGeometry.getAttribute('normal') ? Array.from(baseGeometry.getAttribute('normal').array) as number[] : null,
        faceIndices,
        verticesCount: count,
        trianglesCount: faceIndices.length / 3
      };

      return info;
    } catch (e) {
      console.error('UV extraction error:', e);
      return null;
    }
  }, [activeNode]);

  // Handle Unwrapping Algorithms (from Blender mechanics)
  const handleUnwrap = (method: 'reset' | 'planarX' | 'planarY' | 'planarZ' | 'cube' | 'spherical' | 'cylindrical' | 'smart') => {
    if (!activeNode || !geometryInfo) return;
    const { geometry } = geometryInfo;
    
    if (method === 'reset') {
      // Clear custom UV and reset back to standard
      onUpdateNode(activeNode.id, {
        parameters: {
          ...activeNode.parameters,
          customUVs: undefined
        }
      });
      return;
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;
    const count = posAttr.count;
    const newUvs = new Float32Array(count * 2);

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const min = bbox.min;

    if (method === 'planarY') { // Top projection
      const w = size.x || 1;
      const d = size.z || 1;
      for (let i = 0; i < count; i++) {
        newUvs[i * 2] = (posAttr.getX(i) - min.x) / w;
        newUvs[i * 2 + 1] = (posAttr.getZ(i) - min.z) / d;
      }
    } else if (method === 'planarZ') { // Front projection
      const w = size.x || 1;
      const h = size.y || 1;
      for (let i = 0; i < count; i++) {
        newUvs[i * 2] = (posAttr.getX(i) - min.x) / w;
        newUvs[i * 2 + 1] = (posAttr.getY(i) - min.y) / h;
      }
    } else if (method === 'planarX') { // Side projection
      const d = size.z || 1;
      const h = size.y || 1;
      for (let i = 0; i < count; i++) {
        newUvs[i * 2] = (posAttr.getZ(i) - min.z) / d;
        newUvs[i * 2 + 1] = (posAttr.getY(i) - min.y) / h;
      }
    } else if (method === 'cube') {
      let normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
      if (!normalAttr) {
        geometry.computeVertexNormals();
        normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
      }
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const nx = Math.abs(normalAttr ? normalAttr.getX(i) : 0);
        const ny = Math.abs(normalAttr ? normalAttr.getY(i) : 1);
        const nz = Math.abs(normalAttr ? normalAttr.getZ(i) : 0);

        if (nx >= ny && nx >= nz) {
          // project on X
          newUvs[i * 2] = (z - min.z) / (size.z || 1);
          newUvs[i * 2 + 1] = (y - min.y) / (size.y || 1);
        } else if (ny >= nx && ny >= nz) {
          // project on Y
          newUvs[i * 2] = (x - min.x) / (size.x || 1);
          newUvs[i * 2 + 1] = (z - min.z) / (size.z || 1);
        } else {
          // project on Z
          newUvs[i * 2] = (x - min.x) / (size.x || 1);
          newUvs[i * 2 + 1] = (y - min.y) / (size.y || 1);
        }
      }
    } else if (method === 'spherical') {
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      for (let i = 0; i < count; i++) {
        const dx = posAttr.getX(i) - center.x;
        const dy = posAttr.getY(i) - center.y;
        const dz = posAttr.getZ(i) - center.z;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

        const phi = Math.atan2(dz, dx);
        newUvs[i * 2] = (phi + Math.PI) / (Math.PI * 2);

        const theta = Math.acos(dy / r);
        newUvs[i * 2 + 1] = theta / Math.PI;
      }
    } else if (method === 'cylindrical') {
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      for (let i = 0; i < count; i++) {
        const dx = posAttr.getX(i) - center.x;
        const dy = posAttr.getY(i) - center.y;
        const dz = posAttr.getZ(i) - center.z;

        const phi = Math.atan2(dz, dx);
        newUvs[i * 2] = (phi + Math.PI) / (Math.PI * 2);
        newUvs[i * 2 + 1] = (dy - min.y) / (size.y || 1);
      }
    } else if (method === 'smart') {
      // Smart algorithm: Lay out faces sequentially inside a modular grid
      const indexAttr = geometry.getIndex();
      const numTriangles = indexAttr ? indexAttr.count / 3 : count / 3;
      const numCells = Math.ceil(Math.sqrt(numTriangles));
      const cellSize = 1 / numCells;

      for (let t = 0; t < numTriangles; t++) {
        const col = t % numCells;
        const row = Math.floor(t / numCells);

        const uMin = col * cellSize + cellSize * 0.05;
        const uMax = (col + 1) * cellSize - cellSize * 0.05;
        const vMin = row * cellSize + cellSize * 0.05;
        const vMax = (row + 1) * cellSize - cellSize * 0.05;

        // Map the three vertices of each triangle k
        if (indexAttr) {
          const v0 = indexAttr.getX(t * 3);
          const v1 = indexAttr.getX(t * 3 + 1);
          const v2 = indexAttr.getX(t * 3 + 2);

          newUvs[v0 * 2] = uMin;
          newUvs[v0 * 2 + 1] = vMin;

          newUvs[v1 * 2] = uMax;
          newUvs[v1 * 2 + 1] = vMin;

          newUvs[v2 * 2] = (uMin + uMax) / 2;
          newUvs[v2 * 2 + 1] = vMax;
        } else {
          newUvs[(t * 3) * 2] = uMin;
          newUvs[(t * 3) * 2 + 1] = vMin;

          newUvs[(t * 3 + 1) * 2] = uMax;
          newUvs[(t * 3 + 1) * 2 + 1] = vMin;

          newUvs[(t * 3 + 2) * 2] = (uMin + uMax) / 2;
          newUvs[(t * 3 + 2) * 2 + 1] = vMax;
        }
      }
    }

    // Clamp values to [0, 1] range safely
    for (let i = 0; i < newUvs.length; i++) {
      if (isNaN(newUvs[i])) newUvs[i] = 0;
      newUvs[i] = Math.max(0, Math.min(1, newUvs[i]));
    }

    // Update node parameter state
    onUpdateNode(activeNode.id, {
      parameters: {
        ...activeNode.parameters,
        customUVs: Array.from(newUvs)
      }
    });
  };

  // Canvas Interactions: pan and zoom
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 1) { // Left or middle click for panning
      draggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy
      });
    }
  };

  const handleCanvasMouseUp = () => {
    draggingRef.current = false;
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(15, zoom * zoomFactor);
    } else {
      newZoom = Math.max(0.4, zoom / zoomFactor);
    }
    setZoom(newZoom);
  };

  const resetZoomPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Load and cache current texture image if backgroundType is 'texture'
  const [textureImage, setTextureImage] = useState<HTMLImageElement | null>(null);
  const textureUrl = useMemo(() => {
    if (customBgUrl) return customBgUrl;
    if (activeNode?.material?.map) return activeNode.material.map;
    return null;
  }, [activeNode, customBgUrl]);

  useEffect(() => {
    if (!textureUrl) {
      setTextureImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setTextureImage(img);
    };
    img.onerror = () => {
      console.warn("Failed to load UV background texture");
      setTextureImage(null);
    };
    img.src = textureUrl;
  }, [textureUrl]);

  // Handle Export SVG (Blender's "Export UV Layout")
  const exportSVG = () => {
    if (!geometryInfo || !activeNode) return;
    const { uvs, faceIndices } = geometryInfo;
    
    let svgLines: string[] = [];
    svgLines.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" style="background-color: #121212;">');
    
    const size = 1024;
    for (let i = 0; i < faceIndices.length; i += 3) {
      const idx0 = faceIndices[i];
      const idx1 = faceIndices[i + 1];
      const idx2 = faceIndices[i + 2];

      const u0 = uvs[idx0 * 2];
      const v0 = uvs[idx0 * 2 + 1];
      const u1 = uvs[idx1 * 2];
      const v1 = uvs[idx1 * 2 + 1];
      const u2 = uvs[idx2 * 2];
      const v2 = uvs[idx2 * 2 + 1];

      // In SVG y goes down, UV v goes up
      const x0 = (u0 * size).toFixed(1);
      const y0 = ((1 - v0) * size).toFixed(1);
      const x1 = (u1 * size).toFixed(1);
      const y1 = ((1 - v1) * size).toFixed(1);
      const x2 = (u2 * size).toFixed(1);
      const y2 = ((1 - v2) * size).toFixed(1);

      svgLines.push(`  <polygon points="${x0},${y0} ${x1},${y1} ${x2},${y2}" fill="none" stroke="#6366f1" stroke-width="0.7" opacity="0.8" />`);
    }

    svgLines.push('</svg>');
    const fileContent = svgLines.join('\n');
    const blob = new Blob([fileContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNode.name || 'mesh'}_uv_layout.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle Export JSON
  const exportJSON = () => {
    if (!geometryInfo || !activeNode) return;
    const data = {
      modelId: activeNode.id,
      modelName: activeNode.name,
      uvCoordinatesCount: geometryInfo.uvs.length,
      uvs: geometryInfo.uvs
    };
    const fileContent = JSON.stringify(data, null, 2);
    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNode.name || 'mesh'}_uvs.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle Import JSON
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeNode) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.uvs)) {
          onUpdateNode(activeNode.id, {
            parameters: {
              ...activeNode.parameters,
              customUVs: parsed.uvs
            }
          });
        } else {
          alert('无效的 UV JSON 文件。它必须包含 {"uvs": [u1, v1, u2...]} 格式的数组。');
        }
      } catch (err) {
        alert('读取/解析 JSON 文件失败。');
      }
    };
    reader.readAsText(file);
  };

  // Handle Texture Upload for Backdrop
  const handleTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    setCustomBgUrl(url);
    setBackgroundType('texture');

    // Also apply this texture directly to the active selected model's material
    if (activeNode) {
      onUpdateNode(activeNode.id, {
        material: {
          ...activeNode.material,
          map: url
        }
      });
    }
  };

  // Draw UV Grid and Triangles on the 2D Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply pan and zoom
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Grid size determines standard 0-1 coordinate viewport bounds
    // Let's make the 0-1 UV viewport size 340x340, centered in the pan/zoom space
    const uvSize = 340;
    const halfUv = uvSize / 2;

    // DRAW BACKGROUND TEXTURE
    if (backgroundType === 'checker') {
      // Draw UV checkerboard patterns
      const numTiles = 8;
      const tileSize = uvSize / numTiles;
      for (let r = 0; r < numTiles; r++) {
        for (let c = 0; c < numTiles; c++) {
          const isEven = (r + c) % 2 === 0;
          ctx.fillStyle = isEven ? '#1c1c1c' : '#262626';
          ctx.fillRect(-halfUv + c * tileSize, -halfUv + r * tileSize, tileSize, tileSize);
          
          // Draw helper text (like A1, B2... resembling Blender texture)
          ctx.fillStyle = isEven ? '#333333' : '#444444';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(`${String.fromCharCode(65 + c)}${r + 1}`, -halfUv + c * tileSize + 4, -halfUv + r * tileSize + 10);
        }
      }
    } else if (backgroundType === 'texture' && textureImage) {
      // Draw loaded actual texture map or uploaded backdrop
      ctx.drawImage(textureImage, -halfUv, -halfUv, uvSize, uvSize);
    } else {
      // Background none: dark panel
      ctx.fillStyle = '#101010';
      ctx.fillRect(-halfUv, -halfUv, uvSize, uvSize);
    }

    // DRAW VIEWPORT BORDER
    ctx.strokeStyle = '#4e4e4e';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(-halfUv, -halfUv, uvSize, uvSize);

    // DRAW COORDINATES GRID
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5 / zoom;
    // vertical grid lines (every 0.25)
    for (let i = 0.25; i < 1.0; i += 0.25) {
      ctx.beginPath();
      ctx.moveTo(-halfUv + i * uvSize, -halfUv);
      ctx.lineTo(-halfUv + i * uvSize, halfUv);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-halfUv, -halfUv + i * uvSize);
      ctx.lineTo(halfUv, -halfUv + i * uvSize);
      ctx.stroke();
    }

    // DRAW UV TRIANGLES WIREFRAME
    if (geometryInfo) {
      const { uvs, faceIndices } = geometryInfo;
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'; // Indigo-500 line
      ctx.fillStyle = 'rgba(99, 102, 241, 0.05)'; // Micro translucent fill
      ctx.lineWidth = 0.8 / zoom;

      for (let i = 0; i < faceIndices.length; i += 3) {
        const id0 = faceIndices[i];
        const id1 = faceIndices[i + 1];
        const id2 = faceIndices[i + 2];

        // uvs are relative from 0 to 1
        // In canvas coordinate, top-left is minimum, UV V goes up, so we do 1 - v
        const x0 = -halfUv + uvs[id0 * 2] * uvSize;
        const y0 = halfUv - uvs[id0 * 2 + 1] * uvSize;
        const x1 = -halfUv + uvs[id1 * 2] * uvSize;
        const y1 = halfUv - uvs[id1 * 2 + 1] * uvSize;
        const x2 = -halfUv + uvs[id2 * 2] * uvSize;
        const y2 = halfUv - uvs[id2 * 2 + 1] * uvSize;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // DRAW VERY FINE VERTEX POINT ACCENTS in Blender orange
        ctx.fillStyle = '#f59e0b'; // Amber points
        const rPt = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(x0, y0, rPt, 0, Math.PI * 2);
        ctx.arc(x1, y1, rPt, 0, Math.PI * 2);
        ctx.arc(x2, y2, rPt, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // DRAW AXES LABEL
    ctx.restore();

    // Draw UV screen text info directly
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = '10px sans-serif';
    ctx.fillText('U Axis ────>', canvas.width - 100, canvas.height - 25);
    ctx.fillText('V Axis ▲', canvas.width - 100, canvas.height - 40);

  }, [geometryInfo, zoom, pan, backgroundType, textureImage, dimensions]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="uv-editor-panel"
            className="fixed pointer-events-auto flex flex-col bg-[#161616] border border-[#2c2c2c] rounded-2xl shadow-2xl overflow-hidden text-neutral-200 select-none"
            style={{ 
              width: dimensions.width, 
              height: dimensions.height,
              left: panelPosition.x,
              top: panelPosition.y
            }}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header with drag handles */}
            <div 
              onMouseDown={handlePanelHeaderMouseDown}
              className="flex items-center justify-between px-5 py-3.5 bg-[#1d1d1d] border-b border-[#2c2c2c] cursor-move flex-none"
            >
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-indigo-400" />
                <span className="font-bold tracking-tight text-xs uppercase text-white">
                  UV Unwrapping Tool • UV展开编辑器
                </span>
                {activeNode && (
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-300 font-bold border border-indigo-500/20 px-2 py-0.5 rounded ml-2">
                    {activeNode.name} ({activeNode.type})
                  </span>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-7 h-7 hover:bg-white/5 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Layout Workspace */}
            <div className="flex-1 flex overflow-hidden min-h-0 bg-[#121212]">
              {/* Left Side: 2D UV Viewport */}
              <div className="flex-1 relative flex flex-col min-w-0 border-r border-[#262626]">
                {/* Visualizer Canvas */}
                <div className="flex-1 p-4 flex items-center justify-center relative bg-black/40 min-h-0 overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={480}
                    height={480}
                    className="max-w-full max-h-full aspect-square bg-[#101010] border border-[#2a2a2a] rounded cursor-grab active:cursor-grabbing shadow-inner"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    onWheel={handleCanvasWheel}
                  />

                  {/* Canvas HUD Overlay */}
                  <div className="absolute top-6 left-6 flex items-center gap-1 bg-[#1c1c1cb8] backdrop-blur border border-white/5 rounded-lg px-2.5 py-1.5 shadow">
                    <button
                      onClick={resetZoomPan}
                      className="p-1 text-neutral-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer"
                      title="重置视图"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-neutral-400 font-mono ml-1.5">
                      Zoom: {(zoom * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Backdrop Selector Controls */}
                  <div className="absolute top-6 right-6 flex bg-[#1a1a1ae1] border border-white/5 p-1 rounded-lg shadow-lg gap-0.5">
                    <button
                      onClick={() => setBackgroundType('none')}
                      className={cn(
                        "text-[9px] px-2 py-1 font-bold rounded-md transition-all cursor-pointer",
                        backgroundType === 'none'
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-neutral-300"
                      )}
                    >
                      None
                    </button>
                    <button
                      onClick={() => setBackgroundType('checker')}
                      className={cn(
                        "text-[9px] px-2 py-1 font-bold rounded-md transition-all cursor-pointer",
                        backgroundType === 'checker'
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-neutral-300"
                      )}
                    >
                      Checker
                    </button>
                    <button
                      disabled={!textureUrl}
                      onClick={() => setBackgroundType('texture')}
                      className={cn(
                        "text-[9px] px-2 py-1 font-bold rounded-md transition-all cursor-pointer",
                        backgroundType === 'texture'
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      )}
                    >
                      Checkerboard / Texture
                    </button>
                  </div>
                </div>

                {/* HUD Footer Status */}
                <div className="h-9 border-t border-[#262626] flex items-center justify-between px-4 text-[10px] text-neutral-400 bg-[#161616] flex-none italic font-mono">
                  {geometryInfo ? (
                    <>
                      <span>Vertices (点数): {geometryInfo.verticesCount}</span>
                      <span>Triangles (面数): {geometryInfo.trianglesCount}</span>
                      <span>UV space coordinates range [0, 1]</span>
                    </>
                  ) : (
                    <span>No unwrap geometry bound</span>
                  )}
                </div>
              </div>

              {/* Right Side: Blender-like Controls Box */}
              <div className="w-[280px] bg-[#1d1d1d] p-5 overflow-y-auto flex flex-col gap-6 flex-none select-none">
                {!activeNode ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <Info className="w-8 h-8 text-neutral-500 mb-2" />
                    <p className="text-[11px] text-neutral-400">
                      请先在场景中选择一个 3D 模型物体。
                    </p>
                    <p className="text-[10px] text-neutral-600 mt-2">
                      只能为具体几何体或模型执行 UV 展开。
                    </p>
                  </div>
                ) : (
                  <>
                    {/* section: Unwrap Methods */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 border-b border-[#2e2e2e] pb-1.5">
                        <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-200">
                          UV Unwrapping (展开操作)
                        </h4>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUnwrap('cube')}
                          className="h-8 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[10px] font-semibold text-neutral-300 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Grid className="w-3 h-3 text-indigo-400" /> Cube Project
                        </button>
                        <button
                          onClick={() => handleUnwrap('smart')}
                          className="h-8 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[10px] font-semibold text-neutral-300 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Grid2X2 className="w-3 h-3 text-indigo-400" /> Smart Grid
                        </button>
                      </div>

                      <div className="space-y-2 pt-1">
                        <span className="text-[9px] text-neutral-500 uppercase font-black tracking-wider">Planar Projections (平面投影)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleUnwrap('planarY')}
                            className="py-1.5 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[9px] text-neutral-300 transition-all cursor-pointer text-center"
                          >
                            Top (Y)
                          </button>
                          <button
                            onClick={() => handleUnwrap('planarZ')}
                            className="py-1.5 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[9px] text-neutral-300 transition-all cursor-pointer text-center"
                          >
                            Front (Z)
                          </button>
                          <button
                            onClick={() => handleUnwrap('planarX')}
                            className="py-1.5 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[9px] text-neutral-300 transition-all cursor-pointer text-center"
                          >
                            Side (X)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => handleUnwrap('spherical')}
                          className="h-8 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[9px] text-neutral-300 transition-all cursor-pointer text-center"
                        >
                          Spherical (球体)
                        </button>
                        <button
                          onClick={() => handleUnwrap('cylindrical')}
                          className="h-8 bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] rounded text-[9px] text-neutral-300 transition-all cursor-pointer text-center"
                        >
                          Cylindrical (柱体)
                        </button>
                      </div>

                      <button
                        onClick={() => handleUnwrap('reset')}
                        className="w-full h-8 bg-[#1c1212] hover:bg-[#2c1a1a] border border-[#3c1e1e] rounded text-[10px] font-semibold text-rose-300 hover:text-rose-100 transition-all flex items-center justify-center gap-1.5 mt-2 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 text-rose-400" />
                        Reset UV coordinates (重置UV)
                      </button>
                    </div>

                    {/* section: Backdrop Map / Backdrop Texture */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 border-b border-[#2e2e2e] pb-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-200">
                          Backdrop Texture (背景贴图)
                        </h4>
                      </div>

                      <div className="space-y-2">
                        <label className="w-full inline-flex items-center justify-center bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] text-[10px] h-8 font-semibold cursor-pointer text-neutral-300 transition-colors gap-2 rounded">
                          <Upload className="w-3 h-3" />
                          Upload Textures (导入自定义贴图)
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleTextureUpload}
                          />
                        </label>
                        <p className="text-[9px] text-neutral-500 leading-normal">
                          您也可以直接将贴图设置至该物体的 Material (材质) parameters 中，UV 背景会自动同步。
                        </p>
                      </div>
                    </div>

                    {/* section: Import/Export UV layout */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 border-b border-[#2e2e2e] pb-1.5">
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-200">
                          Import / Export Format
                        </h4>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={exportSVG}
                          className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[10px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          Export SVG Wireframe (导出 SVG 布局)
                        </button>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={exportJSON}
                            className="bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] h-8 rounded text-[9px] text-neutral-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Download className="w-2.5 h-2.5" /> Export JSON
                          </button>
                          
                          <label className="bg-[#121212] hover:bg-[#262626] border border-[#2c2c2c] h-8 text-[9px] font-bold cursor-pointer rounded flex items-center justify-center gap-1 text-neutral-300 transition-colors">
                            <Upload className="w-2.5 h-2.5" /> Import JSON
                            <input
                              type="file"
                              accept=".json"
                              className="hidden"
                              onChange={handleJsonUpload}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Blender reference note */}
                    <div className="bg-[#121212] p-3 rounded-lg border border-[#262626] mt-auto">
                      <div className="flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                        <p className="text-[9px] text-neutral-500 leading-normal">
                          <strong>Blender 展开建议：</strong>
                          <br />
                          1. 投影法简单快速，极适合立方体和规整柱状体。
                          <br />
                          2. Smart Grid 在贴图上均匀排布面片，防止贴图重叠拉伸。
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Drag Resize Bottom Handle */}
            <div 
              className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-0.5 hover:bg-white/5 transition-colors group flex-none"
              onMouseDown={handleResizeMouseDown}
            >
              <div className="w-2 h-2 border-r border-b border-white/20 group-hover:border-white/40" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
