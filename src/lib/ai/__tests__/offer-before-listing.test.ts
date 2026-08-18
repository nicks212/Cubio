import { describe, it, expect } from 'vitest';
import { buildCraftShopSystemPrompt } from '../prompts/craft_shop';
import { AFFIRMATIVE_RE } from '../signals';
import { buildGlobalSystemPrompt } from '../prompts/global';
import type { ProductContext } from '../types';

/**
 * Regression guard for "if we don't have it, ASK before offering something else".
 *
 * Production log (Friday Night): asked for a rudraksha, the assistant replied "we don't
 * have rudraksha" and in the same breath listed a mala and an amethyst the customer had
 * never expressed interest in. The rule is two turns, not one:
 *
 *   turn 1 — say we don't carry it, ask whether they'd like to see something close
 *   turn 2 — only if they say yes, present the items
 *
 * The guarantee is structural, not just instructional: on turn 1 the product names are
 * withheld from the prompt entirely, so there is nothing for the model to list even if
 * it wanted to. The pipeline remembers them and passes them back with
 * alternativesAccepted once the customer agrees.
 */

const ctx = (over: Partial<ProductContext> = {}): ProductContext => ({
  products: [],
  matchedProducts: [
    { name: 'ლოტოსის ყვავილი • მალა', price: 55, in_stock: true, category: 'სამკაული' },
    { name: 'ამეთვისტო', price: 10, in_stock: true, category: 'მინერალი' },
  ],
  businessDescription: 'მისამართი ია კარგარეთელის 11, მუშაობს 3-9, ტელ 579141484.',
  // Only same-category alternatives were found — no direct match for what was asked.
  categoryFallbackHits: 2,
  ...over,
} as ProductContext);

describe('craft prompt — same-category alternatives are withheld until asked for', () => {
  it('turn 1: no product section, no photo keys, and an explicit ask', () => {
    const prompt = buildCraftShopSystemPrompt(ctx(), 'რუდრაკშა თუ გაქვთ?', { replyLanguage: 'ka' });

    expect(prompt).toContain('ASK BEFORE OFFERING ANYTHING ELSE');
    // Structural guarantee: the names are simply not in the prompt.
    expect(prompt).not.toContain('\n\nPRODUCTS:\n');
    expect(prompt).not.toContain('ლოტოსის ყვავილი');
    expect(prompt).not.toContain('ამეთვისტო');
    expect(prompt).not.toContain('PHOTO KEYS');
    // It still knows where to send them if they'd rather visit.
    expect(prompt).toContain('COMPANY INFO');
  });

  it('turn 2: after the customer says yes, the held-back products are presented', () => {
    const prompt = buildCraftShopSystemPrompt(ctx(), 'კი', {
      replyLanguage: 'ka',
      alternativesAccepted: true,
    });

    expect(prompt).toContain('THEY SAID YES');
    expect(prompt).toContain('\n\nPRODUCTS:\n');
    expect(prompt).toContain('ლოტოსის ყვავილი • მალა');
    expect(prompt).toContain('ამეთვისტო');
    expect(prompt).not.toContain('ASK BEFORE OFFERING');
  });

  it('a genuine direct match is presented immediately — the gate does not fire', () => {
    const direct = ctx({ categoryFallbackHits: 0, tokenRetrievalHits: 2 });
    const prompt = buildCraftShopSystemPrompt(direct, 'ამეთვისტო გაქვთ?', { replyLanguage: 'ka' });

    expect(prompt).not.toContain('ASK BEFORE OFFERING');
    expect(prompt).toContain('\n\nPRODUCTS:\n');
    expect(prompt).toContain('ამეთვისტო');
  });

  it('a vector match is a direct match too — not withheld', () => {
    const viaVector = ctx({ categoryFallbackHits: 2, vectorHits: 1 });
    const prompt = buildCraftShopSystemPrompt(viaVector, 'ამეთვისტოს გულსაკიდი', { replyLanguage: 'ka' });

    expect(prompt).not.toContain('ASK BEFORE OFFERING');
    expect(prompt).toContain('\n\nPRODUCTS:\n');
  });

  it('the third repeat still wins: offerExhausted takes precedence over re-offering', () => {
    const prompt = buildCraftShopSystemPrompt(ctx(), 'რუდრაკშა', {
      replyLanguage: 'ka',
      offerExhausted: true,
    });

    expect(prompt).toContain('ALREADY ANSWERED');
    expect(prompt).not.toContain('ASK BEFORE OFFERING');
    expect(prompt).not.toContain('\n\nPRODUCTS:\n');
  });

  it('nothing at all matched: the NO MATCH flow asks rather than assuming', () => {
    const empty = ctx({ matchedProducts: [], categoryFallbackHits: 0 });
    const prompt = buildCraftShopSystemPrompt(empty, 'რუდრაკშა თუ გაქვთ?', { replyLanguage: 'ka' });

    expect(prompt).toContain('NO MATCH');
    expect(prompt).toMatch(/Then ASK/);
    expect(prompt).toMatch(/only once they've told you or said yes/);
  });
});

describe('global rules — the two-step is stated for every business type', () => {
  it('says step 1 names no product and step 2 waits for a yes', () => {
    const global = buildGlobalSystemPrompt();
    expect(global).toContain("WE DON'T HAVE WHAT THEY ASKED FOR");
    expect(global).toMatch(/STEP 1[\s\S]*Name NO product/);
    expect(global).toMatch(/STEP 2 \(only after they say yes\)/);
  });
});

describe('AFFIRMATIVE_RE — a plain yes releases the held-back list, a new question does not', () => {
  const yes = [
    'yes', 'Yes please', 'ok', 'sure', 'yes, show me', 'go ahead',
    'კი', 'კი, მაჩვენეთ', 'დიახ', 'ჰო', 'კარგი', 'რა თქმა უნდა',
    'ki', 'diax', 'ho', 'kargi', 'machvenet', 'да', 'конечно',
  ];
  const no = [
    'yes, do you have malas?', 'რუდრაკშა მინდა', 'do you have amethyst?',
    'how much is the candle', 'no thanks', 'არა', 'ტარო გაქვთ?',
  ];

  for (const t of yes) it(`accepts "${t}"`, () => expect(AFFIRMATIVE_RE.test(t)).toBe(true));
  for (const t of no) it(`rejects "${t}"`, () => expect(AFFIRMATIVE_RE.test(t)).toBe(false));
});
