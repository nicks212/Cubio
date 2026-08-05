import { describe, it, expect } from 'vitest';
import { fullCompanyInfoForEnglish, compactCompanyInfoForEnglish } from '../geoTranslation';
import { retrieveProducts, type ProductLike } from '../productRetrieval';
import { buildCraftShopSystemPrompt } from '../prompts/craft_shop';
import type { ProductContext } from '../types';

/**
 * Regression guards for the July 2026 batch:
 *   #6 the owner's full description (closures/announcements) must reach the AI,
 *   #3 product NAME must never absorb the description/category,
 *   #4 a description-only match (rose quartz in a necklace's description) must be found.
 */

describe('#6 company info — full owner text (closures) survives instead of being stripped', () => {
  const desc = 'მისამართი ია კარგარეთელის 11, მუშაობს 3-9. Closed from August 7 to August 16, back on August 17.';

  it('full helper KEEPS the closure notice', () => {
    expect(fullCompanyInfoForEnglish(desc)).toContain('August');
  });

  it('old compact helper DROPPED it (this is the bug being fixed)', () => {
    // Proves the previous behaviour: only address/hours/phone were kept.
    expect(compactCompanyInfoForEnglish(desc)).not.toContain('August');
  });
});

describe('#3/#6 craft prompt — clean product line + full company info', () => {
  const product = {
    name: 'The Original Tarot',
    price: 33,
    currency: 'GEL',
    in_stock: true,
    description: 'Klasikuri Raideri — a classic rider deck for divination and self-reflection',
  };
  const ctx = {
    products: [product],
    matchedProducts: [product],
    businessDescription: 'მისამართი ია კარგარეთელის 11. Closed from August 7 to August 16.',
    primaryMatchCount: 1,
  } as unknown as ProductContext;

  const prompt = buildCraftShopSystemPrompt(ctx, 'ტარო', { replyLanguage: 'ka' });

  it('shows Name: ₾Price and does NOT fuse the description into the name', () => {
    expect(prompt).toContain('• The Original Tarot: ₾33\n');
    // description is present but behind the "(about …)" label, not glued to the name
    expect(prompt).toContain('(about');
    expect(prompt).not.toContain('The Original Tarot: ₾33 | Klasikuri');
  });

  it('COMPANY INFO carries the full description including the closure', () => {
    expect(prompt).toContain('August');
  });
});

describe('#4 retrieval — a description-only match is found', () => {
  const catalog: ProductLike[] = [
    { name: 'Silver Necklace', category: 'jewelry', description: 'A handmade necklace made from rose quartz, a symbol of love and calm.' },
    { name: 'Agate', category: 'stone', description: 'A protective grounding stone.' },
  ];

  it('"rose quartz" matches the necklace via its description', () => {
    const hits = retrieveProducts(catalog, 'what do you have with rose quartz');
    expect(hits[0]?.name).toBe('Silver Necklace');
    expect(hits[0]?.score ?? 0).toBeGreaterThanOrEqual(5);
  });
});
