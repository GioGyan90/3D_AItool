import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { SceneNode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sceneNodeSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Display name of the node" },
    type: { 
      type: Type.STRING, 
      enum: ['box', 'sphere', 'cylinder', 'torus', 'plane', 'group', 'circle', 'rect', 'triangle', 'text', 'js_object'],
      description: "Geometric primitive type or 'js_object' for custom Three.js code." 
    },
    script: { 
      type: Type.STRING, 
      description: "Three.js script if type is 'js_object'. The script has access to THREE, 'color', and any variables defined in 'parameters' (e.g. isElite). A pre-defined 'group' is available to add meshes to. Example: 'const mat = new THREE.MeshBasicMaterial({color}); const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat); group.add(mesh);'" 
    },
    position: { 
      type: Type.ARRAY, 
      items: { type: Type.NUMBER },
      description: "[x, y, z] position"
    },
    rotation: { 
      type: Type.ARRAY, 
      items: { type: Type.NUMBER },
      description: "[x, y, z] rotation in radians"
    },
    scale: { 
      type: Type.ARRAY, 
      items: { type: Type.NUMBER },
      description: "[x, y, z] scale"
    },
    color: { type: Type.STRING, description: "HEX color code" },
    parameters: {
      type: Type.OBJECT,
      properties: {
        radius: { type: Type.NUMBER },
        width: { type: Type.NUMBER },
        height: { type: Type.NUMBER },
        depth: { type: Type.NUMBER },
        thickness: { type: Type.NUMBER, description: "Extrusion depth or thickness" },
        bevelRadius: { type: Type.NUMBER },
        text: { type: Type.STRING, description: "Text content if type is 'text'" },
        size: { type: Type.NUMBER, description: "Font size" },
        bend: { type: Type.NUMBER, description: "Bending factor (0 to 1)" },
        taper: { type: Type.NUMBER, description: "Tapering along Y axis" },
        stretch: { type: Type.NUMBER, description: "Stretching along Y axis" },
        inflate: { type: Type.NUMBER, description: "Inflation factor (push along normals)" },
        isElite: { type: Type.BOOLEAN, description: "Custom flag for advanced geometry" },
      }
    }
  },
  required: ['name', 'type', 'position', 'rotation', 'scale', 'color']
};

export const generateSceneNodes = async (prompt: string): Promise<Partial<SceneNode>[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ 
        role: 'user', 
        parts: [{ 
          text: `Generate a 3D scene: ${prompt}. 
          Return a JSON array using compact keys:
          n: Name, t: type, p: [x,y,z], r: [x,y,z], s: [x,y,z], c: HEX, js: script (if t='js_object')` 
        }] 
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
             type: Type.OBJECT,
             properties: {
               n: { type: Type.STRING },
               t: { type: Type.STRING },
               p: { type: Type.ARRAY, items: { type: Type.NUMBER } },
               r: { type: Type.ARRAY, items: { type: Type.NUMBER } },
               s: { type: Type.ARRAY, items: { type: Type.NUMBER } },
               c: { type: Type.STRING },
               js: { type: Type.STRING }
             },
             required: ['n', 't', 'p']
          }
        },
        systemInstruction: "You are a 3D modeling assistant. Use compact JSON shorthand (n,t,p,r,s,c,js) to optimize token usage. Output ONLY valid JSON."
      },
    });

    if (!response || !response.text) {
      throw new Error("Invalid response");
    }

    const raw = JSON.parse(response.text);
    return raw.map((item: any) => ({
      name: item.n || 'Object',
      type: (item.t || 'box') as any,
      position: item.p || [0,0,0],
      rotation: item.r || [0,0,0],
      scale: item.s || [1,1,1],
      color: item.c || '#ffffff',
      script: item.js || '',
      parameters: {}
    }));
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw error;
  }
};

// Helper to strip comments and minimize code for token saving
const cleanupCodeForAI = (code: string): string => {
  if (!code) return '';
  return code
    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1') // Remove comments
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();
};

