import React, { useMemo, useState, useRef } from 'react';
import { SceneNode } from '../types';
import { cn } from '@/lib/utils';

const RotationInput = ({ 
  value: radians, 
  onChange,
  disabled
}: { 
  value: number; 
  onChange: (rad: number) => void;
  disabled?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const degrees = useMemo(() => {
    const d = (radians * 180) / Math.PI;
    return Number.isFinite(d) ? d : 0;
  }, [radians]);

  const displayValue = useMemo(() => {
    // Round to 1 decimal for clean display
    const d = Number(degrees.toFixed(1));
    if (!Number.isFinite(d)) return '0°';
    const turns = Math.trunc(d / 360);
    const remainder = Number((d % 360).toFixed(1));
    
    if (Math.abs(d) < 360) return `${d}°`;
    return `${turns}x${remainder >= 0 ? '+' : ''}${remainder}°`;
  }, [degrees]);

  if (isEditing && !disabled) {
    return (
      <input
        autoFocus
        type="number"
        step="1"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            onChange((val * Math.PI) / 180);
          }
          setIsEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        className="bg-[#181818] border border-[#4a90e2] rounded px-1 py-1 text-[11px] font-mono text-white w-full focus:outline-none"
      />
    );
  }

  return (
    <div 
      onClick={() => {
        if (!disabled) {
          setTempValue(degrees.toFixed(1));
          setIsEditing(true);
        }
      }}
      onWheel={(e) => {
        if (disabled) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newDegrees = degrees + delta;
        onChange((newDegrees * Math.PI) / 180);
      }}
      className={`bg-[#181818] border border-[#2e2e2e] rounded px-1 py-1 text-[10px] font-mono w-full truncate ${disabled ? 'text-[#555] cursor-not-allowed' : 'text-[#e0e0e0] cursor-text hover:border-[#444]'}`}
      title={`${degrees.toFixed(2)}°`}
    >
      {displayValue}
    </div>
  );
};
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Zap, Image as ImageIcon, Link, Link2Off, ChevronDown, ChevronRight, ChevronLeft, Lightbulb, Code as CodeIcon, List, Move, Box, Scissors, Loader2, Combine } from 'lucide-react';
import { decomposeNode } from '../services/aiService';

