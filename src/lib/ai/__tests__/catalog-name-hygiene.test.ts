import { describe, it, expect } from 'vitest';
import {
  retrieveProducts,
  hasProductSignal,
  normalizeQuery,
  STRONG_RETRIEVAL_SCORE,
  type ProductLike,
} from '../productRetrieval';

/**
 * Regression guard for "one product matches every message".
 *
 * Production log (Friday Night, 19 Sep): a customer wrote "გამწრჯობა" / "დღწს მუშაობთ?"
 * — a greeting and an opening-hours question, nothing about products — and the retrieval
 * engine reported a confident match:
 *
 *   [retrieval-score] query="გამწრჯობა" — "ᗷᑌᗪᗪᕼᗩ" score=8.0 reason=name contains query
 *
 * That product's name is decorative Unicode. normalizeQuery() strips it to an empty
 * string, and `queryJoined.includes('')` is true for every query in existence, so it
 * scored 8.0 — above the 5.0 confident bar — on every single message the shop received.
 *
 * Two independent defences are locked here:
 *   1. a name with no normalizable text can never produce a name-level match, and
 *   2. greetings and opening-hours questions carry no product signal at all, so they
 *      never reach the embedding/vector path (which returns the whole shelf at a uniform
 *      ~0.65 in a small thematically-uniform catalog).
 */

const CATALOG: ProductLike[] = [
  // The real offender: a Buddha statue titled in decorative Unicode letters.
  { name: 'ᗷᑌᗪᗪᕼᗩ', category: 'ქანდაკება', description: 'ბუდა სიდჰართა გაუტამა, სიმშვიდე და სიბრძნე' },
  { name: 'ამეთვისტო', category: 'მინერალი', description: 'პოპულარული მინერალი, დამამშვიდებელი ვიბრაცია' },
  { name: 'სანთელი', category: 'სანთელი', description: 'ფერების ენერგეტიკა, მაღაზია მუშაობს ყოველდღე' },
  { name: 'ვარდისფერი კვარცი', category: 'მინერალი', description: 'სიყვარულის ქვა' },
  { name: '🌙', category: 'სუვენირი', description: 'მთვარის სიმბოლო' },
];

describe('a name with no normalizable text cannot match anything', () => {
  it('the decorative-Unicode name really does normalize to nothing', () => {
    expect(normalizeQuery('ᗷᑌᗪᗪᕼᗩ')).toBe('');
    expect(normalizeQuery('🌙')).toBe('');
  });

  const unrelated = ['გამწრჯობა', 'დღწს მუშაობთ?', 'რუდრაკშა გაქვთ?', 'hello', 'do you deliver?'];
  for (const query of unrelated) {
    it(`"${query}" no longer returns the decorative-named products`, () => {
      const names = retrieveProducts(CATALOG, query).map(h => h.name);
      expect(names).not.toContain('ᗷᑌᗪᗪᕼᗩ');
      expect(names).not.toContain('🌙');
    });
  }

  it('nothing in this catalog reaches the confident bar on a greeting', () => {
    for (const hit of retrieveProducts(CATALOG, 'გამწრჯობა')) {
      expect(hit.score).toBeLessThan(STRONG_RETRIEVAL_SCORE);
    }
  });

  it('the guard is not over-tight — real products still match confidently', () => {
    const cases: Array<[string, string]> = [
      ['ამეთვისტო გაქვთ?', 'ამეთვისტო'],
      ['სანთელი მინდა', 'სანთელი'],
      ['ვარდისფერი კვარცი', 'ვარდისფერი კვარცი'],
    ];
    for (const [query, expected] of cases) {
      const hits = retrieveProducts(CATALOG, query);
      expect(hits[0]?.name).toBe(expected);
      expect(hits[0]?.score ?? 0).toBeGreaterThanOrEqual(STRONG_RETRIEVAL_SCORE);
    }
  });

  it('a decorative-named product can still place on its category or description', () => {
    // It is not blacklisted — only its (absent) name stops counting as evidence.
    const hits = retrieveProducts(CATALOG, 'ქანდაკება');
    expect(hits.map(h => h.name)).toContain('ᗷᑌᗪᗪᕼᗩ');
  });
});

describe('hasProductSignal — which asks are worth embedding', () => {
  const noSignal = [
    'გამარჯობა',
    'გამწრჯობა',        // misspelled greeting — exact-match lists never catch this
    'დღეს მუშაობთ?',
    'დღწს მუშაობთ?',    // misspelled "today"
    'gamarjoba',
    'madloba, kargi',
    'hello',
    'thanks',
    'do you have?',
    'რა ღირს?',
  ];
  for (const text of noSignal) {
    it(`no signal: "${text}"`, () => expect(hasProductSignal(text)).toBe(false));
  }

  const hasSignal = [
    'ამეთვისტო გაქვთ?',
    'რუდრაკშა თუ გაქვთ გაყიდვაში?',
    'santeli gaqvt?',
    'do you have candles?',
    'ტარო',
  ];
  for (const text of hasSignal) {
    it(`has signal: "${text}"`, () => expect(hasProductSignal(text)).toBe(true));
  }

  it('the production burst: the greeting is skipped, the product ask is not', () => {
    expect(hasProductSignal('გამწრჯობა')).toBe(false);
    expect(hasProductSignal('დღწს მუშაობთ?')).toBe(false);
    expect(hasProductSignal('და რუდრაკშა თუ გაქვთ გაყიდვაში?')).toBe(true);
  });

  // Typo tolerance must not eat real words that merely resemble a stopword. Each of these
  // is a plausible shop item sitting close to a greeting or grammar stem.
  const nearMisses = [
    'სალამური',   // pan flute — two deletions from the greeting stem "salam"
    'გირჩი',      // pine cone — shares a stem shape with "ღირს" (costs)
    'ბოდისატვა',  // bodhisattva — starts like "ბოდიში" (sorry)
    'ფასადი',     // facade — starts like "ფასი" (price)
  ];
  for (const text of nearMisses) {
    it(`keeps its product signal: "${text}"`, () => expect(hasProductSignal(text)).toBe(true));
  }
});
