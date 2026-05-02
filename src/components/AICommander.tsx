import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Send, 
  Sparkles, 
  User, 
  Bot, 
  X, 
  Minimize2,
  Loader2,
  Play,
  CheckCircle2,
  LayoutList,
  Hammer,
  MessageSquare
} from 'lucide-react';
import { SceneNode, NodeType } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { generateSceneNodes } from '../services/aiService';

interface PlanStep {
  description: string;
  tool_name: string;
  args: any;
  executed?: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  plan?: PlanStep[];
}

interface AICommanderProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onAddNode: (type: NodeType, properties?: Partial<SceneNode>) => void;
  onAddNodes: (nodes: Partial<SceneNode>[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  onDeleteNode: (id: string) => void;
  onSelectNodes: (ids: string[]) => void;
  clearScene: () => void;
}

type TabType = 'chat' | 'build';

export function AICommander({ 
  nodes, 
  selectedIds, 
  onAddNode,
  onAddNodes,
  onUpdateNode, 
  onDeleteNode, 
  onSelectNodes,
  clearScene 
}: AICommanderProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your AI design assistant. I can help you build shapes, adjust lighting, and transform objects in your scene." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [buildInput, setBuildInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 340, height: 500 });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef(null);

  const genAI = useMemo(() => {
    const key = process.env.GEMINI_API_KEY || '';
    if (!key) return null;
    return new GoogleGenAI({ apiKey: key });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setDimensions({
        width: Math.max(300, Math.min(800, startWidth - (moveEvent.clientX - startX))),
        height: Math.max(350, Math.min(800, startHeight - (moveEvent.clientY - startY)))
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const executeAction = async (toolName: string, args: any) => {
    try {
      if (toolName === 'execute_script') {
        const { code } = args;
        const scene = {
          nodes: [...nodes],
          add: (type: NodeType, props?: Partial<SceneNode>) => onAddNode(type, props),
          update: (id: string, updates: Partial<SceneNode>) => onUpdateNode(id, updates),
          delete: (id: string) => onDeleteNode(id),
          clear: () => clearScene(),
          select: (ids: string[]) => onSelectNodes(ids)
        };
        const func = new Function('scene', code);
        func(scene);
        return "Executed script successfully.";
      } else if (toolName === 'add_shape') {
        onAddNode(args.type as NodeType, {
          name: args.name,
          position: args.position,
          rotation: args.rotation,
          scale: args.scale,
          color: args.color,
          parameters: args.parameters
        });
        return `Added ${args.name || args.type}`;
      } else if (toolName === 'update_shape') {
        const targetId = args.id === 'selected' ? selectedIds[0] : args.id;
        if (targetId) {
          onUpdateNode(targetId, args);
          return `Updated object`;
        }
      } else if (toolName === 'delete_shape') {
        const targetId = args.id === 'selected' ? selectedIds[0] : args.id;
        if (targetId) onDeleteNode(targetId);
      } else if (toolName === 'clear_scene') {
        clearScene();
      }
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isLoading || !genAI) return;
    const userMessage: Message = { role: 'user', content: chatInput };
    setMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsLoading(true);

    try {
      const sceneContext = nodes.map(n => ({ id: n.id, name: n.name, type: n.type, position: n.position, color: n.color }));
      const systemInstruction = `You are a 3D assistant. Current nodes: ${JSON.stringify(sceneContext)}. 
      Selected: ${selectedIds[0] || 'none'}. Use tools to modify scene. Use 'propose_plan' for complex tasks.`;
      
      const tools = [{
        functionDeclarations: [
          { name: "execute_script", parameters: { type: Type.OBJECT, properties: { code: { type: Type.STRING } }, required: ["code"] } },
          { name: "propose_plan", parameters: { type: Type.OBJECT, properties: { steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { description: { type: Type.STRING }, tool_name: { type: Type.STRING, enum: ['add_shape', 'update_shape', 'delete_shape', 'clear_scene', 'execute_script'] }, args: { type: Type.OBJECT } }, required: ["description", "tool_name", "args"] } } }, required: ["steps"] } },
          { name: "add_shape", parameters: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['box', 'sphere', 'cylinder', 'torus', 'plane', 'pointLight', 'text'] }, name: { type: Type.STRING }, position: { type: Type.ARRAY, items: { type: Type.NUMBER } }, color: { type: Type.STRING } }, required: ["type"] } },
          { name: "update_shape", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, color: { type: Type.STRING } }, required: ["id"] } },
          { name: "delete_shape", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING } }, required: ["id"] } }
        ]
      }];

      const modelName = "gemini-3-flash-preview";
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: userMessage.content }] }],
        config: { systemInstruction, tools }
      });
      const text = result.text || "";
      const calls = result.functionCalls;

      if (calls && calls.length > 0) {
        const plans = calls.filter(c => c.name === 'propose_plan');
        const others = calls.filter(c => c.name !== 'propose_plan');
        for (const call of others) await executeAction(call.name, call.args);
        setMessages(prev => [...prev, { role: 'assistant', content: text, plan: plans.length > 0 ? (plans[0].args as any).steps : undefined }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error processing request." }]);
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
      <AnimatePresence mode="wait">
        {isMinimized ? (
          <motion.div
            key="minimized"
            layoutId="commander"
            className="fixed bottom-20 right-6 pointer-events-auto"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Button
              className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-2xl flex items-center justify-center group border border-white/10"
              onClick={() => setIsMinimized(false)}
            >
              <Sparkles className="w-6 h-6 text-white group-hover:animate-pulse" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="maximized"
            layoutId="commander"
            className="fixed bottom-20 right-6 pointer-events-auto flex flex-col bg-[#1c1c1c]/95 backdrop-blur-xl border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: dimensions.width, height: dimensions.height }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#222222] border-b border-[#2e2e2e]">
              <div className="flex bg-[#121212] p-1 rounded-lg border border-[#2e2e2e]">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                    activeTab === 'chat' ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white"
                  )}
                >
                  <MessageSquare className="w-3 h-3" /> Chat
                </button>
                <button
                  onClick={() => setActiveTab('build')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                    activeTab === 'build' ? "bg-indigo-600 text-white" : "text-[#888888] hover:text-white"
                  )}
                >
                  <Hammer className="w-3 h-3" /> Build
                </button>
              </div>
              <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-white/5" onClick={() => setIsMinimized(true)}>
                <Minimize2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollRef}>
              {activeTab === 'chat' ? (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn("flex gap-2", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1", msg.role === 'user' ? "bg-indigo-600" : "bg-[#2e2e2e]")}>
                        {msg.role === 'user' ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-indigo-400" />}
                      </div>
                      <div className="max-w-[85%] space-y-2">
                        <div className={cn("rounded-xl px-3 py-2 text-[12px] leading-relaxed", msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-[#222222] text-[#e0e0e0] border border-[#2e2e2e]")}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.plan && (
                          <div className="bg-[#1a1a1a] p-2 rounded-lg border border-indigo-500/20 space-y-1">
                            {msg.plan.map((step, si) => (
                              <div key={si} className="flex items-center gap-2 p-1.5 bg-white/5 rounded border border-white/5">
                                <span className="text-[10px] text-indigo-400">Step {si+1}</span>
                                <span className="flex-1 text-[11px] text-[#e0e0e0] truncate">{step.description}</span>
                                <Button variant="ghost" size="icon" className="w-6 h-6 text-indigo-400" onClick={() => executeAction(step.tool_name, step.args)}>
                                  <Play className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-2 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-[#2e2e2e]" />
                      <div className="bg-[#222222] px-3 py-2 rounded-xl text-[11px] text-[#666666]">AI is thinking...</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/10 flex items-center justify-center mb-2">
                    <Hammer className="w-6 h-6 text-indigo-500" />
                  </div>
                  <h3 className="text-[14px] font-bold text-white uppercase tracking-wider">Precision Constructor</h3>
                  <p className="text-[12px] text-[#888888] leading-relaxed">
                    Describe a complex object to build it precisely using geometric primitives.
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full mt-4">
                    {['Robot', 'Space Station', 'Chess Set', 'Car'].map(s => (
                      <button key={s} onClick={() => setBuildInput(s)} className="p-2 rounded bg-white/5 border border-white/5 text-[10px] text-[#888888] hover:bg-white/10 hover:text-white transition-all capitalize">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 bg-[#222222] border-t border-[#2e2e2e]">
              <div className="relative">
                <textarea
                  value={activeTab === 'chat' ? chatInput : buildInput}
                  onChange={(e) => activeTab === 'chat' ? setChatInput(e.target.value) : setBuildInput(e.target.value)}
                  placeholder={activeTab === 'chat' ? "Ask me to modify the scene..." : "Describe an object to build..."}
                  className="w-full bg-[#121212] border border-[#2e2e2e] rounded-xl px-3 py-2.5 pr-12 text-[12px] text-[#e0e0e0] placeholder:text-[#444444] focus:outline-none focus:border-indigo-600 resize-none min-h-[44px]"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); activeTab === 'chat' ? handleSendChat() : handleBuild(); } }}
                />
                <Button 
                  size="icon" 
                  onClick={activeTab === 'chat' ? handleSendChat : handleBuild}
                  disabled={isLoading || !(activeTab === 'chat' ? chatInput : buildInput).trim()}
                  className="absolute right-2 bottom-2 w-7 h-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-20"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
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
