import { describe, it, expect } from 'vitest';
import { retrieveProducts, extractCategoryKeywords, type ProductLike } from '../productRetrieval';
import { gateConfidentVectorMatches } from '../vectorGate';

/**
 * Regression guard for the "irrelevant product recommendation" bug.
 *
 * Production repeatedly recommended unrelated figurines (Buddha/Krishna/horse…) when a
 * customer asked for an item the shop does NOT carry ("ხის ბაყაყი" / wooden frog). These
 * tests lock the two layers that must keep such a query at NO_RELEVANT_MATCH:
 *   1. the deterministic token + category retrieval (productRetrieval), and
 *   2. the text-vector relevance gate (vectorGate) — the path that actually leaked.
 *
 * STRONG_RETRIEVAL_SCORE mirrors loadBusinessContext's gate (a strong match is ≥ 5.0).
 */
const STRONG_RETRIEVAL_SCORE = 5.0;

// Catalog modelled on the real shop from the failing production log: a cluster of
// figurines/decor that all sit in a broad category, plus incense and a coin.
const CATALOG: ProductLike[] = [
  { name: 'ცხენი', category: 'ქანდაკება', description: '2026 წელი ცეცხლოვანი ცხენის წელიწადია — ველური ენერგიის, დაუოკებელი წინსვლისა და დიდი ცვლილებების სიმბოლო' },
  { name: 'დრაკონი', category: 'ქანდაკება', description: 'დრაკონი - დამცველი და მსახური, სურნელოვანი ჩხირისა და კვამლის კონუსის სადგამი' },
  { name: 'კრიშნა', category: 'ქანდაკება', description: 'კრიშნა — სამყაროს ჰარმონიის მელოდია, ფლეიტაზე დამკვრელი' },
  { name: 'ბუდა', category: 'ქანდაკება', description: 'ბუდა სიდჰართა გაუტამა, გასხივოსნებული, მედიტაცია და სიმშვიდე' },
  { name: 'საკმეველი', category: 'საკმეველი', description: '100%-ით ნატურალური, ხელნაკეთი სურნელოვანი საკმეველი' },
  { name: 'ფინანსების მონეტა', category: 'მონეტა', description: 'ცხენის სიმბოლიკა ფინანსურ ენერგეტიკაში, ფენ-შუი' },
];

describe('deterministic retrieval — not-in-catalog queries stay at NO_RELEVANT_MATCH', () => {
  // Each query asks for an item the shop genuinely does not stock.
  const notInCatalog = [
    'ხის ბაყაყი რო გქონდსთ ადრე?', // wooden frog
    'ფერომონები გაქვთ?',           // pheromones
  ];

  for (const query of notInCatalog) {
    it(`"${query.slice(0, 24)}" → no strong token match AND no category`, () => {
      const hits = retrieveProducts(CATALOG, query);
      const topScore = hits[0]?.score ?? 0;
      // No confident token match → loadBusinessContext would NOT surface it as the requested product.
      expect(topScore).toBeLessThan(STRONG_RETRIEVAL_SCORE);
      // No recognizable category → no same-category fallback either.
      expect(extractCategoryKeywords(query)).toBeNull();
    });
  }
});

describe('deterministic retrieval — genuine in-catalog queries still match (gate not over-tight)', () => {
  it('"საკმეველი" → strong match on the incense product', () => {
    const hits = retrieveProducts(CATALOG, 'საკმეველი გაქვთ?');
    expect(hits[0]?.score ?? 0).toBeGreaterThanOrEqual(STRONG_RETRIEVAL_SCORE);
    expect(hits[0]?.name).toBe('საკმეველი');
  });

  it('a statue query resolves to the statue category', () => {
    // English "statue" maps to the ქანდაკება ("kand") field pattern.
    expect(extractCategoryKeywords('do you have a statue?')).not.toBeNull();
  });
});

describe('vector relevance gate — diffuse clusters collapse, focused matches survive', () => {
  it('diffuse figurine cluster (frog case) → [] (NO_RELEVANT_MATCH)', () => {
    // Wooden-frog query pulls the whole figurine neighbourhood at ~0.45-0.50: no clear leader.
    const hits = [
      { name: 'ცხენი', similarity: 0.50 },
      { name: 'დრაკონი', similarity: 0.49 },
      { name: 'ფინანსების მონეტა', similarity: 0.48 },
      { name: 'ბუდა', similarity: 0.47 },
      { name: 'კრიშნა', similarity: 0.46 },
    ];
    expect(gateConfidentVectorMatches(hits)).toEqual([]);
  });

  it('clear solo cross-language match → kept', () => {
    // "ამეთვისტოს გულსაკიდი" → "Amethyst Pendant": one confident leader, weak rest.
    const hits = [
      { name: 'Amethyst Pendant', similarity: 0.72 },
      { name: 'Silver Ring', similarity: 0.40 },
    ];
    expect(gateConfidentVectorMatches(hits)).toEqual(['Amethyst Pendant']);
  });

  it('two genuine same-kind variants → both kept; weak tail dropped', () => {
    const hits = [
      { name: 'Silver Ring', similarity: 0.70 },
      { name: 'Gold Ring', similarity: 0.65 },
      { name: 'Necklace', similarity: 0.45 },
    ];
    expect(gateConfidentVectorMatches(hits)).toEqual(['Silver Ring', 'Gold Ring']);
  });

  it('empty input → []', () => {
    expect(gateConfidentVectorMatches([])).toEqual([]);
  });
});
