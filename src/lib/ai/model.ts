import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

/**
 * Shared Gemini model instance.
 *
 * thinkingConfig must be nested inside generationConfig — that is the correct
 * Gemini API field path. The SDK forwards the entire generationConfig object
 * verbatim, so thinkingBudget: 0 reaches the API and disables thinking tokens.
 *
 * The `as any` cast is required because SDK v0.24.1 types don't include
 * thinkingConfig in GenerationConfig yet, even though the API accepts it.
 */
export const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generationConfig: {
    temperature: 0.6,
    maxOutputTokens: 700,
    thinkingConfig: { thinkingBudget: 0 },
  } as any,
});
