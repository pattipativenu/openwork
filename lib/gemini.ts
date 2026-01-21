import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set in environment variables");
}

export const genAI = new GoogleGenerativeAI(apiKey || "");

// Model mappings based on user request "Gemini 3 Flash/Pro"
// Using Gemini 2.0 Experimental models as the latest available versions matching the request intent
export const GEMINI_FLASH_MODEL = "gemini-2.0-flash-exp";
export const GEMINI_PRO_MODEL = "gemini-2.0-pro-exp";

export const generationConfig: GenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

/**
 * Helper to generate JSON using Gemini.
 * Forces responseMimeType to 'application/json' and parses the result.
 */
export async function generateJSON<T = any>(
  prompt: string,
  modelName: string = GEMINI_FLASH_MODEL,
  temperature: number = 0.1
): Promise<T> {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature,
      }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Gemini JSON generation error:", error);
    throw error;
  }
}
