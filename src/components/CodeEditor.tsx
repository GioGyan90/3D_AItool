import React, { useState, useEffect } from 'react';
import { X, Check, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeEditorProps {
  initialCode: string;
  onSave: (code: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ initialCode, onSave, onCancel, isOpen }) => {
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    if (isOpen) {
      setCode(initialCode);
    }
  }, [isOpen, initialCode]);

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
            value={code || ''}
            onChange={(e) => setCode(e.target.value)}
            placeholder={defaultPlaceholder}
            className="w-full h-[400px] bg-[#0e0e0e] text-indigo-300 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed"
            spellCheck={false}
          />
        </div>

        <div className="px-4 py-3 border-t border-[#2e2e2e] flex items-center justify-end gap-3 bg-[#181818]">
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
  );
};
