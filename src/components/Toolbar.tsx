import React from 'react';
import { 
  Plus,
  MousePointer2,
  Trash2,
  RotateCcw,
  RotateCw,
  Copy,
  Box,
  Circle,
  Cylinder,
  Torus,
  Square,
  Layers as ExtrudeIcon,
  Triangle,
  ChevronDown,
  Lightbulb,
  Type,
  Code
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NodeType } from '../types';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  onAddShape: (type: NodeType) => void;
  onDeleteSelected: () => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ 
  onAddShape, 
  onDeleteSelected, 
  onDuplicate, 
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasSelection 
}) => {
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          "w-8 h-8 text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5 rounded outline-none"
        )}>
          <Plus className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-[#181818] border-[#2e2e2e] text-[#e0e0e0] w-48">
          <div className="px-2 py-1.5 text-[10px] font-bold text-[#555] uppercase tracking-wider">3D Shapes</div>
          <DropdownMenuItem onClick={() => onAddShape('box')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Box className="w-3.5 h-3.5" /> Cube
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('sphere')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Circle className="w-3.5 h-3.5" /> Sphere
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('cylinder')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Cylinder className="w-3.5 h-3.5" /> Cylinder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('torus')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Torus className="w-3.5 h-3.5" /> Torus
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('text')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Type className="w-3.5 h-3.5" /> 3D Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('extruded')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <ExtrudeIcon className="w-3.5 h-3.5" /> Path (Extrude)
          </DropdownMenuItem>
          
          <div className="h-px bg-[#2e2e2e] my-1" />
          <div className="px-2 py-1.5 text-[10px] font-bold text-[#555] uppercase tracking-wider">2D Shapes</div>
          <DropdownMenuItem onClick={() => onAddShape('circle')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Circle className="w-3.5 h-3.5" /> Circle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('rect')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Square className="w-3.5 h-3.5" /> Rectangle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('triangle')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Triangle className="w-3.5 h-3.5" /> Triangle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddShape('plane')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Square className="w-3.5 h-3.5" /> Plane (Infinite)
          </DropdownMenuItem>

          <div className="h-px bg-[#2e2e2e] my-1" />
          <div className="px-2 py-1.5 text-[10px] font-bold text-[#555] uppercase tracking-wider">Lighting</div>
          <DropdownMenuItem onClick={() => onAddShape('pointLight')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400/70" /> Point Light
          </DropdownMenuItem>

          <div className="h-px bg-[#2e2e2e] my-1" />
          <div className="px-2 py-1.5 text-[10px] font-bold text-[#555] uppercase tracking-wider">Advanced</div>
          <DropdownMenuItem onClick={() => onAddShape('js_object')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Code className="w-3.5 h-3.5 text-indigo-400" /> JS Object
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-4 bg-[#2e2e2e] mx-1" />

      <Tooltip>
        <TooltipTrigger 
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            "w-8 h-8 rounded transition-colors",
            canUndo ? "text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5" : "text-[#888888]/30 cursor-not-allowed"
          )}
        >
          <RotateCcw className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger 
          onClick={onRedo}
          disabled={!canRedo}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            "w-8 h-8 rounded transition-colors",
            canRedo ? "text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5" : "text-[#888888]/30 cursor-not-allowed"
          )}
        >
          <RotateCw className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Y / Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      {hasSelection && (
        <>
          <div className="w-px h-4 bg-[#2e2e2e] mx-1" />
          
          <Tooltip>
            <TooltipTrigger 
              onClick={onDuplicate}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                "w-8 h-8 text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5 rounded"
              )}
            >
              <Copy className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>Duplicate (Ctrl+D)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger 
              onClick={onDeleteSelected}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                "w-8 h-8 text-red-400/70 hover:text-red-400 hover:bg-red-400/10 rounded"
              )}
            >
              <Trash2 className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>Delete Selection</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
};
