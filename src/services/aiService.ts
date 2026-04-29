import { GoogleGenAI, Type } from "@google/genai";
import { SceneNode, NodeType } from "../types";

// Types for the AI Plan
export interface AIStep {
  description: string;
  type: 'add' | 'boolean' | 'material' | 'group' | 'update';
  details?: any; // To be filled after confirmation
}

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

const model = "gemini-3-flash-preview";

export const aiService = {
  /**
   * Given a user prompt, break it down into a list of high-level steps.
   */
  async generatePlan(prompt: string, currentNodes: SceneNode[]): Promise<AIStep[]> {
    const systemInstruction = `You are a 3D modeling assistant for a CAD-style editor. 
    Users will give tasks like "build a house" or "make a futuristic chair".
    Break these complex tasks down into a sequence of implementation steps.
    Use only these basic operations:
    1. 'add': create a basic primitive (box, sphere, cylinder, torus, circle, rect, triangle, plane).
    2. 'boolean': perform union, subtract, or intersect on EXISTING nodes or new ones. (Union, subtract, intersect, xor).
    3. 'material': change colors or textures.
    4. 'group': organize parts.
    5. 'update': general scene manipulation: move/scale existing objects, OR hide/show layers to clean up the workspace.

    Return only a JSON array of steps. Each step MUST have a 'description' (in Chinese) and a 'type'.
    DO NOT provide detailed parameters yet, ONLY descriptions of what needs to be done.
    Keep the plan concise (3-10 steps typically).
    
    Example response:
    [
      { "description": "添加一个大型方块作为地基", "type": "add" },
      { "description": "在中心放置一个球体进行布尔相减", "type": "boolean" },
      { "description": "隐藏掉不需要的辅助图层以保持画布整洁", "type": "update" }
    ]`;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['add', 'boolean', 'material', 'group', 'update'] }
              },
              required: ["description", "type"]
            }
          }
        }
      });

      return JSON.parse(response.text || '[]');
    } catch (error) {
      console.error("AI Plan generation failed:", error);
      return [];
    }
  },

  /**
   * For a specific step that was confirmed, generate the actual parameters.
   */
  async generateStepAction(
    step: AIStep, 
    allSteps: AIStep[], 
    stepIndex: number, 
    prompt: string,
    currentNodes: SceneNode[],
    screenshot?: string | null
  ): Promise<any> {
    const systemInstruction = `You are an expert 3D modeler. 
    The user is building a model based on the prompt: "${prompt}".
    This is overall plan: ${JSON.stringify(allSteps.map(s => s.description))}.
    We are currently on Step ${stepIndex + 1}: "${step.description}".
    
    Current step type is: '${step.type}'.
    
    Instructions for generating the action:
    - If type is 'add': return node properties. 'type' MUST be one of the primitive types.
    - If type is 'boolean': return 'op', 'nameA', and 'nameB'.
    - If type is 'material': return 'name', 'color', and 'material' settings.
    - If type is 'update': return { name: string, properties: { position, scale, rotation, visible: boolean } } for moving/resizing or hiding nodes.
    
    Primitives: 'box', 'sphere', 'cylinder', 'torus', 'plane', 'circle', 'rect', 'triangle'.
    
    Analyze the current visual state from the provided screenshot if available to ensure the objects are aligned and sized correctly as requested.
    
    Current scene nodes to reference: ${JSON.stringify(currentNodes.map(n => ({ id: n.id, name: n.name, type: n.type, visible: n.visible })))}
    `;

    const parts: any[] = [{ text: `Generate action for step: ${step.description}` }];
    if (screenshot) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: screenshot.split(',')[1]
        }
      });
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              // Common fields
              actionType: { type: Type.STRING }, // 'add', 'boolean', 'update' etc.
              
              // 'add' & 'update' fields
              type: { type: Type.STRING, description: "Only for 'add'. The primitive type." },
              name: { type: Type.STRING, description: "Descriptive name or search pattern for 'update'." },
              position: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x,y,z]" },
              rotation: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x,y,z]" },
              scale: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[x,y,z]" },
              color: { type: Type.STRING, description: "Hex color" },
              visible: { type: Type.BOOLEAN, description: "Visibility toggle for 'update'" },
              parameters: { type: Type.OBJECT },
              
              // 'boolean' fields
              op: { type: Type.STRING, enum: ['union', 'subtract', 'intersect', 'xor'] },
              nameA: { type: Type.STRING },
              nameB: { type: Type.STRING },
              
              // 'material' fields
              material: { 
                type: Type.OBJECT,
                properties: {
                  metalness: { type: Type.NUMBER },
                  roughness: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      });
      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error("AI Step generation failed:", error);
      return null;
    }
  }
};
