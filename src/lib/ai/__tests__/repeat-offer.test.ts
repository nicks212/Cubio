import { describe, it, expect } from 'vitest';
import { isRepeatedRequest } from '../state';
import { buildCraftShopSystemPrompt } from '../prompts/craft_shop';
import type { ProductContext } from '../types';

/**
 * Regression guard for the "AI keeps offering random products" bug.
 *
 * Production log (Friday Night): a customer asked three times for a Tibetan singing bowl
 * (თასი) — not stocked — and each turn the assistant dumped a NEW pile of unrelated
 * "esoteric" items. The fix has two halves:
 *   1. isRepeatedRequest() spots that the customer is restating the same ask (language-agnostic).
 *   2. When that's true AND nothing matched, the craft prompt suppresses the product list and
 *      switches to a natural "we still don't have it" reply (no re-offer).
 */

describe('isRepeatedRequest — customer restating the same unstocked ask', () => {
  const history = [
    { role: 'user', content: 'ტიბეტური თასი ყველაზე დიდი ზომა რომელი გაქვთ' },
    { role: 'ai', content: 'ბოდიში, თასი ამჟამად არ გვაქვს.' },
  ];

  it('same item asked again (bare "თასი") → true', () => {
    expect(isRepeatedRequest(history, 'თასი')).toBe(true);
  });

  it('same item asked again (with the "Tibetan" qualifier) → true', () => {
    expect(isRepeatedRequest(history, 'ტიბეტური თასი')).toBe(true);
  });

  it('a DIFFERENT product this turn → false (shared verb "გაქვთ" alone is not a repeat)', () => {
    const h = [{ role: 'user', content: 'ტარო გაქვთ?' }, { role: 'ai', content: '...' }];
    expect(isRepeatedRequest(h, 'სანთელი გაქვთ?')).toBe(false);
  });

  it('no prior user message → false', () => {
    expect(isRepeatedRequest([], 'თასი')).toBe(false);
  });

  it('bare emoji / ack (no content words) → false', () => {
    expect(isRepeatedRequest(history, '👍')).toBe(false);
  });
});

describe('craft prompt — offerExhausted suppresses every product section', () => {
  // Nothing matched this turn (the gate already dropped the diffuse cluster).
  const ctx = {
    products: [],
    matchedProducts: [],
    businessDescription: 'მისამართი ია კარგარეთელის 11, მუშაობს 3-9, ტელ 579141484.',
  } as unknown as ProductContext;

  it('offerExhausted:true → ALREADY ANSWERED present, no product SECTION at all', () => {
    const prompt = buildCraftShopSystemPrompt(ctx, 'თასი', { offerExhausted: true, replyLanguage: 'ka' });
    expect(prompt).toContain('ALREADY ANSWERED');
    // The standalone product-list section (`\n\nPRODUCTS:\n…`) and the similar/no-match
    // blocks are all gone. (Bare "PRODUCTS:" also appears inside CATALOG RULE prose, so we
    // match the section header specifically.)
    expect(prompt).not.toContain('\n\nPRODUCTS:\n');
    expect(prompt).not.toContain('SIMILAR OPTIONS');
    expect(prompt).not.toContain('NO MATCH');
    // COMPANY INFO still available so the AI can invite them to visit/call.
    expect(prompt).toContain('COMPANY INFO');
  });

  it('offerExhausted:false with no matches → normal NO MATCH flow (not the exhausted block)', () => {
    const prompt = buildCraftShopSystemPrompt(ctx, 'თასი', { offerExhausted: false, replyLanguage: 'ka' });
    expect(prompt).not.toContain('ALREADY ANSWERED');
    expect(prompt).toContain('NO MATCH');
    expect(prompt).toContain('\n\nPRODUCTS:\n');
  });
});
