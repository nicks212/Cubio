import { describe, it, expect } from 'vitest';
import { detectReplyLanguage, looksRomanizedGeorgian } from '../geoTranslation';

/**
 * Regression guard for "the customer wrote Georgian in Latin letters and got English".
 *
 * detectReplyLanguage is the single language authority: it decides replyLanguage, which
 * in turn decides whether product data is pre-translated to English and whether the
 * prompt is told to avoid Georgian script. It used to test for Georgian script only, so
 * "gamarjoba, bina gaqvs?" scored as English and the entire turn — data, instructions
 * and reply — went English at a Georgian-speaking customer.
 *
 * Recognition is language-level, not phrasebook-level: Georgian function words plus the
 * consonant clusters and case endings that Georgian romanization produces, weighed
 * against English function words so an English sentence can never be misread.
 */

describe('romanized Georgian is recognised as Georgian', () => {
  const georgian = [
    'gamarjoba',
    'gamarjobat, fizikuri magazia tu gaqvt?',
    'bina gaqvs?',
    'minda vnaxo',
    'rudraksha gaqvt gaqidvashi?',
    'ra girs es?',
    'romeli sartulia?',
    'madloba, kargi',
    'sad xart?',
    'ramdeni girs santeli',
    'shemidzlia vnaxo suratebi?',
    'tu sheidzleba fasi',
    'dghes gaqvt gaxsnili?',
    'chemi nomeria 555123456',
    'sxva rame gaqvt?',
  ];
  for (const text of georgian) {
    it(`"${text}"`, () => expect(detectReplyLanguage(text)).toBe('ka'));
  }
});

describe('English stays English — a shared spelling never flips the language', () => {
  const english = [
    'hello',
    'do you have a physical store?',
    'what is the price?',
    'thanks',
    'ok',
    'I want to buy a candle',
    'are you open today?',
    'can I see photos?',
    'is this available',
    'how much does it cost',
    'Do you sell rudraksha?',
    'my name is Nick',            // Georgian "is" (he/she) collides with English "is"
    'send me the address please', // Georgian "me" (I) collides with English "me"
    'that is a sad story',        // Georgian "sad" (where) collides with English "sad"
  ];
  for (const text of english) {
    it(`"${text}"`, () => expect(detectReplyLanguage(text)).toBe('en'));
  }
});

describe('Georgian script always wins', () => {
  it('script anywhere in the line', () => {
    expect(detectReplyLanguage('გამარჯობა')).toBe('ka');
    expect(detectReplyLanguage('hello\nდა რუდრაკშა?')).toBe('ka');
  });
});

describe('debounced bursts — the last line that carries a signal decides', () => {
  it('skips a trailing line with no words', () => {
    expect(detectReplyLanguage('გამარჯობა\n?')).toBe('ka');
    expect(detectReplyLanguage('gamarjoba\n👍')).toBe('ka');
  });

  it('a genuine language switch is honoured', () => {
    expect(detectReplyLanguage('გამარჯობა\ndo you have candles?')).toBe('en');
  });
});

describe('no signal at all falls back to what the customer has been writing', () => {
  it('uses the customer\'s own earlier messages, never the assistant\'s replies', () => {
    expect(detectReplyLanguage('👍', 'გამარჯობა, ბინა გაქვთ?')).toBe('ka');
    expect(detectReplyLanguage('👍', 'gamarjoba, bina gaqvt?')).toBe('ka');
    expect(detectReplyLanguage('👍', 'hello, do you have apartments?')).toBe('en');
    expect(detectReplyLanguage('👍')).toBe('en');
  });
});

describe('looksRomanizedGeorgian — evidence must clear a floor and out-weigh English', () => {
  it('a single ambiguous word is not enough', () => {
    expect(looksRomanizedGeorgian('is')).toBe(false);
    expect(looksRomanizedGeorgian('me')).toBe(false);
  });

  it('one unmistakable Georgian word is', () => {
    expect(looksRomanizedGeorgian('gaqvt')).toBe(true);
  });

  it('a Georgian word dropped into an English sentence does not flip it', () => {
    expect(looksRomanizedGeorgian('do you have da Buddha statue in your store')).toBe(false);
  });

  it('empty input is not Georgian', () => {
    expect(looksRomanizedGeorgian('')).toBe(false);
    expect(looksRomanizedGeorgian('12345')).toBe(false);
  });
});
