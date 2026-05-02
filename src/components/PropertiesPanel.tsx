import React, { useMemo, useState } from 'react';
import { SceneNode } from '../types';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, Image as ImageIcon, Link, Link2Off, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';

interface PropertiesPanelProps {
  selectedShape: SceneNode | null;
  nodes: SceneNode[];
  onUpdateShape: (id: string, updates: Partial<SceneNode>) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedShape, nodes, onUpdateShape }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    transform: true,
    geometry: true,
    material: true,
    lighting: true,
    scene: true,
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

  const setMaterialPreset = (preset: 'metal' | 'plastic' | 'matte' | 'glass') => {
    if (!effectiveShape || (isLocked && !isLight)) return;
    
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
    
    onUpdateShape(effectiveShape.id, {
      material: {
        ...effectiveShape.material,
        ...material
      }
    });
  };

  if (!effectiveShape) {
    return (
      <div className="w-[280px] h-full bg-[#1c1c1c] border-l border-[#2e2e2e] flex items-center justify-center p-6 text-center">
        <p className="text-[#888888] text-xs uppercase tracking-widest leading-relaxed">Select an object to edit its properties</p>
      </div>
    );
  }

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

      <ScrollArea className="flex-1">
        <div className="flex-1 overflow-y-auto">
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
                        {effectiveShape.position.map((val, i) => (
                          <input
                            key={i}
                            type="number"
                            step="0.1"
                            value={Number(val.toFixed(2))}
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
                        {effectiveShape.rotation.map((val, i) => (
                          <input
                            key={i}
                            type="number"
                            step="0.1"
                            value={Number(val.toFixed(2))}
                            onChange={(e) => {
                              const newRot = [...effectiveShape.rotation] as [number, number, number];
                              newRot[i] = parseFloat(e.target.value) || 0;
                              onUpdateShape(effectiveShape.id, { rotation: newRot });
                            }}
                            className="bg-[#181818] border border-[#2e2e2e] rounded px-1.5 py-1 text-[11px] font-mono text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
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
                          {effectiveShape.scale.map((val, i) => (
                            <input
                              key={i}
                              type="number"
                              step="0.1"
                              value={Number(val.toFixed(2))}
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
                        value={[effectiveShape.parameters.intensity || 1]}
                        min={0}
                        max={10}
                        step={0.1}
                        onValueChange={(val) => {
                          const value = Array.isArray(val) ? val[0] : val;
                          onUpdateShape(effectiveShape.id, { 
                            parameters: { ...effectiveShape.parameters, intensity: value } 
                          });
                        }}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {(effectiveShape.parameters.intensity || 1).toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {!isAmbient && (
                    <>
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Distance</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[effectiveShape.parameters.distance || 10]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={(val) => {
                              const value = Array.isArray(val) ? val[0] : val;
                              onUpdateShape(effectiveShape.id, { 
                                parameters: { ...effectiveShape.parameters, distance: value } 
                              });
                            }}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8 text-right">
                            {(effectiveShape.parameters.distance || 10).toFixed(0)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Decay</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[effectiveShape.parameters.decay || 2]}
                            min={0}
                            max={10}
                            step={0.1}
                            onValueChange={(val) => {
                              const value = Array.isArray(val) ? val[0] : val;
                              onUpdateShape(effectiveShape.id, { 
                                parameters: { ...effectiveShape.parameters, decay: value } 
                              });
                            }}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8">
                            {(effectiveShape.parameters.decay || 2).toFixed(1)}
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
                          value={effectiveShape.parameters.text || ''}
                          onChange={(e) => onUpdateShape(effectiveShape.id, { parameters: { ...effectiveShape.parameters, text: e.target.value } })}
                          className="bg-[#181818] border border-[#2e2e2e] rounded px-1.5 py-1 text-[11px] text-[#e0e0e0] w-full focus:outline-none focus:border-[#4a90e2]"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                        <span className="text-[12px] text-[#888888]">Size</span>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[effectiveShape.parameters.size || 0.5]}
                            min={0.1}
                            max={5}
                            step={0.1}
                            onValueChange={(val) => onUpdateShape(effectiveShape.id, { parameters: { ...effectiveShape.parameters, size: val[0] } })}
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono text-[#888888] w-8">{(effectiveShape.parameters.size || 0.5).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {['extruded', 'circle', 'rect', 'triangle', 'plane', 'svg', 'text'].includes(effectiveShape.type) && (
                    <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                      <span className="text-[12px] text-[#888888]">Thickness</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[effectiveShape.parameters.thickness || 0]}
                          min={0}
                          max={2}
                          step={0.01}
                          onValueChange={(val) => {
                            const value = Array.isArray(val) ? val[0] : val;
                            onUpdateShape(effectiveShape.id, { 
                              parameters: { ...effectiveShape.parameters, thickness: value } 
                            });
                          }}
                          className="flex-1"
                        />
                        <span className="text-[11px] font-mono text-[#888888] w-8">
                          {(effectiveShape.parameters.thickness || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Corner Radius</span>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[effectiveShape.parameters.bevelRadius || 0]}
                        min={0}
                        max={0.5}
                        step={0.01}
                        onValueChange={(val) => {
                          const value = Array.isArray(val) ? val[0] : val;
                          onUpdateShape(effectiveShape.id, { 
                            parameters: { ...effectiveShape.parameters, bevelRadius: value } 
                          });
                        }}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {(effectiveShape.parameters.bevelRadius || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[12px] text-[#888888]">Bend</span>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[effectiveShape.parameters.bend || 0]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => {
                          const value = Array.isArray(val) ? val[0] : val;
                          onUpdateShape(effectiveShape.id, { 
                            parameters: { ...effectiveShape.parameters, bend: value } 
                          });
                        }}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-mono text-[#888888] w-8">
                        {(effectiveShape.parameters.bend || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
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
                    <span className="text-[12px] text-[#888888]">Color</span>
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

                  <div className="grid grid-cols-[1fr,2fr] items-center gap-2">
                    <span className="text-[11px] text-[#888888]">Preset</span>
                    <select 
                      onChange={(e) => setMaterialPreset(e.target.value as any)}
                      value={
                        effectiveShape.material?.metalness === 0.9 ? 'metal' :
                        effectiveShape.material?.metalness === 0 && effectiveShape.material?.roughness === 0.2 ? 'plastic' :
                        effectiveShape.material?.roughness === 0.8 ? 'matte' :
                        effectiveShape.material?.metalness === 0.2 && effectiveShape.material?.roughness === 0 ? 'glass' : 'custom'
                      }
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
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-[#888888]">Metalness</span>
                        <span className="text-[10px] text-[#4a90e2] font-mono">{((effectiveShape.material?.metalness || 0) * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[effectiveShape.material?.metalness || 0]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, metalness: val[0] } })}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-[#888888]">Roughness</span>
                        <span className="text-[10px] text-[#4a90e2] font-mono">{((effectiveShape.material?.roughness ?? 0.5) * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[effectiveShape.material?.roughness ?? 0.5]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, roughness: val[0] } })}
                      />
                    </div>
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
