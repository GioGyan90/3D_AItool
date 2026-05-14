import React, { useState, useEffect } from 'react';
import { X, Check, Code, Scissors, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { splitSelectionToLayer } from '../services/aiService';

interface CodeEditorProps {
  nodeName: string;
  initialCode: string;
  onSave: (code: string) => void;
  onCancel: () => void;
  onExtractLayer?: (newNode: Partial<SceneNode>) => void;
  isOpen: boolean;
}

import { SceneNode } from '../types';

export const CodeEditor: React.FC<CodeEditorProps> = ({ nodeName, initialCode, onSave, onCancel, onExtractLayer, isOpen }) => {
  const [code, setCode] = useState(initialCode);
  const [isExtracting, setIsExtracting] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCode(initialCode);
    }
  }, [isOpen, initialCode]);

  const handleExtractSelection = async () => {
    if (!textareaRef.current || isExtracting) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selection = code.substring(start, end);

    if (!selection.trim()) {
      alert("Please select a block of code to extract.");
      return;
    }

    setIsExtracting(true);
    try {
      const newNode = await splitSelectionToLayer(nodeName, selection);
      
      // Remove the selection from the code and replace with a comment
      const newCode = code.substring(0, start) + `// Extracted to layer: ${newNode.name}\n` + code.substring(end);
      setCode(newCode);
      
      if (onExtractLayer) {
        onExtractLayer(newNode);
      }
    } catch (e) {
      alert("Failed to extract layer. Check console for details.");
    } finally {
      setIsExtracting(false);
    }
  };

  if (!isOpen) return null;

  const defaultPlaceholder = `// Example Three.js script
// 'THREE' is available globally
// Return a Object3D (Mesh, Group, etc.)

const geometry = new THREE.TorusKnotGeometry(0.5, 0.1, 100, 16);
const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
const mesh = new THREE.Mesh(geometry, material);

return mesh;
`;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#1c1c1c] border border-[#2e2e2e] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-4 py-3 border-b border-[#2e2e2e] flex items-center justify-between bg-[#181818]">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-indigo-400" />
            <h3 className="text-[#e0e0e0] text-xs font-bold uppercase tracking-wider">JS Object Script Editor</h3>
          </div>
          <button onClick={onCancel} className="text-[#888] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 p-0 relative">
          <textarea
            ref={textareaRef}
            value={code || ''}
            onChange={(e) => setCode(e.target.value)}
            placeholder={defaultPlaceholder}
            className="w-full h-[400px] bg-[#0e0e0e] text-indigo-300 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed"
            spellCheck={false}
          />
        </div>

        <div className="px-4 py-3 border-t border-[#2e2e2e] flex items-center justify-between gap-3 bg-[#181818]">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExtractSelection}
              disabled={isExtracting}
              className="text-[10px] h-7 bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10 gap-1.5 px-2"
            >
              {isExtracting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Scissors className="w-3 h-3" />}
              AI Extract Selection to Layer
            </Button>
            <span className="text-[9px] text-[#555] italic hidden sm:inline">Highlight code to extract</span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={onCancel}
              className="text-xs h-8 text-[#888] hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => onSave(code)}
              className="text-xs h-8 bg-indigo-600 hover:bg-indigo-500 text-white border-none gap-2 px-4"
            >
              <Check className="w-3.5 h-3.5" />
              Save & Update
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
