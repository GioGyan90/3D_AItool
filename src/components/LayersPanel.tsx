import React from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SceneNode } from '../types';
import { cn } from '@/lib/utils';
import { Box, Circle, Cylinder, Torus, Square, Layers as ExtrudeIcon, Folder, Eye, EyeOff, Triangle, Lock, Unlock } from 'lucide-react';

interface LayersPanelProps {
  nodes: SceneNode[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateNode: (id: string, updates: Partial<SceneNode>) => void;
  onReorder: (nodes: SceneNode[]) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onResetCamera: () => void;
}

const NodeIcon = ({ type }: { type: SceneNode['type'] }) => {
  switch (type) {
    case 'box': return <Box className="w-3.5 h-3.5" />;
    case 'sphere': return <Circle className="w-3.5 h-3.5" />;
    case 'cylinder': return <Cylinder className="w-3.5 h-3.5" />;
    case 'torus': return <Torus className="w-3.5 h-3.5" />;
    case 'plane': return <Square className="w-3.5 h-3.5" />;
    case 'circle': return <Circle className="w-3.5 h-3.5" />;
    case 'rect': return <Square className="w-3.5 h-3.5" />;
    case 'triangle': return <Triangle className="w-3.5 h-3.5" />;
    case 'extruded': return <ExtrudeIcon className="w-3.5 h-3.5" />;
    case 'model': return <Box className="w-3.5 h-3.5 text-[#4a90e2]" />;
    case 'group': return <Folder className="w-3.5 h-3.5 text-[#4a90e2]" />;
    default: return <Box className="w-3.5 h-3.5" />;
  }
};

const SortableLayerItem = ({ 
  node, 
  depth = 0, 
  isSelected, 
  onSelect,
  onToggleVisibility,
  allNodes
}: { 
  node: SceneNode; 
  depth?: number;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onToggleVisibility: (id: string) => void;
  allNodes: SceneNode[];
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${depth * 12 + 16}px`,
    zIndex: isDragging ? 100 : 0
  };

  const children = allNodes.filter(n => n.parentId === node.id);

  return (
    <div ref={setNodeRef} style={style} className={cn("group/item", isDragging && "opacity-50")}>
      <div 
        className={cn(
          "w-full flex items-center gap-2 py-1.5 pr-2 text-[12px] transition-all relative cursor-pointer",
          isSelected 
            ? "bg-[#4a90e2]/10 text-[#e0e0e0] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[#4a90e2]" 
            : "text-[#888888] hover:bg-white/5 hover:text-[#e0e0e0]"
        )}
        onClick={(e) => onSelect(node.id, e.shiftKey || e.metaKey)}
        {...attributes}
        {...listeners}
      >
        <NodeIcon type={node.type} />
        <span className="truncate flex-1">{node.name}</span>
        
        <button 
          className={cn(
            "opacity-0 group-hover/item:opacity-100 transition-opacity p-1 hover:text-white",
            !node.visible && "opacity-100 text-[#4a90e2]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(node.id);
          }}
        >
          {node.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      </div>
      
      {children.length > 0 && (
        <div className="flex flex-col">
          {children.map(child => (
            <SortableLayerItem 
              key={child.id} 
              node={child} 
              depth={depth + 1}
              isSelected={isSelected} // This is wrong, should check child selection
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              allNodes={allNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Fixed version of SortableLayerItem to handle selection correctly
const SortableLayerItemFixed = ({ 
  node, 
  depth = 0, 
  selectedIds, 
  onSelect, 
  onToggleVisibility,
  onToggleLock,
  onUpdateName,
  allNodes
}: { 
  node: SceneNode; 
  depth?: number;
  selectedIds: string[];
  onSelect: (id: string, multi: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  allNodes: SceneNode[];
}) => {
  const isSelected = selectedIds.includes(node.id);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(node.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: node.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${depth * 12 + 16}px`,
    zIndex: isDragging ? 100 : 0
  };

  const children = allNodes.filter(n => n.parentId === node.id);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(node.name);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== node.name) {
      onUpdateName(node.id, editName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(node.name);
    }
  };

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div ref={setNodeRef} style={style} className={cn("group/item", isDragging && "opacity-50")}>
      <div 
        className={cn(
          "w-full flex items-center gap-2 py-1.5 pr-2 text-[12px] transition-all relative cursor-pointer",
          isSelected 
            ? "bg-[#4a90e2]/10 text-[#e0e0e0] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[#4a90e2]" 
            : "text-[#888888] hover:bg-white/5 hover:text-[#e0e0e0]"
        )}
        onClick={(e) => onSelect(node.id, e.shiftKey || e.metaKey)}
        onDoubleClick={handleDoubleClick}
        {...attributes}
        {...listeners}
      >
        <NodeIcon type={node.type} />
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="bg-[#181818] border border-[#4a90e2] rounded px-1 py-0 text-[12px] text-white w-full outline-none"
          />
        ) : (
          <span className="truncate flex-1">{node.name}</span>
        )}
        
        <button 
          className={cn(
            "opacity-0 group-hover/item:opacity-100 transition-opacity p-1 hover:text-white",
            node.locked && "opacity-100 text-[#4a90e2]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(node.id);
          }}
        >
          {node.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>

        <button 
          className={cn(
            "opacity-0 group-hover/item:opacity-100 transition-opacity p-1 hover:text-white",
            !node.visible && "opacity-100 text-[#4a90e2]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(node.id);
          }}
        >
          {node.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      </div>
      
      {children.length > 0 && (
        <div className="flex flex-col">
          {children.map(child => (
            <SortableLayerItemFixed 
              key={child.id} 
              node={child} 
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onUpdateName={onUpdateName}
              allNodes={allNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const LayersPanel: React.FC<LayersPanelProps> = ({ 
  nodes, 
  selectedIds, 
  onSelect, 
  onUpdateNode,
  onReorder,
  showGrid,
  onToggleGrid,
  onResetCamera
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = nodes.findIndex(n => n.id === active.id);
      const newIndex = nodes.findIndex(n => n.id === over.id);
      
      // Simple reorder for now. Real hierarchy DnD is complex.
      // We'll just move it in the flat list.
      onReorder(arrayMove(nodes, oldIndex, newIndex));
    }
  };

  const handleSelect = (id: string, multi: boolean) => {
    if (multi) {
      onSelect(selectedIds.includes(id) 
        ? selectedIds.filter(sid => sid !== id)
        : [...selectedIds, id]
      );
    } else {
      onSelect([id]);
    }
  };

  const rootNodes = nodes.filter(n => !n.parentId);

  return (
    <aside className="w-60 bg-[#1c1c1c] border-r border-[#2e2e2e] flex flex-col">
      <div className="px-4 py-3 border-b border-[#2e2e2e] flex items-center justify-between">
        <h2 className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest">Layers</h2>
        <span className="text-[10px] text-[#888888] opacity-50">{nodes.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={nodes.map(n => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {rootNodes.map((node) => (
              <SortableLayerItemFixed 
                key={node.id} 
                node={node} 
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onToggleVisibility={(id) => {
                  const node = nodes.find(n => n.id === id);
                  if (node) onUpdateNode(id, { visible: !node.visible });
                }}
                onToggleLock={(id) => {
                  const node = nodes.find(n => n.id === id);
                  if (node) onUpdateNode(id, { locked: !node.locked });
                }}
                onUpdateName={(id, name) => onUpdateNode(id, { name })}
                allNodes={nodes}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      
      <div className="mt-auto p-4 border-t border-[#2e2e2e] space-y-4">
        <div className="text-[#888888] font-semibold text-[11px] uppercase tracking-widest">Environment</div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-[#888888]">
            <span>Show Grid</span>
            <input 
              type="checkbox" 
              checked={showGrid} 
              onChange={onToggleGrid}
              className="accent-[#4a90e2] cursor-pointer" 
            />
          </div>

          <button 
            onClick={onResetCamera}
            className="w-full bg-white/5 hover:bg-white/10 text-[#888888] hover:text-[#e0e0e0] py-1.5 rounded text-[10px] font-bold tracking-wider transition-colors uppercase"
          >
            Reset Camera View
          </button>
        </div>
      </div>
    </aside>
  );
};
