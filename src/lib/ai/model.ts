import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerateContentResult } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// Internal model instance — do NOT call .generateContent() on this directly.
// Use the aiGenerateContent() wrapper below which injects thinkingBudget: 0.
const _model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 400,
  },
});

/**
 * Drop-in replacement for model.generateContent() that guarantees
 * thinkingBudget: 0 is sent to the API on every request.
 *
 * Background: SDK v0.24.1 silently drops thinkingConfig when it is set on the
 * model instance via getGenerativeModel(). Passing it inside the request body
 * (contents form) IS forwarded because the SDK JSON-serialises the entire
 * object verbatim. This wrapper centralises that pattern.
 */
export async function aiGenerateContent(prompt: string): Promise<GenerateContentResult> {
  return _model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // @ts-expect-error — thinkingConfig is a valid Gemini API field but not yet typed in SDK v0.24.1
    thinkingConfig: { thinkingBudget: 0 },
  });
}
