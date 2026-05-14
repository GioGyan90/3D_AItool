import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Sparkles, 
  X, 
  Loader2,
  Hammer,
  Scissors,
  Layers,
  Search,
  BoxSelect,
  MousePointer2
} from 'lucide-react';
import { SceneNode, NodeType } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { generateSceneNodes, decomposeNode } from '../services/aiService';

interface AICommanderProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onAddNode: (type: NodeType, properties?: Partial<SceneNode>) => void;
  onAddNodes: (nodes: Partial<SceneNode>[]) => void;
  onReplaceNode?: (oldId: string, newNodes: Partial<SceneNode>[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  onDeleteNode: (id: string) => void;
  onSelectNodes: (ids: string[]) => void;
  clearScene: () => void;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'decompose' | 'build';

export function AICommander({ 
  nodes, 
  selectedIds, 
  onAddNode,
  onAddNodes,
  onReplaceNode,
  onUpdateNode, 
  onDeleteNode, 
  onSelectNodes,
  clearScene,
  isOpen,
  onClose
}: AICommanderProps) {
  const [activeTab, setActiveTab] = useState<TabType>('decompose');
  const [buildInput, setBuildInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error' | 'success' | 'warn'}[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 340, height: 450 });
  const constraintsRef = useRef(null);

  const selectedNode = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return nodes.find(n => n.id === selectedIds[0]);
  }, [nodes, selectedIds]);

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setDimensions({
        width: Math.max(300, Math.min(600, startWidth - (moveEvent.clientX - startX))),
        height: Math.max(300, Math.min(800, startHeight - (moveEvent.clientY - startY)))
      });
    };

    const stopResizing = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopResizing);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResizing);
  };

  const handleDecompose = async () => {
    if (!selectedNode || isLoading) return;
    setIsLoading(true);
    setLogs([]);
    setIsTerminalOpen(true);
    
    const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
      setLogs(prev => [...prev, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }]);
    };

    const timeoutCheck = setTimeout(() => {
      if (isLoading) addLog("Model is taking longer than expected. Please wait...", 'warn');
    }, 15000);

    const longerWaitCheck = setTimeout(() => {
      if (isLoading) addLog("Still processing complex geometry. Large scripts take more time to analyze...", 'info');
    }, 45000);

    const longestWaitCheck = setTimeout(() => {
      if (isLoading) addLog("Finalizing results. Almost there...", 'info');
    }, 90000);

    const extendedWaitCheck = setTimeout(() => {
      if (isLoading) addLog("This is a very complex model. Thank you for your patience...", 'info');
    }, 150000);

    const nearCompletionCheck = setTimeout(() => {
      if (isLoading) addLog("Processing the final components...", 'info');
    }, 240000);

    try {
      addLog(`Initializing deconstruction for: ${selectedNode.name}`);
      addLog(`Analyzing node type: ${selectedNode.type}`);
      
      if (selectedNode.script) {
        addLog(`Processing Three.js script (${selectedNode.script.length} chars)...`);
      }

      addLog("Connecting to Gemini AI Engine...");
      
      const newNodes = await decomposeNode(selectedNode, 20); 
      clearTimeout(timeoutCheck);
      clearTimeout(longerWaitCheck);
      clearTimeout(longestWaitCheck);
      clearTimeout(extendedWaitCheck);
      clearTimeout(nearCompletionCheck);
      
      if (!newNodes || newNodes.length === 0) {
        addLog("AI returned 0 components. Skipping replacement.", 'warn');
        throw new Error("AI returned empty results. Possible parsing failure.");
      }

      addLog(`AI successfully identified ${newNodes.length} candidate components.`);
      addLog("Mapping coordinates and materials...");
      
      const offsetNodes = newNodes.map(n => ({
        ...n,
        position: [
          (n.position?.[0] || 0) + selectedNode.position[0],
          (n.position?.[1] || 0) + selectedNode.position[1],
          (n.position?.[2] || 0) + selectedNode.position[2]
        ] as [number, number, number]
      }));

      addLog(`Finalizing sync for ${offsetNodes.length} new SceneNodes.`, 'success');

      if (onReplaceNode) {
        onReplaceNode(selectedNode.id, offsetNodes);
      } else {
        onAddNodes(offsetNodes);
        onDeleteNode(selectedNode.id);
      }
      
      addLog("Process complete. Layer replaced.", 'success');
    } catch (e) {
      clearTimeout(timeoutCheck);
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      addLog(`CRITICAL ERROR: ${errorMsg}`, 'error');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuild = async () => {
    if (!buildInput.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const newNodes = await generateSceneNodes(buildInput);
      onAddNodes(newNodes);
      setBuildInput('');
    } catch (e) {
      alert('Failed to build.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]" ref={constraintsRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="commander"
            className="fixed bottom-6 right-6 pointer-events-auto flex flex-col bg-[#1c1c1c]/95 backdrop-blur-xl border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: dimensions.width, height: dimensions.height }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#222222] border-b border-[#2e2e2e]">
              <div className="flex bg-[#121212] p-1 rounded-lg border border-[#2e2e2e]">
                <button
                  onClick={() => setActiveTab('decompose')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                    activeTab === 'decompose' ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white"
                  )}
                >
                  <Scissors className="w-3 h-3" /> 一键拆分
                </button>
                <button
                  onClick={() => setActiveTab('build')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                    activeTab === 'build' ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white"
                  )}
                >
                  <Hammer className="w-3 h-3" /> 模型构建
                </button>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-8 h-8 text-[#888888] hover:text-white"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col p-6 items-center justify-center text-center">
              {activeTab === 'decompose' ? (
                <div className="space-y-6 w-full">
                  {!selectedNode ? (
                    <motion.div 
                      className="space-y-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                        <MousePointer2 className="w-8 h-8 text-[#444]" />
                      </div>
                      <h3 className="text-white font-medium">请先选择一个模型</h3>
                      <p className="text-[12px] text-[#888] px-4">
                        点击场景中的物体，我可以帮您将其拆解为基础几何体构成的组合。
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div 
                      className="space-y-6"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <div className="relative">
                        <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto">
                          <Sparkles className="w-10 h-10 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">AI</div>
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-[10px] text-[#555] uppercase tracking-widest font-bold">当前选择</p>
                        <h3 className="text-white font-bold text-lg truncate px-4">{selectedNode.name}</h3>
                      </div>

                      <div className="bg-[#222] border border-[#333] rounded-xl p-4 text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center shrink-0">
                            <Layers className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-white text-[12px] font-medium">拆分为组合层</p>
                            <p className="text-[11px] text-[#888]">将该物体拆解为最多20个基础模型</p>
                          </div>
                        </div>
                      </div>

                      <Button 
                        onClick={handleDecompose} 
                        disabled={isLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-bold flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            正在拆分中...
                          </>
                        ) : (
                          <>
                            <Scissors className="w-4 h-4" />
                            立即一键拆分
                          </>
                        )}
                      </Button>

                      {/* Terminal Toggle and Terminal Area */}
                      <div className="w-full mt-4 flex flex-col items-stretch">
                        <button 
                          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                          className="flex items-center gap-2 text-[10px] text-[#555] hover:text-[#888] transition-colors mb-2 uppercase font-bold tracking-widest self-center"
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full", isLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
                          {isTerminalOpen ? '隐藏终端日志' : '查看实时处理进度'}
                        </button>

                        <AnimatePresence>
                          {isTerminalOpen && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 180, opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-black/40 border border-white/5 rounded-lg overflow-hidden flex flex-col"
                            >
                              <div className="bg-white/5 px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
                                <span className="text-[9px] font-mono text-[#666]">AI PROCESS TERMINAL v1.0.4</span>
                                <div className="flex gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                </div>
                              </div>
                              <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] text-left space-y-1">
                                {logs.length === 0 ? (
                                  <div className="text-[#333] italic">等待指令...</div>
                                ) : (
                                  logs.map((log, i) => (
                                    <div key={i} className={cn(
                                      "break-words",
                                      log.type === 'error' ? "text-red-400" : 
                                      log.type === 'success' ? "text-emerald-400" : 
                                      log.type === 'warn' ? "text-amber-400" : "text-[#888]"
                                    )}>
                                      <span className="opacity-50 mr-1">{'>'}</span>
                                      {log.msg}
                                    </div>
                                  ))
                                )}
                                {isLoading && (
                                  <div className="text-indigo-400 flex items-center gap-2">
                                    <span className="animate-pulse">_</span>
                                    正在同步处理中...
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 w-full flex flex-col h-full">
                  <div className="flex-1 flex flex-col items-center justify-center pt-8">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                      <Hammer className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-[14px] font-bold text-white uppercase tracking-wider">智能模型构建</h3>
                    <p className="text-[12px] text-[#888888] leading-relaxed mt-2 px-6">
                      描述您想创建的物体，AI将使用多个基础几何体为您精准构建。
                    </p>
                  </div>

                  <div className="bg-[#121212] border border-[#2e2e2e] rounded-xl p-3 mb-2">
                    <textarea
                      value={buildInput}
                      onChange={(e) => setBuildInput(e.target.value)}
                      placeholder="例如：一个红色的赛车..."
                      className="w-full bg-transparent border-none text-[12px] text-[#e0e0e0] placeholder:text-[#444] focus:outline-none resize-none min-h-[60px]"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBuild(); } }}
                    />
                    <div className="flex justify-end mt-2">
                       <Button 
                        size="sm"
                        onClick={handleBuild}
                        disabled={isLoading || !buildInput.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 h-8 px-4 text-[11px] font-bold uppercase tracking-wider rounded-lg"
                      >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3 h-3 mr-2" /> 生成</>}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resize handle */}
            <div 
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-white/5 transition-colors group"
              onMouseDown={handleResize}
            >
              <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-white/20 group-hover:border-white/40" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
