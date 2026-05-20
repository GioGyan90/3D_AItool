import React, { useMemo, useState, useRef } from 'react';
import { SceneNode } from '../types';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Zap, 
  Image as ImageIcon, 
  Video, 
  Upload, 
  Link, 
  Link2Off, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  Lightbulb, 
  Code as CodeIcon, 
  Move, 
  Box, 
  RotateCcw, 
  Loader2, 
  Combine,
  Trash2
} from 'lucide-react';
import { decomposeNode } from '../services/aiService';

// --- Low-level UI Helper Components ---

const Section = ({ title, icon, children, expanded, onToggle, disabled, color = "text-[#777]" }: any) => (
  <div className={cn("border-b border-white/[0.04] last:border-0", disabled && "opacity-40 pointer-events-none")}>
    <button 
      onClick={onToggle}
      className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition-all group"
    >
      <div className={cn("flex items-center gap-2", color)}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] group-hover:text-[#eee] transition-colors">{title}</span>
      </div>
      <div className="w-4 h-4 rounded-full flex items-center justify-center group-hover:bg-white/5 transition-colors">
        {expanded ? <ChevronDown className="w-2.5 h-2.5 text-[#444]" /> : <ChevronRight className="w-2.5 h-2.5 text-[#444]" />}
      </div>
    </button>
    {expanded && (
      <div className="px-3 pb-5 pt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
        {children}
      </div>
    )}
  </div>
);

