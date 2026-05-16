import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
});

function detectGeorgian(text: string): boolean {
  return /[\u10D0-\u10FF]/.test(text);
}

interface ApartmentContext {
  apartments: Array<{
    apartment_number: string;
    size_sq_m: number;
    floor: number;
    rooms_quantity: number;
    price_per_sq_m: number;
    total_price: number;
    status: string;
    project?: { name: string } | null;
  }>;
  businessDescription: string | null;
}

interface ProductContext {
  products: Array<{
    name: string;
    price: number;
    category?: string | null;
    zodiac_compatibility?: string[] | null;
    birthstones?: string | null;
    material?: string | null;
    in_stock: boolean;
  }>;
  businessDescription: string | null;
}

export type BusinessContext = ApartmentContext | ProductContext;

export async function detectIntent(message: string): Promise<{
  intent: 'inquiry' | 'availability' | 'price' | 'recommendation' | 'other';
  params: Record<string, string | number | string[]>;
}> {
  const prompt = `Analyze this customer message and extract intent. Respond with JSON only.
Message: "${message}"
Return: { "intent": "inquiry|availability|price|recommendation|other", "params": {} }
For real estate: params may include rooms, floor, budget, size
For craft shop: params may include zodiac, birthstone, material, budget`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const json = text.replace(/```json\n?|\n?```/g, '');
    return JSON.parse(json);
  } catch {
    return { intent: 'other', params: {} };
  }
}

export async function generateReply(
  message: string,
  context: BusinessContext,
  businessType: 'real_estate' | 'craft_shop',
  conversationHistory: Array<{ role: string; content: string }> = [],
): Promise<string> {
  const isGeorgian = detectGeorgian(message);
  const lang = isGeorgian ? 'Georgian' : 'English';

  const contextStr = businessType === 'real_estate'
    ? `Available apartments:\n${(context as ApartmentContext).apartments
        .filter(a => a.status === 'vacant')
        .slice(0, 10)
        .map(a => `- Apt ${a.apartment_number}: ${a.rooms_quantity}BR, ${a.size_sq_m}m², floor ${a.floor}, $${a.total_price.toLocaleString()} (${a.project?.name ?? ''})`)
        .join('\n')}`
    : `Available products:\n${(context as ProductContext).products
        .filter(p => p.in_stock)
        .slice(0, 10)
        .map(p => `- ${p.name}: $${p.price}, zodiac: ${p.zodiac_compatibility?.join(',') ?? 'all'}, material: ${p.material ?? 'N/A'}`)
        .join('\n')}`;

  const businessDesc = context.businessDescription
    ? `\nBusiness information:\n${context.businessDescription}`
    : '';

  const historyStr = conversationHistory.slice(-6)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `You are a helpful AI sales assistant for a ${businessType === 'real_estate' ? 'real estate company' : 'craft jewelry shop'}.
Respond in ${lang}. Be concise, friendly, and helpful.
${businessDesc}

${contextStr}

${historyStr ? `Conversation history:\n${historyStr}\n` : ''}
Customer: ${message}

Respond naturally. If asked about something not in the context, politely say you'll check and get back to them.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('AI generateReply error:', err);
    return isGeorgian
      ? 'გთხოვთ მოთმინება, ცოტა ხანში გიპასუხებთ.'
      : 'Thank you for your message. We will get back to you shortly.';
  }
}

// ── Lead / Escalation Detection ───────────────────────────────────────────────

export interface LeadDetection {
  isLead: boolean;
  summary: string;
  meetingDate: string | null;
  meetingNotes: string | null;
}

export interface EscalationDetection {
  isEscalation: boolean;
  summary: string;
}

/**
 * Analyse a conversation (last 10 messages) to decide if a lead should be captured.
 * A lead is captured when the customer explicitly wants to buy, visit, or schedule a meeting.
 */
export async function detectLead(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
): Promise<LeadDetection> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `Analyze this conversation for sales lead signals. Respond with JSON only, no markdown.
Business type: ${businessType}
Conversation:
${historyStr}

A lead exists when the customer clearly expresses intent to:
- (real_estate) visit an apartment, schedule a showing, or buy a unit
- (craft_shop) purchase a product, ask for payment/delivery info, or request an order

Return:
{
  "isLead": boolean,
  "summary": "2-3 sentence summary of what the customer wants and their key requirements",
  "meetingDate": "preferred date/time mentioned by customer, or null",
  "meetingNotes": "any specific requests about the meeting/visit, or null"
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    const parsed = JSON.parse(raw) as LeadDetection;
    return parsed;
  } catch {
    return { isLead: false, summary: '', meetingDate: null, meetingNotes: null };
  }
}

/**
 * Analyse a conversation to decide if an escalation is needed.
 * Escalation triggers: anger, repeated frustration, insults, threats, or repeated unanswered questions.
 */
export async function detectEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<EscalationDetection> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `Analyze this conversation for customer escalation signals. Respond with JSON only, no markdown.
Conversation:
${historyStr}

An escalation is needed when the customer is: angry, repeatedly frustrated, using offensive language, threatening to complain, or asking the same question multiple times without resolution.

Return:
{
  "isEscalation": boolean,
  "summary": "2-3 sentence summary of why the customer is upset and what they need"
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    const parsed = JSON.parse(raw) as EscalationDetection;
    return parsed;
  } catch {
    return { isEscalation: false, summary: '' };
  }
}

export async function extractLeadData(conversationText: string): Promise<{
  name?: string;
  phone?: string;
  email?: string;
  interested_in?: string;
  budget?: number;
}> {
  const prompt = `Extract lead information from this conversation. Respond with JSON only.
Conversation: "${conversationText}"
Return: { "name": "", "phone": "", "email": "", "interested_in": "", "budget": null }`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function recommendApartments(
  requirements: { rooms?: number; maxBudget?: number; floor?: number },
  apartments: ApartmentContext['apartments'],
) {
  const candidates = apartments
    .filter(a => a.status === 'vacant')
    .filter(a => !requirements.rooms || a.rooms_quantity === requirements.rooms)
    .filter(a => !requirements.maxBudget || a.total_price <= requirements.maxBudget)
    .filter(a => !requirements.floor || a.floor === requirements.floor)
    .slice(0, 5);
  return candidates;
}

export async function recommendProducts(
  zodiacSign: string | null,
  products: ProductContext['products'],
) {
  return products
    .filter(p => p.in_stock)
    .filter(p => !zodiacSign || !p.zodiac_compatibility?.length || p.zodiac_compatibility.includes(zodiacSign.toLowerCase()))
    .slice(0, 5);
}
