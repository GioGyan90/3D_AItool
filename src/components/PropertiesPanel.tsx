import React, { useMemo, useState, useRef } from 'react';
import { SceneNode } from '../types';

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
import { Zap, Image as ImageIcon, Link, Link2Off, ChevronDown, ChevronRight, ChevronLeft, Lightbulb, Code as CodeIcon } from 'lucide-react';

interface PropertiesPanelProps {
  selectedShape: SceneNode | null;
  nodes: SceneNode[];
  onUpdateShape: (id: string, updates: Partial<SceneNode>, skipHistory?: boolean) => void;
  onOpenCodeEditor: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedShape, 
  nodes, 
  onUpdateShape, 
  onOpenCodeEditor,
  isCollapsed,
  onToggleCollapse
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    transform: true,
    geometry: true,
    material: true,
    lighting: true,
    scene: true,
    script: true,
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

  if (isCollapsed) {
    return (
      <aside 
        className="w-1 bg-[#1c1c1c] border-l border-[#2e2e2e] hover:bg-[#4a90e2]/40 transition-all cursor-pointer relative group"
        onClick={onToggleCollapse}
      >
        <button 
          className="absolute top-1/2 -left-3 transform -translate-y-1/2 w-6 h-6 rounded-full bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-[#888888] opacity-0 group-hover:opacity-100 transition-opacity z-50"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
      </aside>
    );
  }

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

