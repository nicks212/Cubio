import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

/** Shared Gemini model instance used across all AI functions. */
export const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 600,
    // Disable thinking tokens — a conversational sales bot doesn't need internal
    // reasoning. Thinking tokens cost $3.50/1M vs $0.15/1M for standard input.
    thinkingConfig: { thinkingBudget: 0 },
  },
});
