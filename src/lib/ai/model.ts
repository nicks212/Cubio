import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

/** Shared Gemini model instance used across all AI functions. */
export const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2000,
  },
  // Sales assistant replies don't need chain-of-thought reasoning.
  // Disabling thinking cuts ~95% of cost per interaction.
  // @ts-expect-error — thinkingConfig is valid for gemini-2.5-flash but not yet in SDK types
  thinkingConfig: { thinkingBudget: 0 },
});