export const decomposeNode = async (node: SceneNode, maxNodes: number = 20): Promise<Partial<SceneNode>[]> => {
  const isJsObject = node.type === 'js_object';
  // Use gemini-3.1-pro-preview for complex deconstruction/code analysis
  const modelToUse = "gemini-3.1-pro-preview"; 

  const cleanedScript = cleanupCodeForAI(node.script || '');

  const promptContext = isJsObject 
    ? `You are a professional Three.js developer. 
       Analyze this script for '${node.name}':
       \`\`\`javascript
       ${cleanedScript}
       \`\`\`
       
       TASK: Refactor this into a set of independent sub-layers.
       TOKEN-SAVING PROTOCOL: 
       Return a JSON array where each entry is a COMPACT representation:
       {
         "n": "Name",
         "t": "box" | "sphere" | "js_object" ...,
         "p": [x,y,z],
         "r": [x,y,z],
         "s": [x,y,z],
         "c": "#HEX",
         "js": "script string (only if type is js_object)",
         "params": { ... }
       }
       
       CRITICAL: 
       1. If a component is simple, use primitives (t: 'box', 'sphere' etc).
       2. If it's a code block, use t: 'js_object' and provide a clean 'js' fragment.
       3. Avoid repeating boilerplate. The 'js' fragment is executed in a context with THREE, group, color.`
    : `Deconstruct the 3D concept '${node.name}' into basic primitives using the COMPACT representation (n, t, p, r, s, c, params).`;

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("AI Request timed out. The model is taking too long to respond.")), 300000)
  );

  const aiPromise = (async () => {
    try {
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: [{ 
          role: 'user', 
          parts: [{ 
            text: `${promptContext}
            MAX: ${maxNodes}.
            REQUIRED: Return ONLY a valid JSON array using SHORTHAND keys (n, t, p, r, s, c, js, params).` 
          }] 
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                n: { type: Type.STRING },
                t: { type: Type.STRING },
                p: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                r: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                s: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                c: { type: Type.STRING },
                js: { type: Type.STRING },
                params: { type: Type.OBJECT }
              },
              required: ['n', 't', 'p']
            }
          },
          systemInstruction: "You are an efficiency-focused 3D deconstruction engine. Use shorthand keys to save tokens. Keep 'js' scripts minimal. Output only valid JSON."
        },
      });

      if (!response || !response.text) {
        throw new Error("Empty response from AI engine.");
      }

      const raw = JSON.parse(response.text);
      // Map back to SceneNode format
      return raw.map((item: any) => ({
        name: item.n || 'Unnamed',
        type: (item.t || 'box') as any,
        position: item.p || [0,0,0],
        rotation: item.r || [0,0,0],
        scale: item.s || [1,1,1],
        color: item.c || '#ffffff',
        script: item.js || '',
        parameters: item.params || {}
      }));
    } catch (e) {
      console.error("Internal Decompose Error:", e);
      throw e;
    }
  })();

  return Promise.race([aiPromise, timeoutPromise]) as Promise<Partial<SceneNode>[]>;
};

export const splitSelectionToLayer = async (name: string, selection: string): Promise<Partial<SceneNode>> => {
  const modelToUse = "gemini-3.1-pro-preview"; 

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: [{ 
        role: 'user', 
        parts: [{ 
          text: `Convert the following Three.js selection from '${name}' into a standalone SceneNode:
          \`\`\`javascript
          ${selection}
          \`\`\`
          
          TASK: Extract the primitive type, position, rotation, scale, and clean JS logic.
          RETURN ONLY COMPACT JSON: { n: "Name", t: "type", p: [x,y,z], r: [x,y,z], s: [x,y,z], c: "#HEX", js: "rest of logic" }` 
        }] 
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            n: { type: Type.STRING },
            t: { type: Type.STRING },
            p: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            r: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            s: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            c: { type: Type.STRING },
            js: { type: Type.STRING }
          },
          required: ['n', 't', 'p']
        },
        systemInstruction: "You are a professional 3D refactoring tool. Output only valid compact JSON (n,t,p,r,s,c,js)."
      },
    });

    if (!response || !response.text) {
      throw new Error("Invalid response");
    }

    const item = JSON.parse(response.text);
    return {
      name: item.n || 'Extracted Layer',
      type: (item.t || 'js_object') as any,
      position: item.p || [0,0,0],
      rotation: item.r || [0,0,0],
      scale: item.s || [1,1,1],
      color: item.c || '#ffffff',
      script: item.js || '',
      parameters: {}
    };
  } catch (error) {
    console.error("Split Selection Error:", error);
    throw error;
  }
};
