import { GoogleGenAI, Type } from "@google/genai";
import { SceneNode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sceneNodeSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Display name of the node" },
    type: { 
      type: Type.STRING, 
      enum: ['box', 'sphere', 'cylinder', 'torus', 'plane', 'group', 'circle', 'rect', 'triangle', 'text'],
      description: "Geometric primitive type. Use 'text' for characters or words." 
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
      }
    }
  },
  required: ['name', 'type', 'position', 'rotation', 'scale', 'color']
};

export const generateSceneNodes = async (prompt: string): Promise<Partial<SceneNode>[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a list of 3D primitive nodes to form the following: ${prompt}. 
      Return only a JSON array of nodes. Use basic primitives to construct complex shapes.
      You can use the 'text' type for words or letters, specifying 'text' and 'thickness' in parameters.
      Keep the scale reasonable (around 1 unit). Place them centrally.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: sceneNodeSchema
        },
        systemInstruction: "You are a 3D modeling assistant that generates scene structures using basic primitives. You output only valid JSON matching the provided schema."
      },
    });

    const result = JSON.parse(response.text);
    return result;
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw error;
  }
};