  const setMaterialPreset = (preset: 'metal' | 'plastic' | 'matte' | 'glass') => {
    if (!effectiveShape || (isLocked && !isLight)) return;
    
    let material = {};
    switch (preset) {
      case 'metal':
        material = { metalness: 0.9, roughness: 0.1, transmission: 0, opacity: 1, ior: 1.5, preset: 'metal' };
        break;
      case 'plastic':
        material = { metalness: 0.0, roughness: 0.2, transmission: 0, opacity: 1, ior: 1.5, preset: 'plastic' };
        break;
      case 'matte':
        material = { metalness: 0.0, roughness: 0.8, transmission: 0, opacity: 1, ior: 1.5, preset: 'matte' };
        break;
      case 'glass':
        material = { 
          metalness: 0.0, 
          roughness: 0.02, 
          transmission: 1.0, 
          opacity: 1, 
          ior: 1.5, 
          thickness: 0.5, 
          attenuationDistance: 2,
          attenuationColor: effectiveShape.color,
          preset: 'glass' 
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
            ...effectiveShape.material,
            roughness: 1 - value,
            metalness: value * 0.2,
            preset: 'custom'
          }
        }, true);
      } else {
        onUpdateShape(effectiveShape.id, {
          material: {
            ...effectiveShape.material,
            [key]: value,
            preset: 'custom'
          }
        }, true);
      }
    } else {
      onUpdateShape(effectiveShape.id, {
        parameters: {
          ...(effectiveShape.parameters || {}),
          [key]: value
        }
      }, true);
    }
  };

  const handleSliderCommit = (updatePath: 'parameters' | 'material', key: string) => {
    if (lastSliderValueRef.current === null || !Number.isFinite(lastSliderValueRef.current)) return;
    const value = lastSliderValueRef.current;
    
    if (updatePath === 'material') {
      if (key === 'reflectivity') {
        onUpdateShape(effectiveShape.id, {
          material: {
            ...effectiveShape.material,
            roughness: 1 - value,
            metalness: value * 0.2,
            preset: 'custom'
          }
        }, false);
      } else {
        onUpdateShape(effectiveShape.id, {
          material: {
            ...effectiveShape.material,
            [key]: value,
            preset: 'custom'
          }
        }, false);
      }
    } else {
      onUpdateShape(effectiveShape.id, {
        parameters: {
          ...(effectiveShape.parameters || {}),
          [key]: value
        }
      }, false);
    }
    lastSliderValueRef.current = null;
  };

  return (
    <div className="w-[280px] h-full bg-[#1c1c1c] border-l border-[#2e2e2e] flex flex-col">
      <div className="px-4 py-3 border-b border-[#2e2e2e]">
        <h2 className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest">
          {isGlobalScene ? 'Scene Environment' : 'Properties'}
        </h2>
        {!isGlobalScene ? (
          <input
            type="text"
            value={effectiveShape.name}
            onChange={(e) => onUpdateShape(effectiveShape.id, { name: e.target.value })}
            className="bg-transparent text-[#e0e0e0] text-[12px] mt-1 w-full focus:outline-none focus:text-white border-b border-transparent focus:border-[#4a90e2] pb-0.5"
            placeholder="Enter name..."
            disabled={isLocked && !isLight}
          />
        ) : (
          <div className="text-[12px] text-white/40 mt-1 font-medium">Natural Lighting Setup</div>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-6 pb-20">
          {/* Transform Group */}
          {!isAmbient && (
            <div className={`border-b border-[#2e2e2e] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <button 
                onClick={() => toggleSection('transform')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
              >
                <h3 className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest group-hover:text-[#e0e0e0]">Transform</h3>
                {expandedSections.transform ? <ChevronDown className="w-3 h-3 text-[#555555]" /> : <ChevronRight className="w-3 h-3 text-[#555555]" />}
              </button>
              
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
          {isLight && (
            <div className="border-b border-[#2e2e2e] bg-yellow-400/[0.02]">
              <button 
                onClick={() => toggleSection('lighting')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-2 text-yellow-400/70 group-hover:text-yellow-400">
                  <Lightbulb className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">{isAmbient ? 'Natural Light' : 'Light Settings'}</h3>
                </div>
                {expandedSections.lighting ? <ChevronDown className="w-3 h-3 text-yellow-400/50" /> : <ChevronRight className="w-3 h-3 text-yellow-400/50" />}
              </button>
              
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
                          onPointerUp={() => handleSliderCommit('parameters', 'intensity')}
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
                            onPointerUp={() => handleSliderCommit('parameters', 'distance')}
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
                            onPointerUp={() => handleSliderCommit('parameters', 'decay')}
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
          {['box', 'extruded', 'circle', 'rect', 'triangle', 'plane', 'svg', 'text'].includes(effectiveShape.type) && (
            <div className={`border-b border-[#2e2e2e] bg-[#4a90e2]/[0.02] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <button 
                onClick={() => toggleSection('geometry')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
              >
                <h3 className="text-[#4a90e2] font-semibold text-[11px] uppercase tracking-widest">Geometry Settings</h3>
                {expandedSections.geometry ? <ChevronDown className="w-3 h-3 text-[#4a90e2]/50" /> : <ChevronRight className="w-3 h-3 text-[#4a90e2]/50" />}
              </button>
              
              {expandedSections.geometry && (
                <div className="px-4 pb-4 space-y-4">
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
                            onPointerUp={() => handleSliderCommit('parameters', 'size')}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8">{ensureNumber(effectiveShape.parameters?.size, 0.5).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {['extruded', 'circle', 'rect', 'triangle', 'plane', 'svg', 'text'].includes(effectiveShape.type) && (
                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[12px] text-[#888888]">Thickness</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[ensureNumber(effectiveShape.parameters?.thickness, 0)]}
                          min={0}
                          max={2}
                          step={0.01}
                          onValueChange={(val) => handleSliderChange(val, 'parameters', 'thickness')}
                          onPointerUp={() => handleSliderCommit('parameters', 'thickness')}
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
                        onPointerUp={() => handleSliderCommit('parameters', 'bevelRadius')}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {ensureNumber(effectiveShape.parameters?.bevelRadius, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Bend</span>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[ensureNumber(effectiveShape.parameters?.bend, 0)]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => handleSliderChange(val, 'parameters', 'bend')}
                        onPointerUp={() => handleSliderCommit('parameters', 'bend')}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {ensureNumber(effectiveShape.parameters?.bend, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Script settings for JS Object */}
          {effectiveShape.type === 'js_object' && (
            <div className={`border-b border-[#2e2e2e] bg-indigo-500/[0.03] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <button 
                onClick={() => toggleSection('script')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-2 text-indigo-400/80 group-hover:text-indigo-400">
                  <CodeIcon className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">Script Settings</h3>
                </div>
                {expandedSections.script ? <ChevronDown className="w-3 h-3 text-indigo-400/50" /> : <ChevronRight className="w-3 h-3 text-indigo-400/50" />}
              </button>
              
              {expandedSections.script && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[10px] text-[#666] leading-relaxed">
                    Custom Three.js script to generate a 3D model. The script must return a THREE.Object3D.
                  </p>
                  <Button 
                    onClick={onOpenCodeEditor}
                    variant="outline"
                    className="w-full text-[11px] h-8 bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 gap-2"
                  >
                    <CodeIcon className="w-3.5 h-3.5" />
                    Edit JS Script
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Material Group */}
          {effectiveShape.type !== 'group' && !isLight && (
            <div className={`border-b border-[#2e2e2e] ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
              <button 
                onClick={() => toggleSection('material')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-2 text-[#888888] group-hover:text-[#e0e0e0]">
                  <Zap className="w-3 h-3" />
                  <h3 className="font-semibold text-[11px] uppercase tracking-widest">Material</h3>
                </div>
                {expandedSections.material ? <ChevronDown className="w-3 h-3 text-[#555555]" /> : <ChevronRight className="w-3 h-3 text-[#555555]" />}
              </button>
              
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
                        onPointerUp={() => handleSliderCommit('material', 'opacity')}
                        className="flex-1 px-1"
                      />
                      <span className="text-[10px] font-mono text-[#4a90e2] w-8 text-right">
                        {Math.round(ensureNumber(effectiveShape.material?.opacity, 1) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[11px] text-[#888888]">Preset</span>
                    <select 
                      onChange={(e) => setMaterialPreset(e.target.value as any)}
                      value={effectiveShape.material?.preset || 'custom'}
                      className="bg-[#181818] border border-[#2e2e2e] rounded px-2 py-1 text-[11px] text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
                    >
                      <option value="custom">Custom</option>
                      <option value="metal">Metal (金属)</option>
                      <option value="plastic">Plastic (塑料)</option>
                      <option value="matte">Matte (磨砂)</option>
                      <option value="glass">Glass (玻璃)</option>
                    </select>
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
                            onPointerUp={() => handleSliderCommit('material', 'reflectivity')}
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
                            onPointerUp={() => handleSliderCommit('material', 'transmission')}
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
                            onPointerUp={() => handleSliderCommit('material', 'ior')}
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
                            onPointerUp={() => handleSliderCommit('material', 'thickness')}
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
                            onPointerUp={() => handleSliderCommit('material', 'attenuationDistance')}
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
                            onPointerUp={() => handleSliderCommit('material', 'metalness')}
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
                            onPointerUp={() => handleSliderCommit('material', 'roughness')}
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
  );
};