interface PropertiesPanelProps {
  selectedShape: SceneNode | null;
  nodes: SceneNode[];
  onUpdateShape: (id: string, updates: Partial<SceneNode>, skipHistory?: boolean) => void;
  onOpenCodeEditor: () => void;
  onAddNodes?: (nodes: Partial<SceneNode>[]) => void;
  onReplaceNode?: (oldId: string, newNodes: Partial<SceneNode>[]) => void;
  onDeleteNode?: (id: string) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedShape, 
  nodes, 
  onUpdateShape, 
  onOpenCodeEditor,
  onAddNodes,
  onReplaceNode,
  onDeleteNode
}) => {
  const [panelHeight, setPanelHeight] = useState(600);
  const [isSolidifying, setIsSolidifying] = useState(false);
  const isResizing = useRef(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    transform: true,
    geometry: true,
    material: true,
    lighting: true,
    scene: true,
    script: true,
    deform: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Find ambient light for global scene settings
  const ambientLightNode = nodes.find(n => n.type === 'ambientLight');
  
  // If no object is selected, target the ambient light for custom environmental editing
  const effectiveShape = selectedShape || ambientLightNode;
  const isGlobalScene = !selectedShape && !!ambientLightNode;

  const isLocked = effectiveShape?.locked;
  const isLight = effectiveShape?.type === 'pointLight' || effectiveShape?.type === 'ambientLight';
  const isAmbient = effectiveShape?.type === 'ambientLight';

  const handleTextureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked && !isLight) return;
    const file = event.target.files?.[0];
    if (!file || !effectiveShape) return;

    const url = URL.createObjectURL(file);
    onUpdateShape(effectiveShape.id, {
      material: {
        ...effectiveShape.material,
        map: url
      }
    });
  };

  const setMaterialPreset = (preset: 'metal' | 'plastic' | 'matte' | 'glass' | 'frosted') => {
    if (!effectiveShape || (isLocked && !isLight)) return;
    
    let material = {};
    switch (preset) {
      case 'metal':
        material = { metalness: 1.0, roughness: 0.15, transmission: 0, opacity: 1, ior: 1.5, clearcoat: 0, clearcoatRoughness: 0, preset: 'metal' };
        break;
      case 'plastic':
        material = { 
          metalness: 0.0, 
          roughness: 0.15, 
          transmission: 0, 
          opacity: 1, 
          ior: 1.45, 
          clearcoat: 1.0, 
          clearcoatRoughness: 0.02, 
          preset: 'plastic' 
        };
        break;
      case 'matte':
        material = { metalness: 0.0, roughness: 0.8, transmission: 0, opacity: 1, ior: 1.45, clearcoat: 0, clearcoatRoughness: 0, preset: 'matte' };
        break;
      case 'glass':
        material = { 
          metalness: 0.0, 
          roughness: 0.01, 
          transmission: 1.0, 
          opacity: 1, 
          ior: 1.5, 
          thickness: 1.0, 
          attenuationDistance: 2,
          attenuationColor: effectiveShape.color,
          clearcoat: 0,
          preset: 'glass' 
        };
        break;
      case 'frosted':
        material = { 
          metalness: 0.0, 
          roughness: 0.5, 
          transmission: 1.0, 
          opacity: 1, 
          ior: 1.5, 
          thickness: 2.0, 
          attenuationDistance: 1.5,
          attenuationColor: effectiveShape.color,
          clearcoat: 0.1,
          clearcoatRoughness: 0.1,
          preset: 'frosted' 
        };
        break;
    }
    
    onUpdateShape(effectiveShape.id, {
      material: {
        ...effectiveShape.material,
        ...material
      }
    });
  };

  // Helper to ensure a value is a valid number
  const ensureNumber = (val: any, fallback: number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const isGlass = 
    effectiveShape?.material?.preset === 'glass' || 
    effectiveShape?.material?.preset === 'frosted' || 
    (ensureNumber(effectiveShape.material?.transmission, 0) > 0) ||
    (ensureNumber(effectiveShape.material?.thickness, 0) > 0);
  
  // Use a ref to track the last value from a slider for commit-to-history
  const lastSliderValueRef = useRef<number | null>(null);

  if (!effectiveShape) {
    return (
      <div className="w-[280px] h-full bg-[#1c1c1c] border-l border-[#2e2e2e] flex items-center justify-center p-6 text-center">
        <p className="text-[#888888] text-xs uppercase tracking-widest leading-relaxed">Select an object to edit its properties</p>
      </div>
    );
  }

  // Helper to ensure a value is a valid number

  // Helper for slider updates
  const handleSliderChange = (val: number | readonly number[], updatePath: 'parameters' | 'material', key: string) => {
    const value = Array.isArray(val) ? val[0] : (val as number);
    if (!Number.isFinite(value)) return;
    
    lastSliderValueRef.current = value;
    
    if (updatePath === 'material') {
      // Special handling for the combined reflectivity slider
      if (key === 'reflectivity') {
        onUpdateShape(effectiveShape.id, {
          material: {
            roughness: 1 - value,
            metalness: value * 0.2,
            preset: 'custom'
          }
        }, true);
      } else {
        onUpdateShape(effectiveShape.id, {
          material: {
            [key]: value,
            preset: 'custom'
          }
        }, true);
      }
    } else {
      onUpdateShape(effectiveShape.id, {
        parameters: {
          [key]: value
        }
      }, true);
    }
  };

  const handleSliderCommit = (val: number | readonly number[], updatePath: 'parameters' | 'material', key: string) => {
    const value = Array.isArray(val) ? val[0] : (val as number);
    if (!Number.isFinite(value)) return;
    
    if (updatePath === 'material') {
      if (key === 'reflectivity') {
        onUpdateShape(effectiveShape.id, {
          material: {
            roughness: 1 - value,
            metalness: value * 0.2,
            preset: 'custom'
          }
        }, false);
      } else {
        onUpdateShape(effectiveShape.id, {
          material: {
            [key]: value,
            preset: 'custom'
          }
        }, false);
      }
    } else {
      onUpdateShape(effectiveShape.id, {
        parameters: {
          [key]: value
        }
      }, false);
    }
    lastSliderValueRef.current = null;
  };

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newHeight = e.clientY - 64; // Adjusted for top nav
    if (newHeight > 200 && newHeight < window.innerHeight - 100) {
      setPanelHeight(newHeight);
    }
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
  };

  const handleSolidify = async () => {
    if (!effectiveShape || isSolidifying || !onAddNodes || !onDeleteNode) return;
    setIsSolidifying(true);
    try {
      const newNodes = await decomposeNode(effectiveShape, 20);
      
      if (!newNodes || newNodes.length === 0) {
        throw new Error("AI was unable to find any primitive shapes in this script. Deconstruction aborted.");
      }

      const offsetNodes = newNodes.map(n => ({
        ...n,
        position: [
          (n.position?.[0] || 0) + effectiveShape.position[0],
          (n.position?.[1] || 0) + effectiveShape.position[1],
          (n.position?.[2] || 0) + effectiveShape.position[2]
        ] as [number, number, number]
      }));
      
      if (onReplaceNode) {
        onReplaceNode(effectiveShape.id, offsetNodes);
      } else {
        onAddNodes(offsetNodes);
        onDeleteNode(effectiveShape.id);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Solidify failed. AI could not deconstruct the script.');
    } finally {
      setIsSolidifying(false);
    }
  };

  return (
    <div 
      className="w-[320px] bg-[#1c1c1c]/90 backdrop-blur-md border border-[#2e2e2e] flex flex-row rounded-xl shadow-2xl overflow-hidden relative"
      style={{ height: `${panelHeight}px` }}
    >
      {/* Left sidebar for quick access/collapsed icons */}
      <div className="w-[42px] bg-[#141414] border-r border-[#2e2e2e] flex flex-col items-center py-4 gap-3 shrink-0 overflow-y-auto scrollbar-none shadow-inner">
        {!isGlobalScene && (
          <>
            {!isAmbient && (
              <button
                onClick={() => toggleSection('transform')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 group relative",
                  expandedSections.transform ? "bg-[#4a90e2]/10 text-[#4a90e2]" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                )}
                title="Transform"
              >
                <Move className="w-4 h-4" />
                {!expandedSections.transform && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#4a90e2] rounded-full border border-[#141414]" />
                )}
              </button>
            )}

            {effectiveShape && ['box', 'extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'svg', 'text'].includes(effectiveShape.type) && (
              <button
                onClick={() => toggleSection('geometry')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 group relative",
                  expandedSections.geometry ? "bg-[#4a90e2]/10 text-[#4a90e2]" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                )}
                title="Geometry"
              >
                <Box className="w-4 h-4" />
                {!expandedSections.geometry && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#4a90e2] rounded-full border border-[#141414]" />
                )}
              </button>
            )}

            {!isLight && (
              <button
                onClick={() => toggleSection('deform')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 group relative",
                  expandedSections.deform ? "bg-orange-500/10 text-orange-400" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                )}
                title="Deform"
              >
                <Combine className="w-4 h-4" />
                {!expandedSections.deform && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-orange-400 rounded-full border border-[#141414]" />
                )}
              </button>
            )}

            {isLight && (
              <button
                onClick={() => toggleSection('lighting')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 group relative",
                  expandedSections.lighting ? "bg-yellow-500/10 text-yellow-500" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                )}
                title="Lighting"
              >
                <Lightbulb className="w-4 h-4" />
                {!expandedSections.lighting && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-yellow-500 rounded-full border border-[#141414]" />
                )}
              </button>
            )}

            {!isLight && (
              <>
                <button
                  onClick={() => toggleSection('material')}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200 group relative",
                    expandedSections.material ? "bg-[#4a90e2]/10 text-[#4a90e2]" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                  )}
                  title="Material"
                >
                  <Zap className="w-4 h-4" />
                  {!expandedSections.material && (
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#4a90e2] rounded-full border border-[#141414]" />
                  )}
                </button>

                <button
                  onClick={() => toggleSection('script')}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200 group relative",
                    expandedSections.script ? "bg-indigo-500/10 text-indigo-400" : "text-[#555] hover:text-[#888] hover:bg-white/5"
                  )}
                  title="Script"
                >
                  <CodeIcon className="w-4 h-4" />
                  {!expandedSections.script && (
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-indigo-500 rounded-full border border-[#141414]" />
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-[#2e2e2e] flex items-center justify-between bg-[#1c1c1c]/50">
          <h2 className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest">
            {isGlobalScene ? 'Scene Environment' : 'Properties'}
          </h2>
        </div>
        
        {!isGlobalScene && (
          <div className="px-4 py-2 border-b border-[#2e2e2e]">
            <input
              type="text"
              value={effectiveShape.name}
              onChange={(e) => onUpdateShape(effectiveShape.id, { name: e.target.value })}
              className="bg-transparent text-[#e0e0e0] text-[12px] w-full focus:outline-none focus:text-white border-b border-transparent focus:border-[#4a90e2] pb-0.5"
              placeholder="Enter name..."
              disabled={isLocked && !isLight}
            />
          </div>
        )}

        <ScrollArea className="flex-1 px-4 py-2">
          <div className="space-y-6 pb-32">
            {/* Transform Group */}
            {!isAmbient && expandedSections.transform && (
              <div className={`border-b border-[#2e2e2e] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
                <div 
                  className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
                >
                  <h3 className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest">Transform</h3>
                  <button onClick={() => toggleSection('transform')}>
                    <ChevronDown className="w-3 h-3 text-[#555555] hover:text-[#888]" />
                  </button>
                </div>
              
              {expandedSections.transform && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[12px] text-[#888888]">Position</span>
                      <div className="grid grid-cols-3 gap-1">
                        {Array.isArray(effectiveShape.position) && effectiveShape.position.map((val, i) => (
                          <input
                            key={i}
                            type="number"
                            step="0.1"
                            value={Number.isFinite(val) ? Number(val.toFixed(2)) : 0}
                            onChange={(e) => {
                              const newPos = [...effectiveShape.position] as [number, number, number];
                              newPos[i] = parseFloat(e.target.value) || 0;
                              onUpdateShape(effectiveShape.id, { position: newPos });
                            }}
                            className="bg-[#181818] border border-[#2e2e2e] rounded px-1.5 py-1 text-[11px] font-mono text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[12px] text-[#888888]">Rotation</span>
                      <div className="grid grid-cols-3 gap-1">
                        {Array.isArray(effectiveShape.rotation) && effectiveShape.rotation.map((val, i) => (
                          <RotationInput
                            key={i}
                            value={val}
                            disabled={isLocked && !isLight}
                            onChange={(newRad) => {
                              const newRot = [...effectiveShape.rotation] as [number, number, number];
                              newRot[i] = newRad;
                              onUpdateShape(effectiveShape.id, { rotation: newRot });
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {effectiveShape.type !== 'pointLight' && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] text-[#888888]">Scale</span>
                          <button 
                            onClick={() => onUpdateShape(effectiveShape.id, { uniformScale: !effectiveShape.uniformScale })}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${effectiveShape.uniformScale ? 'bg-[#4a90e2]/20 text-[#4a90e2]' : 'bg-white/5 text-[#666666] hover:text-[#888888]'}`}
                            title={effectiveShape.uniformScale ? "Unlock Proportions" : "Lock Proportions"}
                          >
                            {effectiveShape.uniformScale ? <Link className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}
                            等比
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {Array.isArray(effectiveShape.scale) && effectiveShape.scale.map((val, i) => (
                            <input
                              key={i}
                              type="number"
                              step="0.1"
                              value={Number.isFinite(val) ? Number(val.toFixed(2)) : 0}
                              onChange={(e) => {
                                const newValue = parseFloat(e.target.value) || 0;
                                let newScale = [...effectiveShape.scale] as [number, number, number];
                                
                                if (effectiveShape.uniformScale) {
                                  newScale = [newValue, newValue, newValue];
                                } else {
                                  newScale[i] = newValue;
                                }
                                
                                onUpdateShape(effectiveShape.id, { scale: newScale });
                              }}
                              className="bg-[#181818] border border-[#2e2e2e] rounded px-1.5 py-1 text-[11px] font-mono text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lighting Group */}
          {isLight && expandedSections.lighting && (
            <div className="border-b border-[#2e2e2e] bg-yellow-400/[0.02]">
              <div 
                className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-2 text-yellow-400/70">
                  <Lightbulb className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">{isAmbient ? 'Natural Light' : 'Light Settings'}</h3>
                </div>
                <button onClick={() => toggleSection('lighting')}>
                  <ChevronDown className="w-3 h-3 text-yellow-500/50 hover:text-yellow-500" />
                </button>
              </div>
              
              {expandedSections.lighting && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Intensity</span>
                    <div className="flex items-center gap-2">
                          <Slider
                          value={[ensureNumber(effectiveShape.parameters?.intensity, 1)]}
                          min={0}
                          max={10}
                          step={0.1}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'intensity')}
                          onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'intensity')}
                          className="flex-1"
                        />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {ensureNumber(effectiveShape.parameters?.intensity, 1).toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {!isAmbient && (
                    <>
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Distance</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[ensureNumber(effectiveShape.parameters?.distance, 10)]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={(val) => handleSliderChange(val, 'parameters', 'distance')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'distance')}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8 text-right">
                            {ensureNumber(effectiveShape.parameters?.distance, 10).toFixed(0)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Decay</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[ensureNumber(effectiveShape.parameters?.decay, 2)]}
                            min={0}
                            max={10}
                            step={0.1}
                            onValueChange={(val) => handleSliderChange(val, 'parameters', 'decay')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'decay')}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8">
                            {ensureNumber(effectiveShape.parameters?.decay, 2).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">{isAmbient ? 'Sky Color' : 'Color'}</span>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-full h-5 rounded border border-[#2e2e2e] cursor-pointer relative overflow-hidden"
                        style={{ backgroundColor: effectiveShape.color }}
                      >
                        <input 
                          type="color" 
                          value={effectiveShape.color}
                          onChange={(e) => onUpdateShape(effectiveShape.id, { color: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#888888] uppercase">{effectiveShape.color}</span>
                    </div>
                  </div>

                  {isAmbient && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#888888]">Env Map (环境贴图)</span>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 hover:bg-white/10"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.hdr,.exr';
                              input.onchange = (e: any) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const url = URL.createObjectURL(file);
                                  onUpdateShape(effectiveShape.id, {
                                    parameters: {
                                      ...effectiveShape.parameters,
                                      environment: url
                                    }
                                  });
                                }
                              };
                              input.click();
                            }}
                          >
                            <ImageIcon className="w-3 h-3 text-[#888888]" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {['city', 'studio', 'apartment', 'lobby', 'night', 'warehouse', 'sunset', 'dawn'].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => onUpdateShape(effectiveShape.id, {
                              parameters: {
                                ...effectiveShape.parameters,
                                environment: preset
                              }
                            })}
                            className={`px-2 py-1.5 rounded text-[10px] border transition-all text-left truncate capitalize ${
                              (effectiveShape.parameters?.environment || 'city') === preset
                                ? 'bg-[#4a90e2]/20 border-[#4a90e2] text-[#4a90e2]'
                                : 'bg-[#181818] border-[#2e2e2e] text-[#888888] hover:border-[#444] hover:text-[#e0e0e0]'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      {(effectiveShape.parameters?.environment && !['city', 'studio', 'apartment', 'lobby', 'night', 'warehouse', 'sunset', 'dawn'].includes(effectiveShape.parameters.environment)) && (
                        <div className="px-2 py-1.5 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between">
                          <span className="text-[10px] text-indigo-400 truncate">Custom HDR Loaded</span>
                          <button 
                            onClick={() => onUpdateShape(effectiveShape.id, {
                              parameters: {
                                ...effectiveShape.parameters,
                                environment: 'city'
                              }
                            })}
                            className="text-[10px] text-white/40 hover:text-white"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Geometry Group */}
          {['box', 'extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'svg', 'text'].includes(effectiveShape.type) && expandedSections.geometry && (
            <div className={`border-b border-[#2e2e2e] bg-[#4a90e2]/[0.02] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <div 
                className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
              >
                <h3 className="text-[#4a90e2] font-semibold text-[11px] uppercase tracking-widest">Geometry Settings</h3>
                <button onClick={() => toggleSection('geometry')}>
                  <ChevronDown className="w-3 h-3 text-[#4a90e2]/50 hover:text-[#4a90e2]" />
                </button>
              </div>
              
              {expandedSections.geometry && (
                <div className="px-4 pb-4 space-y-4">
                  {effectiveShape.type === 'polygon' && (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Sides</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[ensureNumber(effectiveShape.parameters?.sides, 5)]}
                            min={3}
                            max={64}
                            step={1}
                            onValueChange={(val) => handleSliderChange(val, 'parameters', 'sides')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'sides')}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8 text-right">
                            {ensureNumber(effectiveShape.parameters?.sides, 5).toFixed(0)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#888888]">Star Mode</span>
                        <button
                          onClick={() => onUpdateShape(effectiveShape.id, { 
                            parameters: { 
                              ...(effectiveShape.parameters || {}), 
                              isStar: !effectiveShape.parameters?.isStar 
                            } 
                          })}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] border transition-all",
                            effectiveShape.parameters?.isStar
                              ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-500"
                              : "bg-white/5 border-[#2e2e2e] text-[#888888]"
                          )}
                        >
                          {effectiveShape.parameters?.isStar ? "STAR" : "REGULAR"}
                        </button>
                      </div>

                      {effectiveShape.parameters?.isStar && (
                        <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                          <span className="text-[12px] text-[#888888]">Inner Radius</span>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[ensureNumber(effectiveShape.parameters?.innerRadius, 0.5)]}
                              min={0.1}
                              max={1}
                              step={0.01}
                              onValueChange={(val) => handleSliderChange(val, 'parameters', 'innerRadius')}
                              onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'innerRadius')}
                              className="flex-1"
                            />
                            <span className="text-[11px] font-mono text-[#888888] w-8 text-right">
                              {Math.round(ensureNumber(effectiveShape.parameters?.innerRadius, 0.5) * 100)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {effectiveShape.type === 'text' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Content</span>
                        <input
                          type="text"
                          value={effectiveShape.parameters?.text || ''}
                          onChange={(e) => onUpdateShape(effectiveShape.id, { parameters: { ...(effectiveShape.parameters || {}), text: e.target.value } })}
                          className="bg-[#181818] border border-[#2e2e2e] rounded px-1.5 py-1 text-[11px] text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Size</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[ensureNumber(effectiveShape.parameters?.size, 0.5)]}
                            min={0.1}
                            max={5}
                            step={0.1}
                            onValueChange={(val) => handleSliderChange(val, 'parameters', 'size')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'size')}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8">{ensureNumber(effectiveShape.parameters?.size, 0.5).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {['extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'svg', 'text'].includes(effectiveShape.type) && (
                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[12px] text-[#888888]">Thickness</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[ensureNumber(effectiveShape.parameters?.thickness, 0)]}
                          min={0}
                          max={2}
                          step={0.01}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'thickness')}
                          onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'thickness')}
                          className="flex-1"
                        />
                        <span className="text-[11px] font-mono text-[#888888] w-8">
                          {ensureNumber(effectiveShape.parameters?.thickness, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Corner Radius</span>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[ensureNumber(effectiveShape.parameters?.bevelRadius, 0)]}
                        min={0}
                        max={0.5}
                        step={0.01}
                        onValueChange={(val) => handleSliderChange(val, 'parameters', 'bevelRadius')}
                        onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'bevelRadius')}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {ensureNumber(effectiveShape.parameters?.bevelRadius, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deform Group */}
          {['box', 'extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'svg', 'text', 'js_object'].includes(effectiveShape.type) && expandedSections.deform && (
            <div className={`border-b border-[#2e2e2e] bg-orange-400/[0.02] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <div 
                className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-2 text-orange-400/80">
                  <Combine className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">Deform Tools</h3>
                </div>
                <button onClick={() => toggleSection('deform')}>
                  <ChevronDown className="w-3 h-3 text-orange-500/50 hover:text-orange-400" />
                </button>
              </div>
              
              {expandedSections.deform && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Bend</span>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[ensureNumber(effectiveShape.parameters?.bend, 0)]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => handleSliderChange(val, 'parameters', 'bend')}
                        onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'bend')}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {ensureNumber(effectiveShape.parameters?.bend, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#4a90e2] font-semibold">Twist Deformation</span>
                      <button 
                        onClick={() => onUpdateShape(effectiveShape.id, { parameters: { ...effectiveShape.parameters, twist: [0, 0, 0] } })}
                        className="text-[10px] text-[#555] hover:text-[#888]"
                      >
                        Reset
                      </button>
                    </div>
                    
                    {[
                      { label: 'Twist X', axis: 0, color: 'text-red-400/70' },
                      { label: 'Twist Y', axis: 1, color: 'text-green-400/70' },
                      { label: 'Twist Z', axis: 2, color: 'text-blue-400/70' }
                    ].map(({ label, axis, color }) => (
                      <div key={label} className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className={`text-[11px] ${color}`}>{label}</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[ensureNumber(effectiveShape.parameters?.twist?.[axis], 0)]}
                            min={-5}
                            max={5}
                            step={0.01}
                            onValueChange={(val) => {
                              const value = Array.isArray(val) ? val[0] : val;
                              const newTwist = [...(effectiveShape.parameters?.twist || [0, 0, 0])] as [number, number, number];
                              newTwist[axis] = value;
                              onUpdateShape(effectiveShape.id, { parameters: { twist: newTwist } }, true);
                              lastSliderValueRef.current = value;
                            }}
                            onValueCommitted={(val) => {
                              const value = Array.isArray(val) ? val[0] : val;
                              const newTwist = [...(effectiveShape.parameters?.twist || [0, 0, 0])] as [number, number, number];
                              newTwist[axis] = value;
                              onUpdateShape(effectiveShape.id, { parameters: { twist: newTwist } }, false);
                              lastSliderValueRef.current = null;
                            }}
                            className="flex-1"
                          />
                          <span className="text-[10px] font-mono text-[#888888] w-8 text-right">
                            {ensureNumber(effectiveShape.parameters?.twist?.[axis], 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[11px] text-orange-400/70">Taper</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[ensureNumber(effectiveShape.parameters?.taper, 0)]}
                          min={-2}
                          max={2}
                          step={0.01}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'taper')}
                          onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'taper')}
                          className="flex-1"
                        />
                        <span className="text-[10px] font-mono text-[#888888] w-8 text-right">
                          {ensureNumber(effectiveShape.parameters?.taper, 0).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[11px] text-pink-400/70">Stretch</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[ensureNumber(effectiveShape.parameters?.stretch, 0)]}
                          min={-0.9}
                          max={3}
                          step={0.01}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'stretch')}
                          onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'stretch')}
                          className="flex-1"
                        />
                        <span className="text-[10px] font-mono text-[#888888] w-8 text-right">
                          {ensureNumber(effectiveShape.parameters?.stretch, 0).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[11px] text-cyan-400/70">Inflate</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[ensureNumber(effectiveShape.parameters?.inflate, 0)]}
                          min={-1}
                          max={1}
                          step={0.01}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'inflate')}
                          onValueCommitted={(val) => handleSliderCommit(val, 'parameters', 'inflate')}
                          className="flex-1"
                        />
                        <span className="text-[10px] font-mono text-[#888888] w-8 text-right">
                          {ensureNumber(effectiveShape.parameters?.inflate, 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Script settings for JS Object */}
          {effectiveShape.type === 'js_object' && expandedSections.script && (
            <div className={`border-b border-[#2e2e2e] bg-indigo-500/[0.03] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <div 
                className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-2 text-indigo-400/80">
                  <CodeIcon className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">Script Settings</h3>
                </div>
                <button onClick={() => toggleSection('script')}>
                  <ChevronDown className="w-3 h-3 text-indigo-500/50 hover:text-indigo-400" />
                </button>
              </div>
              
              {expandedSections.script && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[10px] text-[#666] leading-relaxed">
                    Custom Three.js script to generate a 3D model. The script must return a THREE.Object3D.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button 
                      onClick={onOpenCodeEditor}
                      variant="outline"
                      className="flex-1 text-[11px] h-8 bg-[#222] border-[#2e2e2e] text-[#888] hover:bg-[#2a2a2a] hover:text-white gap-2"
                    >
                      <CodeIcon className="w-3.5 h-3.5" />
                      Code
                    </Button>
                    <Button 
                      onClick={handleSolidify}
                      disabled={isSolidifying}
                      variant="outline"
                      className="flex-1 text-[11px] h-8 bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20 hover:text-indigo-300 gap-2 font-bold"
                    >
                      {isSolidifying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Box className="w-3.5 h-3.5" />
                      )}
                      Solidify
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Material Group */}
          {effectiveShape.type !== 'group' && !isLight && expandedSections.material && (
            <div className={`border-b border-[#2e2e2e] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <div 
                className="w-full px-4 py-2 flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-2 text-[#888888]">
                  <Zap className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">Material</h3>
                </div>
                <button onClick={() => toggleSection('material')}>
                  <ChevronDown className="w-3 h-3 text-[#555] hover:text-[#888]" />
                </button>
              </div>
              
              {expandedSections.material && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Color / A</span>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-10 h-5 rounded border border-[#2e2e2e] cursor-pointer relative overflow-hidden flex-shrink-0"
                        style={{ backgroundColor: effectiveShape.color }}
                      >
                        <input 
                          type="color" 
                          value={effectiveShape.color}
                          onChange={(e) => onUpdateShape(effectiveShape.id, { color: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <Slider
                        value={[ensureNumber(effectiveShape.material?.opacity, 1)]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => handleSliderChange(val, 'material', 'opacity')}
                        onValueCommitted={(val) => handleSliderCommit(val, 'material', 'opacity')}
                        className="flex-1 px-1"
                      />
                      <span className="text-[10px] font-mono text-[#4a90e2] w-8 text-right">
                        {Math.round(ensureNumber(effectiveShape.material?.opacity, 1) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[11px] text-[#888888]">Preset</span>
                    <div className="grid grid-cols-3 gap-1">
                      <button 
                        onClick={() => setMaterialPreset('metal')}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'metal' 
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >METAL</button>
                      <button 
                        onClick={() => setMaterialPreset('plastic')}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'plastic' 
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >PLASTIC</button>
                      <button 
                        onClick={() => setMaterialPreset('matte')}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'matte' 
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >MATTE</button>
                      <button 
                        onClick={() => setMaterialPreset('glass')}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'glass' 
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >GLASS</button>
                      <button 
                        onClick={() => setMaterialPreset('frosted')}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'frosted' 
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >FROSTED</button>
                       <button 
                        onClick={() => onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, preset: 'custom' } })}
                        className={cn(
                          "px-1 py-1 rounded text-[9px] font-bold border transition-all truncate",
                          effectiveShape.material?.preset === 'custom' || !effectiveShape.material?.preset
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                            : "bg-white/5 text-[#888888] border-[#2e2e2e] hover:text-white hover:border-[#444]"
                        )}
                      >CUSTOM</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 px-0.5">
                    <span className="text-[11px] text-[#888888]">Wireframe (线框模式)</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={!!effectiveShape.material?.wireframe}
                        onChange={(e) => onUpdateShape(effectiveShape.id, {
                          material: {
                            ...effectiveShape.material,
                            wireframe: e.target.checked,
                            preset: 'custom'
                          }
                        })}
                      />
                      <div className="w-7 h-4 bg-[#181818] border border-[#2e2e2e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#888888] after:border-[#888888] after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#4a90e2]/20 peer-checked:border-[#4a90e2] peer-checked:after:bg-[#4a90e2] peer-checked:after:border-[#4a90e2]"></div>
                    </label>
                  </div>

                  <div className="space-y-3">
                    {isGlass ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Reflectivity (反光)</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {Math.round((1 - ensureNumber(effectiveShape.material?.roughness, 0.1)) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[Math.max(0, Math.min(1, 1 - ensureNumber(effectiveShape.material?.roughness, 0.1)))]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'reflectivity')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'reflectivity')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Transparency (透明度)</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {Math.round(ensureNumber(effectiveShape.material?.transmission, 0.9) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.transmission, 0.9)]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'transmission')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'transmission')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Index of Refraction (折射率)</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {ensureNumber(effectiveShape.material?.ior, 1.5).toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.ior, 1.5)]}
                            min={1}
                            max={2.33}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'ior')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'ior')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Volume Thickness (折射厚度)</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {ensureNumber(effectiveShape.material?.thickness, 0.5).toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.thickness, 0.5)]}
                            min={0}
                            max={5}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'thickness')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'thickness')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Absorption (光吸收距离)</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {ensureNumber(effectiveShape.material?.attenuationDistance, 2).toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.attenuationDistance, 2)]}
                            min={0.1}
                            max={10}
                            step={0.1}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'attenuationDistance')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'attenuationDistance')}
                          />
                        </div>

                        <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                          <span className="text-[11px] text-[#888888]">Internal Color</span>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-full h-4 rounded border border-[#2e2e2e] cursor-pointer relative overflow-hidden"
                              style={{ backgroundColor: effectiveShape.material?.attenuationColor || effectiveShape.color }}
                            >
                              <input 
                                type="color" 
                                value={effectiveShape.material?.attenuationColor || effectiveShape.color}
                                onChange={(e) => onUpdateShape(effectiveShape.id, { 
                                  material: { 
                                    ...effectiveShape.material, 
                                    attenuationColor: e.target.value,
                                    preset: 'custom'
                                  } 
                                })}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Metalness</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {Math.round(ensureNumber(effectiveShape.material?.metalness, 0) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.metalness, 0)]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'metalness')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'metalness')}
                          />
                        </div>

                         <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#888888]">Roughness</span>
                            <span className="text-[10px] text-[#4a90e2] font-mono">
                              {Math.round(ensureNumber(effectiveShape.material?.roughness, 0.5) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.roughness, 0.5)]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'roughness')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'roughness')}
                          />
                        </div>

                        <div className="space-y-2 border-t border-white/5 pt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-indigo-300">Clearcoat (漆面强度)</span>
                            <span className="text-[10px] text-indigo-400 font-mono">
                              {Math.round(ensureNumber(effectiveShape.material?.clearcoat, 0) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.clearcoat, 0)]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'clearcoat')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'clearcoat')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-indigo-300">Clearcoat Roughness</span>
                            <span className="text-[10px] text-indigo-400 font-mono">
                              {Math.round(ensureNumber(effectiveShape.material?.clearcoatRoughness, 0) * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[ensureNumber(effectiveShape.material?.clearcoatRoughness, 0)]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(val) => handleSliderChange(val, 'material', 'clearcoatRoughness')}
                            onValueCommitted={(val) => handleSliderCommit(val, 'material', 'clearcoatRoughness')}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] text-[#888888]">Texture Map</span>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleTextureUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded group-hover:border-[#4a90e2]/50 transition-colors bg-white/[0.01]">
                        {effectiveShape.material?.map ? (
                          <img src={effectiveShape.material.map} className="w-6 h-6 object-cover rounded shadow" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-[#444444]" />
                        )}
                        <span className="text-[10px] text-[#666666]">
                          {effectiveShape.material?.map ? 'Change Texture' : 'Upload Texture'}
                        </span>
                      </div>
                    </div>
                    {effectiveShape.material?.map && (
                      <button 
                        onClick={() => onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, map: undefined } })}
                        className="text-[9px] text-red-500/50 hover:text-red-500 transition-colors"
                      >
                        Remove Texture
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      </div>

      {/* Resize handle */}
      <div 
        onMouseDown={startResizing}
        className="h-1.5 w-full bg-[#1c1c1c] border-t border-white/5 cursor-ns-resize hover:bg-[#4a90e2]/30 transition-colors flex items-center justify-center group absolute bottom-0 left-0 z-20 shrink-0"
      >
        <div className="w-8 h-0.5 bg-[#333] rounded-full group-hover:bg-[#4a90e2]/50 transition-colors" />
      </div>
    </div>
  );
};
