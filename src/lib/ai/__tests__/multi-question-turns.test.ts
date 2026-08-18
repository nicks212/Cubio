import { describe, it, expect } from 'vitest';
import { splitCustomerAsks, hasMultipleAsks, formatAsksForPrompt, dropBurstFromHistory } from '../messageParts';
import { retrieveProducts, STRONG_RETRIEVAL_SCORE, type ProductLike } from '../productRetrieval';
import { buildMultiAskRule, buildLanguageLock } from '../prompts/global';
import { buildCraftShopSystemPrompt } from '../prompts/craft_shop';
import { CRAFT_BROAD_QUERY_RE } from '../signals';
import type { ProductContext } from '../types';

/**
 * Regression guard for the "two questions, one irrelevant answer" bug.
 *
 * Production log (Friday Night): the customer sent two messages that were debounced into
 * one turn — "do you have a physical store?" and "and do you sell rudraksha?" — and the
 * assistant answered with a lotus mala and an amethyst, neither of which was asked about.
 * Three separate defects produced that reply, and each is locked here:
 *
 *   1. Retrieval ran over the MERGED text, so "ფიზიკური" (physical) from the store
 *      question matched a mala whose description mentions physical balance — scoring
 *      above the confident bar, i.e. presented as the answer to the rudraksha question.
 *   2. Georgian function words transliterate to short Latin tokens ("და" → "da") that
 *      matched the word "and" inside every Georgian product description, so a single
 *      question retrieved the entire catalog.
 *   3. The earlier message of the burst was in BOTH the history snapshot and the merged
 *      current turn, so the model saw the first question as already-handled context.
 */

// The real shop catalog from the failing production log.
const CATALOG: ProductLike[] = [
  { name: 'სანთელი', category: 'სანთელი', description: 'ფერების ენერგეტიკა და ჩაკრების სისტემა აღმოსავლური ტრადიციებისა და პრაქტიკების მიხედვით, თითოეულ ფერს თავისი უნიკალური' },
  { name: 'ინდიელთა თავსაბურავი', category: 'სუვენირი', description: 'ინდიელთა ტრადიციული თავსაბურავი არის ერთ-ერთი ყველაზე მნიშვნელოვანი კულტურული და სულიერი' },
  { name: 'ბუდა', category: 'ქანდაკება', description: 'ბუდა სიდჰართა გაუტამა, ამ ქანდაკებაში განსახიერებული სიმშვიდე და სიბრძნე თქვენი სახლის ენერგეტიკულ ცენტრად იქცევა' },
  { name: 'ამეთვისტო', category: 'მინერალი', description: 'ამეთვისტო ერთ-ერთი ყველაზე მოთხოვნადი და პოპულარული მინერალია, რომელიც თავისი დამამშვიდებელი ვიბრაციით გამოირჩევა' },
  { name: 'კრიშნა და სიუხვის ხე', category: 'ქანდაკება', description: 'კრიშნა და სიუხვის ხე — ეს კომპოზიცია უძველესი სიბრძნისა და მშვიდობის განსახიერებაა' },
  { name: 'ლოტოსის ყვავილი • მალა', category: 'სამკაული', description: 'KAMAL GATTA ლოტოსის ყვავილი, ყელსაბამი (108), სულიერ და ფიზიკირი ბალანსში, ფინანსური კეთილდღეობა' },
];

const PRODUCTION_BURST = 'გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?\nდა რუდრაკშა თუ გაქვთ გაყიდვაში?';

describe('splitCustomerAsks — a debounced burst becomes the separate things asked', () => {
  it('the production burst splits into the store question and the product question', () => {
    expect(splitCustomerAsks(PRODUCTION_BURST)).toEqual([
      'გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?',
      'და რუდრაკშა თუ გაქვთ გაყიდვაში?',
    ]);
  });

  it('splits on sentence terminators within one message too', () => {
    expect(splitCustomerAsks('hello there. do you have candles? how much?')).toHaveLength(3);
  });

  it('a single question stays a single ask', () => {
    expect(splitCustomerAsks('ტარო გაქვთ?')).toEqual(['ტარო გაქვთ?']);
    expect(hasMultipleAsks('ტარო გაქვთ?')).toBe(false);
  });

  it('trailing punctuation-only fragments fold back instead of becoming an ask', () => {
    expect(splitCustomerAsks('ტარო გაქვთ?\n?')).toHaveLength(1);
    expect(splitCustomerAsks('👍')).toEqual(['👍']);
    expect(splitCustomerAsks('   ')).toEqual([]);
  });

  it('the prompt block lists every ask, numbered in the order they were asked', () => {
    const rule = buildMultiAskRule(formatAsksForPrompt(splitCustomerAsks(PRODUCTION_BURST)));
    expect(rule).toContain('1. გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?');
    expect(rule).toContain('2. და რუდრაკშა თუ გაქვთ გაყიდვაში?');
    expect(rule).toMatch(/SAME order/i);
  });
});

