import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  PlusCircle, 
  Trash2, 
  Clock, 
  ChevronUp, 
  ChevronDown, 
  ChevronRight,
  Trash,
  Settings,
  Diamond,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AnimationData, PropertyTrack, Keyframe, EditorState, SceneNode } from '../types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TimelineProps {
  animation: AnimationData;
  currentTime: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onTogglePlay: () => void;
  onStopPlay?: () => void;
  onAddKeyframe: (nodeId: string, property: PropertyTrack['property']) => void;
  onRemoveKeyframe: (trackIndex: number, keyframeId: string) => void;
  onUpdateKeyframe: (trackIndex: number, keyframeId: string, newTime: number) => void;
  onDeleteTrack: (trackIndex: number) => void;
  onUpdateAnimation: (data: Partial<AnimationData>) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  selectedNodeId: string | null;
  nodes: EditorState['nodes'];
  animatedNodes: EditorState['nodes'];
}

const ParameterInput = ({ 
  value, 
  onChange, 
  isRotation 
}: { 
  value: number; 
  onChange: (val: number) => void;
  isRotation?: boolean;
}) => {
  const [tempValue, setTempValue] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const displayValue = isRotation ? (value * 180 / Math.PI).toFixed(1) : value.toFixed(2);

  const handleUpdate = (newValue: number) => {
    onChange(isRotation ? (newValue * Math.PI / 180) : newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleUpdate(isRotation ? (value * 180 / Math.PI) + 1 : value + 0.1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleUpdate(isRotation ? (value * 180 / Math.PI) - 1 : value - 0.1);
    } else if (e.key === 'Enter') {
      const val = parseFloat(tempValue);
      if (!isNaN(val)) handleUpdate(val);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 1 : -1;
    const step = isRotation ? 1 : 0.1;
    handleUpdate((isRotation ? (value * 180 / Math.PI) : value) + delta * step);
  };

  return (
    <input
      type="text"
      value={isEditing ? tempValue : (isRotation ? `${displayValue}°` : displayValue)}
      onChange={(e) => setTempValue(e.target.value)}
      onFocus={() => {
        setIsEditing(true);
        setTempValue(isRotation ? (value * 180 / Math.PI).toFixed(1) : value.toFixed(2));
      }}
      onBlur={() => {
        if (isEditing) {
          const val = parseFloat(tempValue);
          if (!isNaN(val)) handleUpdate(val);
          setIsEditing(false);
        }
      }}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      className="w-12 bg-transparent border-none text-[9px] font-mono text-indigo-300 text-right focus:outline-none focus:bg-white/5 rounded px-0.5"
    />
  );
};

export const Timeline: React.FC<TimelineProps> = ({
  animation,
  currentTime,
  isPlaying,
  onTimeChange,
  onTogglePlay,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onDeleteTrack,
  onUpdateAnimation,
  onUpdateNode,
  onStopPlay,
  selectedNodeId,
  nodes,
  animatedNodes
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingLoop = useRef<'start' | 'end' | null>(null);
  const draggingKeyframe = useRef<{ trackIndex: number; keyframeId: string } | null>(null);
  
  const duration = animation.duration;
  const pixelsPerSecond = 100;

  const stopIfNeeded = () => {
    if (isPlaying && onStopPlay) {
      onStopPlay();
    }
  };
  
  const handleTimelineClick = (e: React.MouseEvent) => {
    stopIfNeeded();
    if (draggingLoop.current || draggingKeyframe.current) return;
    if (!scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const rawTime = Math.max(0, Math.min(duration, x / pixelsPerSecond));
    onTimeChange(snapToKeyframes(rawTime));
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!scrollRef.current) return;
    
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const rawTime = Math.max(0, Math.min(duration, x / pixelsPerSecond));
    const time = snapToKeyframes(rawTime);

    if (draggingLoop.current) {
      if (draggingLoop.current === 'start') {
        onUpdateAnimation({ loopStart: Math.min(time, animation.loopEnd - 0.1) });
      } else {
        onUpdateAnimation({ loopEnd: Math.max(time, animation.loopStart + 0.1) });
      }
    } else if (draggingKeyframe.current) {
      const { trackIndex, keyframeId } = draggingKeyframe.current;
      onUpdateKeyframe(trackIndex, keyframeId, time);
    }
  }, [animation, duration, onUpdateAnimation, onUpdateKeyframe]);

  const handleMouseUp = useCallback(() => {
    draggingLoop.current = null;
    draggingKeyframe.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const startDraggingLoop = (type: 'start' | 'end') => {
    stopIfNeeded();
    draggingLoop.current = type;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startDraggingKeyframe = (trackIndex: number, keyframeId: string) => {
    stopIfNeeded();
    draggingKeyframe.current = { trackIndex, keyframeId };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const tracksByNode = useMemo(() => {
    const map = new Map<string, { track: PropertyTrack; originalIndex: number }[]>();
    animation.tracks.forEach((track, index) => {
      const list = map.get(track.nodeId) || [];
      list.push({ track, originalIndex: index });
      map.set(track.nodeId, list);
    });
    return Array.from(map.entries());
  }, [animation.tracks]);

  const formatTime = (time: number) => {
    return time.toFixed(2) + 's';
  };

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedNodeTracks = animation.tracks.filter(t => t.nodeId === selectedNodeId);

  const snapToKeyframes = (time: number): number => {
    const snapThreshold = 0.05; // 50ms snapping
    let closestTime = time;
    let minDistance = Infinity;

    animation.tracks.forEach(track => {
      track.keyframes.forEach(kf => {
        const distance = Math.abs(kf.time - time);
        if (distance < snapThreshold && distance < minDistance) {
          minDistance = distance;
          closestTime = kf.time;
        }
      });
    });

    return closestTime;
  };

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-[#2e2e2e] transition-all duration-300 z-50 overflow-hidden",
      isExpanded ? "h-64" : "h-10"
    )}>
      {/* Header / Controls */}
      <div className="h-10 flex items-center justify-between px-4 bg-[#181818] border-b border-[#2e2e2e]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[#888888] hover:text-white transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8 text-[#888888]" onClick={() => { stopIfNeeded(); onTimeChange(0); }}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-white bg-indigo-600/20 hover:bg-indigo-600/30" onClick={onTogglePlay}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 ml-2">
            <span className="text-[11px] font-mono text-indigo-400 w-12">{formatTime(currentTime)}</span>
            <span className="text-[11px] font-mono text-[#444] self-center">/</span>
            <span className="text-[11px] font-mono text-[#888] w-12">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-1 h-[calc(100%-40px)] overflow-hidden">
          {/* Track Labels */}
          <div 
            id="timeline-labels"
            className="w-48 bg-[#181818] border-r border-[#2e2e2e] overflow-y-hidden shrink-0"
            onClick={stopIfNeeded}
          >
            {/* Align with ruler */}
            <div className="h-10 border-b border-[#2e2e2e] bg-[#1a1a1a]" />
            
            <div className="overflow-y-auto h-[calc(100%-40px)] custom-scrollbar">
              {/* Selected Node Active Tracks & Template */}
              {selectedNode && (
                <div className="flex flex-col border-b border-indigo-500/20 bg-indigo-500/5">
                  <div 
                    className="h-8 flex items-center px-2 gap-2 hover:bg-white/5 cursor-pointer group"
                    onClick={() => toggleNodeExpansion(selectedNode.id)}
                  >
                    {expandedNodes.has(selectedNode.id) ? <ChevronDown className="w-3 h-3 text-indigo-400" /> : <ChevronRight className="w-3 h-3 text-indigo-400" />}
                    <span className="text-[10px] text-white truncate font-bold flex-1 uppercase tracking-tight">{selectedNode.name}</span>
                  </div>

                  {expandedNodes.has(selectedNode.id) && (
                    <div className="flex flex-col">
                      {['position', 'rotation', 'scale'].map(prop => {
                        const track = animation.tracks.find(t => t.nodeId === selectedNode.id && t.property === prop);
                        const trackIndex = animation.tracks.findIndex(t => t.nodeId === selectedNode.id && t.property === prop);
                        const animatedNode = animatedNodes.find(n => n.id === selectedNode.id);
                        const propertyValue = animatedNode ? (animatedNode[prop as keyof SceneNode] as [number, number, number]) : [0,0,0];
                        
                        return (
                          <div key={prop} className="h-7 flex flex-col justify-center border-t border-white/5 hover:bg-white/5 group relative px-3 pl-6">
                            <div className="flex items-center justify-between">
                              <span className={cn("text-[8px] uppercase tracking-widest", track ? "text-indigo-300" : "text-[#555]")}>
                                {prop}
                              </span>
                              <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => onAddKeyframe(selectedNode.id, prop as any)}
                                  title="Add/Update Keyframe"
                                  className={cn(
                                    "transition-all p-1 rounded hover:bg-white/10",
                                    track ? "text-indigo-400" : "text-[#444] hover:text-[#888]"
                                  )}
                                >
                                  <Diamond className={cn("w-2.5 h-2.5 fill-current", !track && "fill-transparent")} />
                                </button>
                                {track && (
                                  <button 
                                    onClick={() => onDeleteTrack(trackIndex)}
                                    className="text-red-500/50 hover:text-red-400 transition-opacity"
                                  >
                                    <Trash className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 justify-end -mt-0.5">
                              {['X', 'Y', 'Z'].map((axis, i) => (
                                <div key={axis} className="flex items-center gap-0.5">
                                  <span className="text-[7px] text-[#555] font-bold">{axis}</span>
                                  <ParameterInput 
                                    value={propertyValue[i] || 0}
                                    isRotation={prop === 'rotation'}
                                    onChange={(val) => {
                                      const next = [...propertyValue];
                                      next[i] = val;
                                      onUpdateNode(selectedNode.id, { [prop]: next });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Other Nodes with Animations */}
              {tracksByNode.filter(([id]) => id !== selectedNodeId).map(([nodeId, tracks]) => {
                const node = nodes.find(n => n.id === nodeId);
                const isNodeExpanded = expandedNodes.has(nodeId);
                
                return (
                  <div key={nodeId} className="flex flex-col border-b border-[#222]">
                    {/* Node Header Row */}
                    <div 
                      className="h-8 flex items-center px-2 gap-2 hover:bg-white/5 cursor-pointer group bg-[#1c1c1c]"
                      onClick={() => toggleNodeExpansion(nodeId)}
                    >
                      {isNodeExpanded ? <ChevronDown className="w-3 h-3 text-[#666]" /> : <ChevronRight className="w-3 h-3 text-[#666]" />}
                      <span className="text-[10px] text-[#e0e0e0] truncate font-medium flex-1">{node?.name || 'Unknown'}</span>
                    </div>

                    {/* Property Rows (only if expanded) */}
                    {isNodeExpanded && tracks.map(({ track, originalIndex }) => (
                      <div key={originalIndex} className="h-7 flex items-center justify-between pl-6 pr-3 border-t border-[#1a1a1a] hover:bg-white/5 group bg-[#181818]">
                        <span className="text-[8px] text-[#888] uppercase tracking-widest">{track.property}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteTrack(originalIndex); }}
                          className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 transition-opacity"
                        >
                          <Trash className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time View */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative select-none bg-[#121212]"
            onClick={handleTimelineClick}
            onScroll={(e) => {
              const target = e.target as HTMLDivElement;
              const labels = document.getElementById('timeline-labels')?.querySelector('.overflow-y-auto');
              if (labels) labels.scrollTop = target.scrollTop;
            }}
          >
            {/* Ruler */}
            <div className="h-10 border-b border-[#2e2e2e] bg-[#1a1a1a] sticky top-0 z-30" style={{ width: duration * pixelsPerSecond }}>
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <div 
                  key={i} 
                  className="absolute bottom-0 h-3 border-l border-[#333] flex flex-col justify-end"
                  style={{ left: i * pixelsPerSecond }}
                >
                  <span className="text-[9px] text-[#666] mb-4 ml-1">{i}s</span>
                </div>
              ))}

              {/* Loop Range Overlay */}
              <div 
                className="absolute top-0 bottom-0 bg-indigo-500/10 border-x border-indigo-500/30"
                style={{ 
                  left: animation.loopStart * pixelsPerSecond, 
                  width: (animation.loopEnd - animation.loopStart) * pixelsPerSecond 
                }}
              />

              {/* Loop Handles */}
              <div 
                className="absolute top-0 w-2 h-full cursor-col-resize hover:bg-indigo-500/40 z-40 flex items-center justify-center group"
                style={{ left: animation.loopStart * pixelsPerSecond - 4 }}
                onMouseDown={(e) => { e.stopPropagation(); startDraggingLoop('start'); }}
              >
                <div className="w-[2px] h-4 bg-indigo-500 opacity-50 group-hover:opacity-100" />
              </div>
              <div 
                className="absolute top-0 w-2 h-full cursor-col-resize hover:bg-indigo-500/40 z-40 flex items-center justify-center group"
                style={{ left: animation.loopEnd * pixelsPerSecond - 4 }}
                onMouseDown={(e) => { e.stopPropagation(); startDraggingLoop('end'); }}
              >
                <div className="w-[2px] h-4 bg-indigo-500 opacity-50 group-hover:opacity-100" />
              </div>
            </div>

            {/* Tracks Container */}
            <div className="relative min-h-[160px]" style={{ width: duration * pixelsPerSecond }}>
              {/* Add Animation Empty State */}
              {selectedNode && selectedNodeTracks.length === 0 && (
                <div 
                  className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
                >
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddKeyframe(selectedNode.id, 'position');
                      setExpandedNodes(prev => new Set([...prev, selectedNode.id]));
                    }}
                    className="pointer-events-auto bg-indigo-600/10 border-indigo-600/30 text-indigo-400 hover:bg-indigo-600/20 text-[10px] h-7 gap-2"
                  >
                    <PlusCircle className="w-3 h-3" />
                    Add First Animation Piece
                  </Button>
                </div>
              )}

              {/* Selected Node Track Lane */}
              {selectedNode && (
                <div className="flex flex-col border-b border-indigo-500/10">
                  <div className="h-8 relative bg-indigo-500/[0.02]">
                    {!expandedNodes.has(selectedNode.id) && selectedNodeTracks.map((track) => {
                      const originalIndex = animation.tracks.findIndex(t => t === track);
                      return track.keyframes.map((kf) => (
                        <div 
                          key={kf.id}
                          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-400 rounded-full"
                          style={{ left: kf.time * pixelsPerSecond - 3 }}
                        />
                      ));
                    })}
                  </div>
                  {expandedNodes.has(selectedNode.id) && ['position', 'rotation', 'scale'].map(prop => {
                    const track = animation.tracks.find(t => t.nodeId === selectedNode.id && t.property === prop);
                    const originalIndex = animation.tracks.findIndex(t => t === track);
                    
                    return (
                      <div key={prop} className="h-7 border-t border-white/5 relative group hover:bg-white/[0.02]">
                        {track && track.keyframes.map((kf, j) => (
                          <motion.div
                            key={kf.id}
                            initial={false}
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-sm rotate-45 border border-white/20 cursor-grab active:cursor-grabbing shadow-lg hover:scale-125 transition-transform z-10",
                              draggingKeyframe.current?.keyframeId === kf.id && "scale-125 bg-indigo-400"
                            )}
                            style={{ left: kf.time * pixelsPerSecond - 5 }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startDraggingKeyframe(originalIndex, kf.id);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              onRemoveKeyframe(originalIndex, kf.id);
                            }}
                          />
                        ))}
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[1px] bg-indigo-500/5" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Other Active Tracks */}
              {tracksByNode.filter(([id]) => id !== selectedNodeId).map(([nodeId, tracks]) => {
                const isNodeExpanded = expandedNodes.has(nodeId);
                
                return (
                  <div key={nodeId} className="flex flex-col border-b border-[#222]">
                    {/* Node Summary Track */}
                    <div className="h-8 relative group hover:bg-white/[0.01]">
                      {!isNodeExpanded && tracks.map(({ track, originalIndex }) => 
                        track.keyframes.map((kf, j) => (
                          <div 
                            key={kf.id}
                            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-500/30 rounded-full"
                            style={{ left: kf.time * pixelsPerSecond - 3 }}
                          />
                        ))
                      )}
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[1px] bg-white/[0.02]" />
                    </div>

                    {/* Property Tracks */}
                    {isNodeExpanded && tracks.map(({ track, originalIndex }) => (
                      <div key={originalIndex} className="h-7 border-t border-[#1a1a1a] relative group hover:bg-white/[0.02]">
                        {track.keyframes.map((kf, j) => (
                          <motion.div
                            key={kf.id}
                            initial={false}
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-sm rotate-45 border border-white/20 cursor-grab active:cursor-grabbing shadow-lg hover:scale-125 transition-transform z-10",
                              draggingKeyframe.current?.keyframeId === kf.id && "scale-125 bg-indigo-400"
                            )}
                            style={{ left: kf.time * pixelsPerSecond - 4 }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startDraggingKeyframe(originalIndex, kf.id);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              onRemoveKeyframe(originalIndex, kf.id);
                            }}
                          />
                        ))}
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[1px] bg-indigo-500/10" />
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Playhead */}
              <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                style={{ left: currentTime * pixelsPerSecond }}
              >
                <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
