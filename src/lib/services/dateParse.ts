/**
 * Lightweight, deterministic date resolver for booking messages.
 * Resolves common relative + explicit date expressions to a YYYY-MM-DD string,
 * in the business timezone (Tbilisi, UTC+4). Returns null when no date is found.
 *
 * Intentionally conservative — it only fires on clear date cues so the availability
 * engine isn't run on every message. No NLP/LLM; pure pattern matching.
 */

const TBILISI_OFFSET_HOURS = 4;

function tbilisiNow(): Date {
  return new Date(Date.now() + TBILISI_OFFSET_HOURS * 3_600_000);
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Weekday names → 0=Sun..6=Sat. English, Georgian, romanized.
const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/\b(sunday|sun)\b|კვირა(?!ს?\s*დღე)|kvira/i, 0],
  [/\b(monday|mon)\b|ორშაბათ|orshabat/i, 1],
  [/\b(tuesday|tue)\b|სამშაბათ|samshabat/i, 2],
  [/\b(wednesday|wed)\b|ოთხშაბათ|otkhshabat/i, 3],
  [/\b(thursday|thu)\b|ხუთშაბათ|khutshabat/i, 4],
  [/\b(friday|fri)\b|პარასკევ|paraskev/i, 5],
  [/\b(saturday|sat)\b|შაბათ|shabat/i, 6],
];

/**
 * @param text  raw customer message
 * @returns YYYY-MM-DD or null
 */
export function parseRequestedDate(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const now = tbilisiNow();

  // today / tomorrow / day after tomorrow (EN + Georgian + romanized)
  if (/\btoday\b|დღეს|\bdges\b/i.test(text)) return ymd(now);
  if (/day\s*after\s*tomorrow|ზეგ|\bzeg\b/i.test(text)) { const d = new Date(now); d.setUTCDate(d.getUTCDate() + 2); return ymd(d); }
  if (/\btomorrow\b|ხვალ|\bkhval\b|\bxval\b/i.test(text)) { const d = new Date(now); d.setUTCDate(d.getUTCDate() + 1); return ymd(d); }

  // ISO YYYY-MM-DD
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD.MM or DD/MM (optional year); assume current year, roll forward if already passed
  const dm = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/.exec(text);
  if (dm) {
    const day = +dm[1], mon = +dm[2];
    let year = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : now.getUTCFullYear();
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let cand = new Date(Date.UTC(year, mon - 1, day));
      if (!dm[3] && cand < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))) {
        year += 1; cand = new Date(Date.UTC(year, mon - 1, day));
      }
      return ymd(cand);
    }
  }

  // Weekday name → next occurrence (today counts if it matches)
  for (const [re, wd] of WEEKDAY_WORDS) {
    if (re.test(text)) {
      const cur = now.getUTCDay();
      let add = (wd - cur + 7) % 7;
      // "next <weekday>" pushes to the following week if it lands on today
      if (add === 0 && /\bnext\b|მომდევნ|შემდეგ/i.test(text)) add = 7;
      const d = new Date(now); d.setUTCDate(d.getUTCDate() + add);
      return ymd(d);
    }
  }

  return null;
}
