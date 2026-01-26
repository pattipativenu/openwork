
"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_TTS_MODEL } from "@/lib/gemini";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateSpeech(text: string, voiceName: string = 'Kore'): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_TTS_MODEL });

        // As per documentation for Gemini TTS
        // https://ai.google.dev/gemini-api/docs/speech-generation

        // Note: The Node SDK might differ slightly in structure from the REST API examples,
        // but typically follows generateContent structure.
        // If specific TTS methods aren't in the typed SDK yet, we might use the generic generateContent
        // with specific config parameters.

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName
                        }
                    }
                }
            } as any // Cast to any because the types might not be fully updated in the installed SDK version
        });

        const response = await result.response;
        // The audio data sits in parts[0].inlineData.data usually
        // But for responseModalities AUDIO, it might be structured differently.
        // Checking documentation: response.candidates[0].content.parts[0].inlineData.data

        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error("No audio candidates returned");
        }

        const part = candidates[0].content.parts[0];
        if (!part || !part.inlineData || !part.inlineData.data) {
            throw new Error("No audio data found in response");
        }

        return part.inlineData.data;

    } catch (error) {
        console.error("Gemini TTS Error:", error);
        throw error;
    }
}