const PropertyRow = ({ label, children, action, vertical = true }: any) => (
  <div className={cn("space-y-2", !vertical && "flex items-center justify-between space-y-0")}>
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-[#5d5d5d] font-bold uppercase tracking-widest">{label}</span>
      {action}
    </div>
    <div className="w-full">{children}</div>
  </div>
);

const CoordInput = ({ label, value, onChange }: any) => (
  <div className="relative group/coord">
    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] font-black text-[#333] group-hover/coord:text-[#4a90e2] transition-colors pointer-events-none">{label}</span>
    <input
      type="number"
      step="0.1"
      value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full bg-[#121212] border border-[#262626] rounded px-1.5 py-1.5 pl-4 text-[10px] font-mono text-[#aaa] focus:outline-none focus:border-[#4a90e2] focus:text-[#fff] hover:border-[#3a3a3a] transition-all shadow-inner"
    />
  </div>
);

const RotationInput = ({ value: radians, onChange, disabled }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const degrees = useMemo(() => (radians * 180) / Math.PI, [radians]);

  if (isEditing && !disabled) {
    return (
      <input
        autoFocus
        type="number"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => {
          const val = parseFloat(tempValue);
          if (!isNaN(val)) onChange((val * Math.PI) / 180);
          setIsEditing(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="bg-[#121212] border border-[#4a90e2] rounded px-1 py-1 text-[10px] font-mono text-white w-full h-full focus:outline-none"
      />
    );
  }

  return (
    <div 
      onClick={() => { if (!disabled) { setTempValue(degrees.toFixed(1)); setIsEditing(true); } }}
      className={cn(
        "bg-[#121212] border border-[#262626] rounded px-1 py-1.5 text-[10px] font-mono w-full truncate h-full transition-all flex items-center justify-center",
        disabled ? "text-[#333] cursor-not-allowed" : "text-[#888] cursor-text hover:border-[#3a3a3a] hover:text-[#bbb]"
      )}
    >
      {degrees.toFixed(1)}°
    </div>
  );
};

const CompactSlider = ({ value, min, max, step = 0.1, onChange, onCommit }: any) => (
  <div className="flex items-center gap-2.5 px-0.5">
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
      onValueCommitted={(v) => onCommit(v[0])}
      className="flex-1 h-3"
    />
    <span className="text-[10px] font-mono text-[#555] min-w-[32px] text-right font-medium">{value.toFixed(step >= 1 ? 0 : 1)}</span>
  </div>
);

const ColorInput = ({ value, onChange }: any) => (
  <div className="flex items-center gap-3">
    <div 
      className="w-12 h-6 rounded-md border border-[#2a2a2a] overflow-hidden relative cursor-pointer hover:border-[#4a90e2] transition-all shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]"
      style={{ backgroundColor: value }}
    >
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-[2]" title="Pick Color" />
    </div>
    <span className="text-[10px] font-mono text-[#5d5d5d] uppercase tracking-tighter">{value}</span>
  </div>
);

// --- Main component ---

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
  const [panelHeight, setPanelHeight] = useState(480);
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 340, y: 64 });
  const [isSolidifying, setIsSolidifying] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'transform' | 'geometry' | 'appearance' | 'logic'>('transform');
  
  const isResizing = useRef(false);
  const isDragging = useRef(false);
  const startOffset = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startMousePos = useRef({ x: 0, y: 0 });

  const ambientLightNode = nodes.find(n => n.type === 'ambientLight');
  const effectiveShape = selectedShape || ambientLightNode;
  const isGlobalScene = !selectedShape && !!ambientLightNode;

  const isLocked = effectiveShape?.locked;
  const isLight = effectiveShape?.type === 'pointLight' || effectiveShape?.type === 'ambientLight';
  const isAmbient = effectiveShape?.type === 'ambientLight';

  const ensureNumber = (val: any, fallback: number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  // Dragging logic
  const startDragging = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, .no-drag')) return;
    e.preventDefault();
    isDragging.current = true;
    startOffset.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', stopGlobalMove);
  };

  // Resizing logic (Bottom-Left)
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    startMousePos.current = { x: e.clientX, y: e.clientY };
    startSize.current = { w: panelWidth, h: panelHeight };
    startPos.current = { x: panelPos.x, y: panelPos.y };
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', stopGlobalMove);
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (isDragging.current) {
      setPanelPos({
        x: e.clientX - startOffset.current.x,
        y: e.clientY - startOffset.current.y
      });
    }
    if (isResizing.current) {
      const originalRight = startPos.current.x + startSize.current.w;
      const originalTop = startPos.current.y;
      const newWidth = Math.max(isPanelCollapsed ? 48 : 260, originalRight - e.clientX);
      const newHeight = Math.max(300, e.clientY - originalTop);
      
      setPanelWidth(newWidth);
      setPanelHeight(newHeight);
      setPanelPos(prev => ({ ...prev, x: originalRight - newWidth }));
    }
  };

  const stopGlobalMove = () => {
    isDragging.current = false;
    isResizing.current = false;
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', stopGlobalMove);
  };

  const handleSliderChange = (val: number, path: 'parameters' | 'material', key: string) => {
    if (!effectiveShape) return;
    onUpdateShape(effectiveShape.id, {
      [path]: { ...effectiveShape[path], [key]: val }
    }, true);
  };

  const handleSliderCommit = (val: number, path: 'parameters' | 'material', key: string) => {
    if (!effectiveShape) return;
    onUpdateShape(effectiveShape.id, {
      [path]: { ...effectiveShape[path], [key]: val }
    }, false);
  };

  const handleSolidify = async () => {
    if (!effectiveShape || isSolidifying || !onAddNodes || !onDeleteNode) return;
    setIsSolidifying(true);
    try {
      const newNodes = await decomposeNode(effectiveShape, 20);
      if (!newNodes || newNodes.length === 0) throw new Error("AI failed to deconstruct mesh.");
      const offsetNodes = newNodes.map(n => ({
        ...n,
        position: [
          (n.position?.[0] || 0) + effectiveShape.position[0],
          (n.position?.[1] || 0) + effectiveShape.position[1],
          (n.position?.[2] || 0) + effectiveShape.position[2]
        ] as [number, number, number]
      }));
      if (onReplaceNode) onReplaceNode(effectiveShape.id, offsetNodes);
      else { onAddNodes(offsetNodes); onDeleteNode(effectiveShape.id); }
    } catch (err) { alert(err instanceof Error ? err.message : 'Solidify failed.'); }
    finally { setIsSolidifying(false); }
  };

  if (!effectiveShape) {
    return (
      <div 
        className="fixed z-40 bg-[#1c1c1c]/95 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center p-8 rounded-xl shadow-2xl overflow-hidden"
        style={{ left: panelPos.x, top: panelPos.y, width: 48, height: 400 }}
      >
        <p className="text-[#444] text-[10px] font-bold uppercase tracking-widest text-center [writing-mode:vertical-lr] rotate-180">Select layer</p>
      </div>
    );
  }

  const tabs = [
    { id: 'transform', icon: <Move className="w-3.5 h-3.5" />, label: 'Transform' },
    { id: 'geometry', icon: <Box className="w-3.5 h-3.5" />, label: 'Geometry' },
    { id: 'appearance', icon: <Zap className="w-3.5 h-3.5" />, label: 'Appearance' },
    { id: 'logic', icon: <CodeIcon className="w-3.5 h-3.5" />, label: 'Logic' }
  ];

  return (
    <div 
      className="fixed z-40 bg-[#1c1c1c]/95 backdrop-blur-xl border border-white/[0.08] flex rounded-xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{ 
        left: panelPos.x,
        top: panelPos.y,
        width: isPanelCollapsed ? 48 : panelWidth,
        height: panelHeight,
        maxHeight: 'calc(100vh - 48px)'
      }}
    >
      {/* Sidebar Tabs */}
      <div className="w-12 bg-black/20 border-r border-white/[0.04] flex flex-col items-center py-4 gap-4 shrink-0">
        <button 
          onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          className="p-2 mb-2 text-[#555] hover:text-white transition-colors no-drag"
        >
          {isPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setIsPanelCollapsed(false); }}
            className={cn(
              "p-2.5 rounded-lg transition-all relative group no-drag",
              activeTab === tab.id && !isPanelCollapsed ? "bg-white/5 text-[#4a90e2] shadow-[0_0_12px_rgba(74,144,226,0.2)]" : "text-[#555] hover:text-white hover:bg-white/[0.02]"
            )}
            title={tab.label}
          >
            {tab.icon}
            {activeTab === tab.id && !isPanelCollapsed && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#4a90e2] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {!isPanelCollapsed && (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div 
            className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between cursor-grab active:cursor-grabbing shrink-0"
            onMouseDown={startDragging}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isGlobalScene ? "bg-yellow-400 rotate-45" : "bg-[#4a90e2] shadow-[0_0_10px_rgba(74,144,226,0.6)]"
              )} />
              {isGlobalScene ? (
                <span className="text-[10px] font-black text-[#555] uppercase tracking-widest truncate">Global Environment</span>
              ) : (
                <input
                  type="text"
                  value={effectiveShape.name}
                  onChange={(e) => onUpdateShape(effectiveShape.id, { name: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-transparent text-[#eee] text-[11px] font-bold w-full focus:outline-none focus:text-white caret-[#4a90e2] truncate"
                  placeholder="Layer Name"
                  disabled={isLocked && !isLight}
                />
              )}
            </div>
            <button 
              onClick={() => setIsPanelCollapsed(true)}
              className="p-1 hover:bg-white/5 rounded text-[#444] hover:text-white transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {activeTab === 'transform' && !isAmbient && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <PropertyRow label="Position">
                    <div className="grid grid-cols-3 gap-2">
                      {effectiveShape.position.map((v: number, i: number) => (
                        <CoordInput key={i} label={['X', 'Y', 'Z'][i]} value={v} onChange={(val: number) => {
                          const p = [...effectiveShape.position] as [number, number, number]; p[i] = val;
                          onUpdateShape(effectiveShape.id, { position: p });
                        }} />
                      ))}
                    </div>
                  </PropertyRow>
                  <PropertyRow label="Rotation">
                    <div className="grid grid-cols-3 gap-2 h-7">
                      {effectiveShape.rotation.map((v: number, i: number) => (
                        <div key={i} className="relative group/r">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] font-black text-[#333] group-hover/r:text-[#4a90e2] pointer-events-none z-10">{['X', 'Y', 'Z'][i]}</span>
                          <RotationInput value={v} onChange={(val: number) => {
                            const r = [...effectiveShape.rotation] as [number, number, number]; r[i] = val;
                            onUpdateShape(effectiveShape.id, { rotation: r });
                          }} disabled={isLocked} />
                        </div>
                      ))}
                    </div>
                  </PropertyRow>
                  {effectiveShape.type !== 'pointLight' && (
                    <PropertyRow label="Scale" action={
                      <button onClick={() => onUpdateShape(effectiveShape.id, { uniformScale: !effectiveShape.uniformScale })} className={cn("p-1 rounded bg-white/[0.03] transition-all", effectiveShape.uniformScale ? "text-[#4a90e2] shadow-[0_0_8px_rgba(74,144,226,0.2)]" : "text-[#444] hover:text-[#888]")}>
                        {effectiveShape.uniformScale ? <Link className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}
                      </button>
                    }>
                      <div className="grid grid-cols-3 gap-2">
                        {effectiveShape.scale.map((v: number, i: number) => (
                          <CoordInput key={i} label={['X', 'Y', 'Z'][i]} value={v} onChange={(val: number) => {
                            let s = [...effectiveShape.scale] as [number, number, number];
                            if (effectiveShape.uniformScale) s = [val, val, val]; else s[i] = val;
                            onUpdateShape(effectiveShape.id, { scale: s });
                          }} />
                        ))}
                      </div>
                    </PropertyRow>
                  )}
                </div>
              )}

              {activeTab === 'geometry' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    {(['box', 'sphere', 'cylinder', 'torus', 'extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'svg', 'text', 'js_object'].includes(effectiveShape.type)) ? (
                      <div className="space-y-6">
                        {/* Type Specific Parameters */}
                        {effectiveShape.type === 'text' && (
                          <PropertyRow label="Content">
                            <input type="text" value={effectiveShape.parameters?.text || ''} onChange={(e) => onUpdateShape(effectiveShape.id, { parameters: { ...effectiveShape.parameters, text: e.target.value } })} className="w-full bg-[#121212] border border-[#262626] rounded px-3 py-2 text-[10px] text-[#aaa] font-bold focus:border-[#4a90e2] outline-none transition-all" />
                          </PropertyRow>
                        )}
                        
                        {(['box', 'extruded', 'circle', 'rect', 'triangle', 'polygon', 'plane', 'cylinder'].includes(effectiveShape.type)) && (
                          <>
                            <PropertyRow label="Extrusion / Thickness">
                              <CompactSlider value={ensureNumber(effectiveShape.parameters?.thickness, effectiveShape.type === 'box' || effectiveShape.type === 'cylinder' ? 1.0 : 0.1)} min={0} max={2} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'thickness')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'thickness')} />
                            </PropertyRow>
                            <PropertyRow label="Bevel Radius">
                              <CompactSlider value={ensureNumber(effectiveShape.parameters?.bevelRadius, 0)} min={0} max={0.5} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'bevelRadius')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'bevelRadius')} />
                            </PropertyRow>
                          </>
                        )}

                        {(effectiveShape.type === 'sphere' || effectiveShape.type === 'torus' || effectiveShape.type === 'circle') && (
                          <PropertyRow label="Radius">
                            <CompactSlider value={ensureNumber(effectiveShape.parameters?.radius, 0.5)} min={0.1} max={5} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'radius')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'radius')} />
                          </PropertyRow>
                        )}

                        {effectiveShape.type === 'polygon' && (
                           <PropertyRow label="Sides">
                             <CompactSlider value={ensureNumber(effectiveShape.parameters?.sides, 5)} min={3} max={32} step={1} onChange={(v: number) => handleSliderChange(v, 'parameters', 'sides')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'sides')} />
                           </PropertyRow>
                        )}

                        {/* JS Object Custom Parameters */}
                        {effectiveShape.type === 'js_object' && effectiveShape.parameters && (
                          <div className="space-y-4 pt-1">
                            {Object.entries(effectiveShape.parameters).map(([key, val]) => {
                              if (typeof val === 'number') {
                                return (
                                  <PropertyRow key={key} label={key.replace(/([A-Z])/g, ' $1').trim()}>
                                    <CompactSlider value={val} min={0} max={10} onChange={(v: number) => handleSliderChange(v, 'parameters', key)} onCommit={(v: number) => handleSliderCommit(v, 'parameters', key)} />
                                  </PropertyRow>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}

                        {/* Shared Deformations */}
                        <div className="pt-4 border-t border-white/[0.04] space-y-5">
                          <span className="text-[10px] font-black text-[#333] uppercase tracking-[2px]">Deformers</span>
                          
                          <PropertyRow label="Bend Amount">
                            <CompactSlider value={ensureNumber(effectiveShape.parameters?.bend, 0)} min={-1} max={1} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'bend')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'bend')} />
                          </PropertyRow>
                          
                          <PropertyRow label="Taper Ratio">
                            <CompactSlider value={ensureNumber(effectiveShape.parameters?.taper, 0)} min={-1} max={1} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'taper')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'taper')} />
                          </PropertyRow>

                          <PropertyRow label="Stretch">
                            <CompactSlider value={ensureNumber(effectiveShape.parameters?.stretch, 0)} min={-1} max={2} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'stretch')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'stretch')} />
                          </PropertyRow>

                          <PropertyRow label="Inflate / Bloat">
                            <CompactSlider value={ensureNumber(effectiveShape.parameters?.inflate, 0)} min={-0.5} max={0.5} step={0.01} onChange={(v: number) => handleSliderChange(v, 'parameters', 'inflate')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'inflate')} />
                          </PropertyRow>

                          <PropertyRow label="Twist Force">
                             <div className="grid grid-cols-3 gap-2">
                               {[0, 1, 2].map(i => (
                                 <CoordInput key={i} label={['X', 'Y', 'Z'][i]} value={effectiveShape.parameters?.twist?.[i] || 0} onChange={(val: number) => {
                                   const t = [...(effectiveShape.parameters?.twist || [0, 0, 0])];
                                   t[i] = val;
                                   onUpdateShape(effectiveShape.id, { parameters: { ...effectiveShape.parameters, twist: t } });
                                 }} />
                               ))}
                             </div>
                          </PropertyRow>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-[#333]">
                        <Box className="w-8 h-8 mb-4 opacity-50" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">No mesh parameters</span>
                      </div>
                    )}
                 </div>
              )}

  {activeTab === 'appearance' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  {isLight ? (
                    <div className="space-y-6">
                      <PropertyRow label="Intensity">
                        <CompactSlider value={ensureNumber(effectiveShape.parameters?.intensity, 1)} min={0} max={10} onChange={(v: number) => handleSliderChange(v, 'parameters', 'intensity')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'intensity')} />
                      </PropertyRow>
                      {!isAmbient && (
                        <PropertyRow label="Falloff Distance">
                          <CompactSlider value={ensureNumber(effectiveShape.parameters?.distance, 20)} min={0} max={100} onChange={(v: number) => handleSliderChange(v, 'parameters', 'distance')} onCommit={(v: number) => handleSliderCommit(v, 'parameters', 'distance')} />
                        </PropertyRow>
                      )}
                      <PropertyRow label="Color">
                        <ColorInput value={effectiveShape.color} onChange={(c: string) => onUpdateShape(effectiveShape.id, { color: c })} />
                      </PropertyRow>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <PropertyRow label="Material Preset">
                        <div className="grid grid-cols-5 gap-1.5">
                          {[
                            { id: 'metal', r: 0.1, m: 1.0 },
                            { id: 'plastic', r: 0.4, m: 0.0 },
                            { id: 'matte', r: 0.8, m: 0.0 },
                            { id: 'glass', r: 0.05, m: 0.0 },
                            { id: 'frosted', r: 0.3, m: 0.0 }
                          ].map((p) => (
                            <button 
                              key={p.id} 
                              onClick={() => onUpdateShape(effectiveShape.id, { 
                                material: { 
                                  ...effectiveShape.material, 
                                  preset: p.id as any,
                                  roughness: p.r,
                                  metalness: p.m
                                } 
                              })} 
                              className={cn(
                                "px-0.5 py-2.5 rounded text-[8px] font-black uppercase transition-all bg-black/[0.15] border hover:bg-black/30", 
                                effectiveShape.material?.preset === p.id ? "text-[#4a90e2] border-[#4a90e2]/40 bg-[#4a90e2]/5" : "text-[#3a3a3a] border-transparent"
                              )}
                            >
                              {p.id.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </PropertyRow>

                      <PropertyRow label="Base Color">
                        <ColorInput value={effectiveShape.color} onChange={(c: string) => onUpdateShape(effectiveShape.id, { color: c })} />
                      </PropertyRow>

                      <PropertyRow label="Polishing / Smoothness">
                        <CompactSlider value={1 - ensureNumber(effectiveShape.material?.roughness, 0.5)} min={0} max={1} step={0.01} onChange={(v: number) => handleSliderChange(1 - v, 'material', 'roughness')} onCommit={(v: number) => handleSliderCommit(1 - v, 'material', 'roughness')} />
                      </PropertyRow>

                      <PropertyRow label="Metallic" vertical={false}>
                        <CompactSlider value={ensureNumber(effectiveShape.material?.metalness, 0)} min={0} max={1} step={0.01} onChange={(v: number) => handleSliderChange(v, 'material', 'metalness')} onCommit={(v: number) => handleSliderCommit(v, 'material', 'metalness')} />
                      </PropertyRow>

                      <div className="pt-4 border-t border-white/[0.04]">
                         <div className="flex items-center justify-between mb-3">
                           <span className="text-[9px] text-[#444] font-black tracking-widest uppercase">Surface Texture</span>
                           <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/5" onClick={() => {
                              const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
                              i.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, map: URL.createObjectURL(f) } }); };
                              i.click();
                           }}>
                             <ImageIcon className="w-3.5 h-3.5 text-[#444]" />
                           </Button>
                         </div>
                         {effectiveShape.material?.map && (
                           <div className="p-2.5 rounded bg-black/40 border border-white/[0.03] flex items-center justify-between group/m">
                             <div className="flex items-center gap-2">
                               <div className="w-5 h-5 rounded overflow-hidden border border-white/10">
                                 <img src={effectiveShape.material.map} className="w-full h-full object-cover" />
                               </div>
                               <span className="text-[9px] text-[#555] font-mono truncate max-w-[140px]">active_map.png</span>
                             </div>
                             <button onClick={() => onUpdateShape(effectiveShape.id, { material: { ...effectiveShape.material, map: undefined } })} className="text-[#333] hover:text-red-400 opacity-0 group-hover/m:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                           </div>
                         )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'logic' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <Button variant="outline" className="w-full h-10 bg-indigo-500/[0.02] hover:bg-indigo-500/[0.05] border-white/[0.04] text-[#888] text-[10px] uppercase font-bold tracking-widest gap-2" onClick={onOpenCodeEditor}>
                      <CodeIcon className="w-3.5 h-3.5" /> Execute Logic
                    </Button>
                    {!isAmbient && (
                      <Button variant="outline" className="w-full h-10 bg-pink-500/[0.02] hover:bg-pink-500/[0.05] border-white/[0.04] text-[#888] text-[10px] uppercase font-bold tracking-widest gap-2" onClick={handleSolidify} disabled={isSolidifying}>
                        {isSolidifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Combine className="w-3.5 h-3.5" />} Solidify Mesh
                      </Button>
                    )}
                 </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Resize Handle at Bottom-Left */}
      <div 
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-50 flex items-center justify-center group"
        onMouseDown={startResizing}
      >
        <div className="w-1.5 h-1.5 border-b-2 border-l-2 border-white/20 group-hover:border-[#4a90e2] rounded-bl-sm transition-colors" />
      </div>
    </div>
  );
};
