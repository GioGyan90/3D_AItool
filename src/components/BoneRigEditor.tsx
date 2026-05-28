import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Settings, 
  GitBranch, 
  Layers, 
  FolderLock, 
  RotateCw,
  Plus,
  Trash2,
  Sparkles,
  Bookmark,
  Activity,
  Info
} from 'lucide-react';
import { SceneNode } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface JointConfig {
  id: string;
  name: string;
  parentJointId: string | null;
  position: [number, number, number];
  rotation: [number, number, number]; // degree rotations X, Y, Z
  length: number;
}

interface BoneRigConfig {
  type: 'none' | 'L' | 'Z' | 'chain';
  joints: JointConfig[];
  binds?: {
    nodeId: string;
    jointId: string;
  }[];
}

interface BoneRigEditorProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function BoneRigEditor({
  nodes,
  selectedIds,
  onUpdateNode,
  isOpen,
  onClose
}: BoneRigEditorProps) {
  const [panelPosition, setPanelPosition] = useState({ x: 120, y: 150 });
  const [dimensions, setDimensions] = useState({ width: 330, height: 500 });
  
  const activeNode = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return nodes.find(n => n.id === selectedIds[0]) || null;
  }, [nodes, selectedIds]);

  const activeRig = useMemo(() => {
    if (!activeNode) return null;
    return activeNode.parameters?.boneRig as BoneRigConfig | undefined || null;
  }, [activeNode]);

  // Child nodes eligible for joint binding (excluding lights and camera/ambient)
  const bindableChildren = useMemo(() => {
    if (!activeNode) return [];
    return nodes.filter(n => n.parentId === activeNode.id && !['ambientLight', 'pointLight', 'motion_path'].includes(n.type));
  }, [nodes, activeNode]);

  // Dragging floating panel handler
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
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

  // Preset generators
  const applyPreset = (type: 'L' | 'Z' | 'chain') => {
    if (!activeNode) return;

    let joints: JointConfig[] = [];
    if (type === 'L') {
      joints = [
        { id: 'joint-0', name: 'Shoulder (肩关节)', parentJointId: null, position: [0, -0.6, 0], rotation: [0, 0, 0], length: 0.6 },
        { id: 'joint-1', name: 'Elbow (肘关节)', parentJointId: 'joint-0', position: [0, 0.6, 0], rotation: [0, 0, 45], length: 0.6 },
        { id: 'joint-2', name: 'Wrist (手腕)', parentJointId: 'joint-1', position: [0.6, 0, 0], rotation: [0, 0, 0], length: 0.3 }
      ];
    } else if (type === 'Z') {
      joints = [
        { id: 'joint-0', name: 'Base Root_S (底座根部)', parentJointId: null, position: [0, -0.6, 0], rotation: [0, 0, 0], length: 0.4 },
        { id: 'joint-1', name: 'Lower Arm_M (下折摆臂)', parentJointId: 'joint-0', position: [0, 0.4, 0], rotation: [0, 0, -35], length: 0.5 },
        { id: 'joint-2', name: 'Upper Arm_S (上折摆臂)', parentJointId: 'joint-1', position: [0.5, 0.2, 0], rotation: [0, 0, 70], length: 0.5 },
        { id: 'joint-3', name: 'Tip Effector (末端执行器)', parentJointId: 'joint-2', position: [-0.3, 0.4, 0], rotation: [0, 0, -35], length: 0.2 }
      ];
    } else if (type === 'chain') {
      joints = [
        { id: 'joint-0', name: 'Segment 1 (骨骼节 1)', parentJointId: null, position: [0, -0.7, 0], rotation: [0, 0, 0], length: 0.5 },
        { id: 'joint-1', name: 'Segment 2 (骨骼节 2)', parentJointId: 'joint-0', position: [0, 0.5, 0], rotation: [0, 0, 15], length: 0.5 },
        { id: 'joint-2', name: 'Segment 3 (骨骼节 3)', parentJointId: 'joint-1', position: [0, 0.5, 0], rotation: [0, 0, 15], length: 0.5 }
      ];
    }

    onUpdateNode(activeNode.id, {
      parameters: {
        ...activeNode.parameters,
        boneRig: {
          type,
          joints,
          binds: activeRig?.binds || []
        }
      }
    });
  };

  const clearRig = () => {
    if (!activeNode) return;
    onUpdateNode(activeNode.id, {
      parameters: {
        ...activeNode.parameters,
        boneRig: undefined
      }
    });
  };

  // Update Joint values
  const handleJointRotationChange = (jointId: string, axis: 'x' | 'y' | 'z', value: number) => {
    if (!activeNode || !activeRig) return;

    const updatedJoints = activeRig.joints.map(joint => {
      if (joint.id === jointId) {
        const copyRot = [...joint.rotation] as [number, number, number];
        if (axis === 'x') copyRot[0] = value;
        if (axis === 'y') copyRot[1] = value;
        if (axis === 'z') copyRot[2] = value;
        return {
          ...joint,
          rotation: copyRot
        };
      }
      return joint;
    });

    onUpdateNode(activeNode.id, {
      parameters: {
        ...activeNode.parameters,
        boneRig: {
          ...activeRig,
          joints: updatedJoints
        }
      }
    });
  };

  // Layer Bind Handler
  const handleSetLayerBind = (nodeId: string, jointId: string) => {
    if (!activeNode || !activeRig) return;
    const currentBinds = activeRig.binds ? [...activeRig.binds] : [];
    const filtered = currentBinds.filter(b => b.nodeId !== nodeId);
    if (jointId !== 'none') {
      filtered.push({ nodeId, jointId });
    }

    onUpdateNode(activeNode.id, {
      parameters: {
        ...activeNode.parameters,
        boneRig: {
          ...activeRig,
          binds: filtered
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="bone-rig-editor-panel"
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
            {/* Header */}
            <div 
              onMouseDown={handleHeaderMouseDown}
              className="flex items-center justify-between px-4 py-3 bg-[#1d1d1d] border-b border-[#2c2c2c] cursor-move flex-none"
            >
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-amber-500" />
                <span className="font-bold tracking-tight text-xs uppercase text-white">
                  Rigging & Skinning • 骨骼蒙皮绑定
                </span>
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

            {/* Container Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#121212]">
              {!activeNode ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 py-16">
                  <Info className="w-10 h-10 text-neutral-600 mb-3" />
                  <p className="text-xs text-white uppercase tracking-wider font-extrabold mb-1">未选择网格物体</p>
                  <p className="text-[10px] text-neutral-500 leading-relaxed max-w-[220px]">
                    请在视口或图层面板中选取一个 3D 图层、材质组或导入的 GLB 模型开始绑定。
                  </p>
                </div>
              ) : (
                <>
                  {/* Selected target info */}
                  <div className="p-3 bg-[#181818] border border-[#242424] rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-neutral-500">Selected Target (当前绑定主体)</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-2 h-2 rounded bg-amber-500 animate-pulse" />
                      <span className="text-xs font-semibold text-white truncate max-w-[170px]">{activeNode.name}</span>
                      <span className="text-[9px] px-1.5 bg-white/5 text-neutral-400 border border-white/5 rounded">
                        {activeNode.type}
                      </span>
                    </div>
                  </div>

                  {/* Section 1: Presets and rigging activation */}
                  {!activeRig ? (
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase font-bold text-neutral-400 border-b border-[#222] pb-1">
                        Initialize Armature Preset (骨骼预设初始化)
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-normal">
                        为该物体应用一副骨架模型。预设骨骼可以完美折叠运动并可对子图层执行旋转缩放跟随：
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => applyPreset('L')}
                          className="h-9 w-full bg-[#1c1c1c] hover:bg-neutral-800 border border-[#2c2c2c] rounded-lg text-xs font-extrabold text-neutral-200 hover:text-white transition-all flex items-center justify-between px-3 cursor-pointer group"
                        >
                          <span className="flex items-center gap-2">
                            <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                            <span>L-Shape Dual Joints (L型双关节)</span>
                          </span>
                          <span className="text-[9px] text-neutral-500 group-hover:text-amber-400 font-bold font-mono">Apply →</span>
                        </button>

                        <button
                          onClick={() => applyPreset('Z')}
                          className="h-9 w-full bg-[#1c1c1c] hover:bg-neutral-800 border border-[#2c2c2c] rounded-lg text-xs font-extrabold text-neutral-200 hover:text-white transition-all flex items-center justify-between px-3 cursor-pointer group"
                        >
                          <span className="flex items-center gap-2">
                            <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                            <span>Z-Shape Triple Joints (Z型三关节)</span>
                          </span>
                          <span className="text-[9px] text-neutral-500 group-hover:text-amber-400 font-bold font-mono">Apply →</span>
                        </button>

                        <button
                          onClick={() => applyPreset('chain')}
                          className="h-9 w-full bg-[#1c1c1c] hover:bg-neutral-800 border border-[#2c2c2c] rounded-lg text-xs font-extrabold text-neutral-200 hover:text-white transition-all flex items-center justify-between px-3 cursor-pointer group"
                        >
                          <span className="flex items-center gap-2">
                            <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                            <span>Chain Triple Bone (链式微曲指骨)</span>
                          </span>
                          <span className="text-[9px] text-neutral-500 group-hover:text-amber-400 font-bold font-mono">Apply →</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Active Armature sliders */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-[#2c2c2c] pb-1">
                          <span className="text-[10px] uppercase font-black text-amber-500">Pose & Transform (骨架姿态编辑)</span>
                          <button
                            onClick={clearRig}
                            className="text-[9px] text-rose-400 hover:text-rose-300 font-bold transition-colors cursor-pointer"
                          >
                            Remove Armature (清除骨骼)
                          </button>
                        </div>

                        {/* List of Joint Knobs */}
                        <div className="space-y-3">
                          {activeRig.joints.map((joint) => (
                            <div key={joint.id} className="p-3 bg-[#191919] border border-[#282828] rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-zinc-100 flex items-center gap-1.5">
                                  <Activity className="w-3.5 h-3.5 text-amber-500" />
                                  {joint.name}
                                </span>
                                <span className="text-[9px] text-neutral-500 font-mono">
                                  {joint.parentJointId ? `Child of ${joint.parentJointId}` : 'Root Bone'}
                                </span>
                              </div>

                              {/* Multi Sliders X / Y / Z */}
                              <div className="space-y-2.5">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400 font-mono">
                                    <span>Rotate Z (主折叠角)</span>
                                    <span className="text-white font-bold">{joint.rotation[2]}°</span>
                                  </div>
                                  <input 
                                    type="range"
                                    min="-180" 
                                    max="180" 
                                    step="1"
                                    value={joint.rotation[2]} 
                                    onChange={(e) => handleJointRotationChange(joint.id, 'z', parseFloat(e.target.value))}
                                    className="w-full accent-amber-500 h-1 bg-[#222] rounded-lg cursor-pointer"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400 font-mono">
                                    <span>Rotate X (侧倾斜角)</span>
                                    <span className="text-white font-bold">{joint.rotation[0]}°</span>
                                  </div>
                                  <input 
                                    type="range"
                                    min="-180" 
                                    max="180" 
                                    step="1"
                                    value={joint.rotation[0]} 
                                    onChange={(e) => handleJointRotationChange(joint.id, 'x', parseFloat(e.target.value))}
                                    className="w-full accent-amber-600 h-1 bg-[#222] rounded-lg cursor-pointer"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 2: Sub-meshes / Sub-layers bindings */}
                      <div className="space-y-3">
                        <div className="text-[10px] uppercase font-bold text-neutral-400 border-b border-[#222] pb-1">
                          Map Layers to Bone (图层蒙皮绑定映射)
                        </div>
                        {bindableChildren.length === 0 ? (
                          <p className="text-[9px] text-neutral-500 leading-normal italic">
                            当前物体没有子节点，骨骼弯曲将对 3D 网格体自身顶点执行 Automatic Weights (自动权重蒙皮) 变形。
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                            {bindableChildren.map((child) => {
                              const boundBind = activeRig.binds?.find(b => b.nodeId === child.id);
                              return (
                                <div key={child.id} className="flex items-center justify-between text-[10px] bg-neutral-900 border border-white/5 p-2 rounded">
                                  <span className="font-semibold text-neutral-300 truncate max-w-[120px]">{child.name}</span>
                                  <select
                                    value={boundBind?.jointId || 'none'}
                                    onChange={(e) => handleSetLayerBind(child.id, e.target.value)}
                                    className="bg-[#1a1a1a] border border-[#2c2c2c] text-[9px] rounded text-neutral-300 p-1 font-bold outline-none cursor-pointer"
                                  >
                                    <option value="none">Unbound (无绑定)</option>
                                    {activeRig.joints.map(j => (
                                      <option key={j.id} value={j.id}>{j.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Blender reference instructions */}
                      <div className="bg-[#1a1c1a] border border-[#263e26] p-2.5 rounded-lg flex gap-1.5 items-start">
                        <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-[9px] text-neutral-400 leading-normal">
                          <p className="text-emerald-400 font-bold mb-0.5">蒙皮算法说明</p>
                          1. 骨架可视化将在视口中显示为亮色的椎骨关节棒。
                          <br />
                          2. 无子项目时，系统将通过其 rest-pose 骨骼到顶点的距离来自动分配权重，并在旋转关节时执行平滑的整体 CPU Skinning 蒙皮网格变形。
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
