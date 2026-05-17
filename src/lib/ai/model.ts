import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

/** Shared Gemini model instance used across all AI functions. */
export const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
});
