import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Sparkles, 
  User, 
  Bot, 
  Image as ImageIcon, 
  X, 
  Paperclip,
  Maximize2,
  Minimize2,
  Trash2,
  Loader2,
  Clipboard
} from 'lucide-react';
import { SceneNode, NodeType } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface AIChatProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onAddNode: (type: NodeType, properties?: Partial<SceneNode>) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  onDeleteNode: (id: string) => void;
  onSelectNodes: (ids: string[]) => void;
  clearScene: () => void;
}

export function AIChat({ 
  nodes, 
  selectedIds, 
  onAddNode, 
  onUpdateNode, 
  onDeleteNode, 
  onSelectNodes,
  clearScene 
}: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your AI design assistant. I can help you build shapes, adjust lighting, and transform objects in your scene. Try asking me to 'add a red cube at 5,0,0' or 'make the selected object twice as large'." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 320, height: 450 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const constraintsRef = useRef(null);

  // Prevent multiple initializations
  const aiRef = useRef<GoogleGenAI | null>(null);
  if (!aiRef.current) {
    aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleResize = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      setDimensions({
        width: Math.max(280, Math.min(800, startWidth - deltaX)),
        height: Math.max(300, Math.min(800, startHeight - deltaY))
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleDragEnd = (_: any, info: any) => {
    // Basic magnetic snapping to edges
    const snapThreshold = 60;
    const { x, y } = info.offset;
    
    // Framer motion keeps track of the delta offset during drag.
    // If we wanted to persist the position we would use x/y state,
    // but for now dragConstraints handles the bounding box.
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachedImages(prev => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, []);

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const executeTools = async (toolCalls: any[]) => {
    const results: string[] = [];
    
    for (const call of toolCalls) {
      const args = call.args;
      
      try {
        if (call.name === 'add_shape') {
          onAddNode(args.type as NodeType, {
            name: args.name,
            position: args.position as [number, number, number],
            rotation: args.rotation as [number, number, number],
            scale: args.scale as [number, number, number],
            color: args.color,
            parameters: args.parameters || {}
          });
          results.push(`Added ${args.name || args.type}`);
        } else if (call.name === 'update_shape') {
          const targetId = args.id === 'selected' ? selectedIds[0] : args.id;
          if (targetId) {
            onUpdateNode(targetId, {
              name: args.name,
              position: args.position as [number, number, number],
              rotation: args.rotation as [number, number, number],
              scale: args.scale as [number, number, number],
              color: args.color,
              parameters: args.parameters || {},
              visible: args.visible
            });
            results.push(`Updated object ${targetId}`);
          } else {
            results.push("Error: No object selected to update.");
          }
        } else if (call.name === 'delete_shape') {
          const targetId = args.id === 'selected' ? selectedIds[0] : args.id;
          if (targetId) {
            onDeleteNode(targetId);
            results.push(`Deleted object ${targetId}`);
          }
        } else if (call.name === 'clear_scene') {
          clearScene();
          results.push("Cleared the entire scene.");
        } else if (call.name === 'select_object') {
          onSelectNodes([args.id]);
          results.push(`Selected object ${args.id}`);
        }
      } catch (err) {
        results.push(`Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    return results;
  };

  const handleSend = async () => {
    if (!input.trim() && attachedImages.length === 0) return;

    const userMessage: Message = { role: 'user', content: input, images: [...attachedImages] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedImages([]);
    setIsLoading(true);

    try {
      // Prepare system instruction with current scene context
      const sceneContext = nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        position: n.position,
        scale: n.scale,
        color: n.color
      }));

      const systemInstruction = `You are an expert 3D scene assistant. You can manipulate objects in the scene via tool calling.
Current Scene Nodes: ${JSON.stringify(sceneContext)}
Currently Selected ID: ${selectedIds.length === 1 ? selectedIds[0] : 'None'}

Instructions:
1. Always be helpful and brief. Give a short confirmation after performing actions.
2. Use tool calls to perform scene operations.
3. If the user provides an image, analyze it and try to replicate or modify the scene based on its content.
4. When adding shapes, prioritize 'box', 'sphere', 'cylinder', 'torus', 'pointLight'.
5. For transformations, use reasonable values. Postions are usually within -10 to 10 range. Scale starts at 1.`;

      // Tools definition
      const tools = [
        {
          functionDeclarations: [
            {
              name: "add_shape",
              description: "Add a new shape or light to the 3D scene",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['box', 'sphere', 'cylinder', 'torus', 'plane', 'pointLight'], description: "The type of node to add" },
                  name: { type: Type.STRING, description: "Display name for the new object" },
                  position: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x, y, z] position" },
                  rotation: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x, y, z] rotation in radians" },
                  scale: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x, y, z] scale" },
                  color: { type: Type.STRING, description: "Hex color string like #ffffff" },
                  parameters: { 
                    type: Type.OBJECT, 
                    description: "Specific geometry parameters",
                    properties: {
                      intensity: { type: Type.NUMBER, description: "For lights" },
                      distance: { type: Type.NUMBER, description: "For lights" },
                      decay: { type: Type.NUMBER, description: "For lights" },
                      thickness: { type: Type.NUMBER, description: "For SVG/Extruded" }
                    }
                  }
                },
                required: ["type"]
              }
            },
            {
              name: "update_shape",
              description: "Update an existing object's properties",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "The ID of the node to update, or 'selected' for currently selected" },
                  name: { type: Type.STRING },
                  position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  rotation: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  scale: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  color: { type: Type.STRING },
                  visible: { type: Type.BOOLEAN },
                  parameters: { type: Type.OBJECT }
                },
                required: ["id"]
              }
            },
            {
              name: "delete_shape",
              description: "Remove an object from the scene",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID to delete, or 'selected'" }
                },
                required: ["id"]
              }
            },
            {
              name: "clear_scene",
              description: "Delete all objects and start from empty scene",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "select_object",
              description: "Select a specific object in the scene by its ID",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING }
                },
                required: ["id"]
              }
            }
          ]
        }
      ];

      // Prepare parts including images if present
      const parts: any[] = [{ text: input || "Analyze this image and describe how to build it in 3D." }];
      
      userMessage.images?.forEach(img => {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(',')[0].split(':')[1].split(';')[0];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      });

      const response = await aiRef.current!.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          tools,
        }
      });

      const text = response.text || "I've processed your request.";
      const toolCalls = response.functionCalls;

      if (toolCalls && toolCalls.length > 0) {
        await executeTools(toolCalls);
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      }

    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error while processing your request. Please check your API configuration or try again." }]);
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
            layoutId="chat-window"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="fixed bottom-20 right-6 pointer-events-auto"
          >
            <Button
              className="w-14 h-14 rounded-full bg-indigo-500 hover:bg-indigo-600 shadow-2xl flex items-center justify-center group"
              onClick={() => setIsMinimized(false)}
            >
              <Sparkles className="w-6 h-6 text-white group-hover:animate-pulse" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#181818] animate-bounce" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="maximized"
            layoutId="chat-window"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ 
              width: dimensions.width, 
              height: dimensions.height,
              bottom: 80,
              right: 24,
              position: 'fixed'
            }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="pointer-events-auto flex flex-col bg-[#181818]/95 backdrop-blur-xl border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden"
            onPaste={handlePaste}
          >
            {/* Resize Handle - Top Left */}
            <div 
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-[70] hover:bg-white/5 transition-colors group"
              onMouseDown={(e) => handleResize(e, 'tl')}
            >
              <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-white/20 group-hover:border-white/50" />
            </div>

            {/* Header - Drag Handle Area */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#222222] border-b border-[#2e2e2e] cursor-grab active:cursor-grabbing shrink-0">
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-[11px] font-bold tracking-widest text-[#e0e0e0] uppercase truncate">AI Copilot</span>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-7 h-7 hover:bg-white/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMinimized(true);
                  }}
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-7 h-7 hover:bg-white/5 text-red-400/50 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMessages([{ role: 'assistant', content: "Hello! Scene cleared. How can I help?" }]);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
              <div className="space-y-4 pb-2">
                {messages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex gap-3",
                      msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                      msg.role === 'user' ? "bg-indigo-500" : "bg-[#2e2e2e]"
                    )}>
                      {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm",
                      msg.role === 'user' ? "bg-indigo-500 text-white" : "bg-[#222222] text-[#e0e0e0] border border-[#2e2e2e]"
                    )}>
                      {msg.content}
                      {msg.images && msg.images.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          {msg.images.map((img, idx) => (
                            <img key={idx} src={img} alt="Sent" className="rounded-lg object-cover w-full aspect-square border border-white/10 shadow-inner" />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#2e2e2e] flex items-center justify-center animate-pulse">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <div className="bg-[#222222] border border-[#2e2e2e] rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#666666]" />
                      <span className="text-[11px] text-[#666666]">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="p-3 bg-[#222222] border-t border-[#2e2e2e] shrink-0">
              {attachedImages.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                  {attachedImages.map((img, i) => (
                    <div key={i} className="relative group flex-shrink-0">
                      <img src={img} className="w-12 h-12 rounded-lg object-cover border border-[#2e2e2e]" alt="Thumb" />
                      <button 
                        onClick={() => removeAttachedImage(i)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type or paste image..."
                  className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl px-3 py-2 pr-24 text-[12px] text-[#e0e0e0] placeholder:text-[#555555] focus:outline-none focus:border-indigo-500 transition-all resize-none min-h-[40px] max-h-32"
                  rows={1}
                />
                <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*" 
                    multiple 
                    onChange={handleImageUpload}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-7 h-7 hover:bg-white/5 text-[#888888] hover:text-[#e0e0e0]"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach Image"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-7 h-7 hover:bg-white/5 text-[#888888] hover:text-[#e0e0e0]"
                    onClick={async () => {
                       try {
                         const text = await navigator.clipboard.readText();
                         setInput(prev => prev + (prev ? " " : "") + text);
                       } catch (err) {
                         console.error("Clipboard access failed", err);
                       }
                    }}
                    title="Paste from clipboard"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                  </Button>
                  <Button 
                    size="icon" 
                    className={cn(
                      "w-7 h-7 rounded-lg transition-all",
                      input.trim() || attachedImages.length > 0 
                        ? "bg-indigo-500 hover:bg-indigo-600 text-white active:scale-95" 
                        : "bg-[#2e2e2e] text-[#555555] opacity-50 cursor-not-allowed"
                    )}
                    onClick={handleSend}
                    disabled={!input.trim() && attachedImages.length === 0}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-1.5 opacity-20 select-none">
                <Sparkles className="w-2 h-2" />
                <span className="text-[8px] font-bold tracking-[0.2em] uppercase">Gemini powered</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