describe('per-ask retrieval — one question can no longer answer another', () => {
  const [storeAsk, productAsk] = splitCustomerAsks(PRODUCTION_BURST);

  it('the rudraksha question matches nothing — the shop does not stock it', () => {
    expect(retrieveProducts(CATALOG, productAsk)).toEqual([]);
  });

  it('the store question surfaces no confident product', () => {
    const top = retrieveProducts(CATALOG, storeAsk)[0]?.score ?? 0;
    expect(top).toBeLessThan(STRONG_RETRIEVAL_SCORE);
  });

  it('"და" (and) no longer drags in every product with a Georgian description', () => {
    // Before the stopword layer this returned all six products on a "da" token alone.
    expect(retrieveProducts(CATALOG, 'და რუდრაკშა თუ გაქვთ?')).toEqual([]);
  });

  it('one incidental description word is not a confident match', () => {
    // "ფიზიკური" (physical) appears only inside the mala's description ("physical
    // balance"). It is what the store question used to match on, and on its own it must
    // stay well below the bar. A description match backed by several query words — e.g.
    // "rose quartz" naming the material a necklace is made of — is still confident.
    const hits = retrieveProducts(CATALOG, 'ფიზიკური');
    for (const hit of hits) expect(hit.score).toBeLessThan(STRONG_RETRIEVAL_SCORE);
  });
});

describe('per-ask retrieval — genuine product questions still match confidently', () => {
  const cases: Array<[string, string]> = [
    ['სანთელი გაქვთ?', 'სანთელი'],
    ['ამეთვისტო მინდა', 'ამეთვისტო'],
    ['ბუდა გაქვთ?', 'ბუდა'],
    ['santeli gaqvt?', 'სანთელი'],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      const hits = retrieveProducts(CATALOG, query);
      expect(hits[0]?.score ?? 0).toBeGreaterThanOrEqual(STRONG_RETRIEVAL_SCORE);
      expect(hits[0]?.name).toBe(expected);
    });
  }

  it('each ask of a two-product burst finds its own product', () => {
    const asks = splitCustomerAsks('სანთელი გაქვთ?\nამეთვისტო თუ გაქვთ?');
    expect(asks).toHaveLength(2);
    expect(retrieveProducts(CATALOG, asks[0])[0]?.name).toBe('სანთელი');
    expect(retrieveProducts(CATALOG, asks[1])[0]?.name).toBe('ამეთვისტო');
  });
});

describe('dropBurstFromHistory — the burst is not sent twice', () => {
  const burst = ['გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?', 'და რუდრაკშა თუ გაქვთ გაყიდვაში?'];

  it('removes the trailing user turns that this turn is about to answer', () => {
    const history = [
      { role: 'user', content: 'გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?' },
    ];
    expect(dropBurstFromHistory(history, burst)).toEqual([]);
  });

  it('leaves genuinely older turns alone', () => {
    const history = [
      { role: 'user', content: 'ტარო გაქვთ?' },
      { role: 'ai', content: 'დიახ, გვაქვს.' },
      { role: 'user', content: 'გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?' },
    ];
    expect(dropBurstFromHistory(history, burst)).toEqual(history.slice(0, 2));
  });

  it('the same question asked in an earlier exchange survives', () => {
    // One buffered copy may only consume one history turn.
    const history = [
      { role: 'user', content: 'თასი გაქვთ?' },
      { role: 'ai', content: 'ბოდიში, არ გვაქვს.' },
      { role: 'user', content: 'თასი გაქვთ?' },
    ];
    const kept = dropBurstFromHistory(history, ['თასი გაქვთ?']);
    expect(kept).toEqual(history.slice(0, 2));
  });

  it('an AI turn stops the scan, and no buffer means no change', () => {
    const history = [{ role: 'ai', content: 'რით შემიძლია დაგეხმაროთ?' }];
    expect(dropBurstFromHistory(history, burst)).toEqual(history);
    expect(dropBurstFromHistory(history, [])).toEqual(history);
  });
});

describe('broad-browse detection — mentioning the shop is not a request to browse it', () => {
  const browsing = ['what do you sell?', 'რა გაქვთ?', 'რას ყიდით?', 'show me the catalog', 'კატალოგი მაქვს ნახული?'];
  const notBrowsing = [
    'გამარჯობათ, ფიზიკური მაღაზია თუ გაქვთ?', // the production message
    'do you have a physical store?',
    'where is your shop?',
    'რუდრაკშა თუ გაქვთ?',
  ];

  for (const q of browsing) {
    it(`browse: "${q}"`, () => expect(CRAFT_BROAD_QUERY_RE.test(q)).toBe(true));
  }
  for (const q of notBrowsing) {
    it(`not browse: "${q}"`, () => expect(CRAFT_BROAD_QUERY_RE.test(q)).toBe(false));
  }

  it('the production burst reaches the honest NO MATCH flow, not a catalog tour', () => {
    const ctx = {
      products: [{ name: 'ამეთვისტო', price: 10, in_stock: true, category: 'მინერალი' }],
      matchedProducts: [],
      businessDescription: 'მისამართი ია კარგარეთელის 11, მუშაობს 15:00-21:00.',
    } as unknown as ProductContext;
    const prompt = buildCraftShopSystemPrompt(ctx, PRODUCTION_BURST, { replyLanguage: 'ka' });

    expect(prompt).toContain('NO MATCH');
    expect(prompt).not.toContain('CATALOG OVERVIEW');
    expect(prompt).toContain('(no products matched this message)');
  });
});

describe('buildLanguageLock — the backend decides, the model is told', () => {
  it('Georgian verdict names Georgian script and forbids English', () => {
    const lock = buildLanguageLock('ka');
    expect(lock).toMatch(/ALREADY DECIDED: Georgian/);
    expect(lock).toMatch(/Do NOT answer in English/);
  });

  it('English verdict forbids Georgian script', () => {
    expect(buildLanguageLock('en')).toMatch(/ALREADY DECIDED: English/);
  });
});
