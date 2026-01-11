/**
 * OpenAI Client with Phoenix Instrumentation
 */

import OpenAI from 'openai';

// ============================================================================
// CLIENT SETUP
// ============================================================================
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey && process.env.NODE_ENV !== 'production') {
    console.warn("⚠️ OPENAI_API_KEY is not set");
}

// Create OpenAI client - this will be automatically instrumented by Phoenix
export const openai = new OpenAI({
    apiKey: apiKey || 'dummy-key',
});

// Model Constants
export const OPENAI_MODELS = {
    DOCTOR: "gpt-4o",           // High reasoning for Doctor Mode
    GENERAL: "gpt-4o-mini",     // Cost effective for General Mode
    VISION: "gpt-4o-mini",      // Cost effective for images
    FAST: "gpt-4o-mini"         // For background tasks
} as const;

// Log that OpenAI client is ready for instrumentation
console.log("🤖 OpenAI client created - ready for Phoenix instrumentation");

