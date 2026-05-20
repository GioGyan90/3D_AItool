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
  Hexagon,
  Star,
  ChevronDown,
  Lightbulb,
  Type,
  Code,
  Camera,
  ChevronRight,
  Combine,
  Scaling,
  Maximize2,
  CircleDot,
  Minimize2
} from 'lucide-react';

const TrapezoidIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 6L3 18H21L17 6H7Z" />
  </svg>
);

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
  onResetCamera: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  activeTool: string;
  onToolChange: (tool: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ 
  onAddShape, 
  onDeleteSelected, 
  onDuplicate, 
  onUndo,
  onRedo,
  onResetCamera,
  canUndo,
  canRedo,
  hasSelection,
  activeTool,
  onToolChange
}) => {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger 
          onClick={() => onToolChange('select')}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            "w-8 h-8 rounded outline-none",
            activeTool === 'select' ? "text-indigo-400 bg-indigo-400/10" : "text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5"
          )}
        >
          <MousePointer2 className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>Selection Tool</TooltipContent>
      </Tooltip>

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
          <DropdownMenuItem onClick={() => onAddShape('polygon')} className="text-xs hover:bg-white/5 cursor-pointer gap-2">
            <Hexagon className="w-3.5 h-3.5" /> Polygon / Star
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

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger render={
            <DropdownMenuTrigger className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              "w-8 h-8 rounded outline-none",
              activeTool !== 'select' ? "text-indigo-400 bg-indigo-400/10" : "text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5"
            )}>
              <div className="w-full h-full flex items-center justify-center">
                <TrapezoidIcon className="w-4 h-4" />
              </div>
            </DropdownMenuTrigger>
          } />
          <TooltipContent>Deformation Tools</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="bg-[#181818] border-[#2e2e2e] text-[#e0e0e0] w-48">
          <div className="px-2 py-1.5 text-[10px] font-bold text-[#555] uppercase tracking-wider">Deform</div>
          <DropdownMenuItem 
            onClick={() => onToolChange(activeTool === 'twist' ? 'select' : 'twist')} 
            className={cn(
              "text-xs hover:bg-white/5 cursor-pointer gap-2",
              activeTool === 'twist' && "bg-white/10 text-indigo-100"
            )}
          >
            <Combine className="w-3.5 h-3.5" /> Twist Tool
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onToolChange(activeTool === 'taper' ? 'select' : 'taper')} 
            className={cn(
              "text-xs hover:bg-white/5 cursor-pointer gap-2",
              activeTool === 'taper' && "bg-white/10 text-indigo-100"
            )}
          >
            <TrapezoidIcon className="w-3.5 h-3.5" /> Taper Tool
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onToolChange(activeTool === 'stretch' ? 'select' : 'stretch')} 
            className={cn(
              "text-xs hover:bg-white/5 cursor-pointer gap-2",
              activeTool === 'stretch' && "bg-white/10 text-indigo-100"
            )}
          >
            <Scaling className="w-3.5 h-3.5" /> Stretch Tool
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onToolChange(activeTool === 'inflate' ? 'select' : 'inflate')} 
            className={cn(
              "text-xs hover:bg-white/5 cursor-pointer gap-2",
              activeTool === 'inflate' && "bg-white/10 text-indigo-100"
            )}
          >
            <CircleDot className="w-3.5 h-3.5" /> Inflate Tool
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onToolChange(activeTool === 'bevel' ? 'select' : 'bevel')} 
            className={cn(
              "text-xs hover:bg-white/5 cursor-pointer gap-2",
              activeTool === 'bevel' && "bg-white/10 text-indigo-100"
            )}
          >
            <Minimize2 className="w-3.5 h-3.5" /> Bevel Tool (倒角)
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

      <div className="w-px h-4 bg-[#2e2e2e] mx-1" />

      <Tooltip>
        <TooltipTrigger 
          onClick={onResetCamera}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            "w-8 h-8 text-[#888888] hover:text-[#e0e0e0] hover:bg-white/5 rounded"
          )}
        >
          <div className="relative flex items-center justify-center">
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="w-5 h-5"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center mt-1">
              <RotateCcw style={{ width: '5px', height: '5px' }} className="text-[#888888]" strokeWidth={3} />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>Reset Camera</TooltipContent>
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
