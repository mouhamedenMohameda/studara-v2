/**
 * Heuristiques locales sur le texte transcrit : repérer passages probablement
 * bruités (répétitions, scripts inattendus, etc.). Aucune appel réseau.
 * La suppression / nettoyage du texte est hors scope — consommateurs décident.
 */

export type WeakReason =
  | 'foreign_script'
  | 'repeated_line'
  | 'token_stutter'
  | 'ngram_echo'
  | 'low_lexical_diversity';

export type ConfidenceBand = 'solid' | 'uncertain' | 'review';

export interface TranscriptWeakSpan {
  startChar: number;
  endChar: number;
  band: ConfidenceBand;
  reasons: WeakReason[];
  excerpt: string;
  /** Quand la source est au format `01:` … OpenAI */
  minuteLabel?: string;
  approxStartSec?: number;
  approxEndSec?: number;
}

export interface TranscriptConfidenceResult {
  spans: TranscriptWeakSpan[];
  stats: {
    totalChars: number;
    uncertainSpanCount: number;
    reviewSpanCount: number;
  };
}

export interface AnalyzeTranscriptConfidenceOpts {
  /** Si `fr`, caractères cyrilliques / grecs signalés comme suspects. */
  language?: 'fr' | 'ar' | null;
  /** Limite de spans renvoyées (les plus sévères d’abord). */
  maxSpans?: number;
}

const CYRILLIC = /[\u0400-\u04FF]/g;
const GREEK = /[\u0370-\u03FF]/g;

function countScriptMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function tokenizeWords(line: string): string[] {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function maxConsecutiveTokenRepeat(words: string[]): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function repeatedLineScore(lines: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const counts = new Map<string, number>();
  for (const line of lines) {
    const n = norm(line);
    if (n.length < 12) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  for (const c of counts.values()) {
    if (c >= 3) return true;
  }
  return false;
}

function findNgramEchoes(text: string, n = 4, minOccurrences = 3): boolean {
  const words = tokenizeWords(text);
  if (words.length < n * minOccurrences) return false;
  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ');
    if (gram.length < 8) continue;
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
    if ((counts.get(gram) ?? 0) >= minOccurrences) return true;
  }
  return false;
}

function lexicalDiversityRatio(text: string): number {
  const words = tokenizeWords(text);
  if (words.length < 40) return 1;
  const uniq = new Set(words);
  return uniq.size / words.length;
}

function bandFromReasons(reasons: WeakReason[]): ConfidenceBand {
  const reviewTriggers: WeakReason[] = [
    'foreign_script',
    'repeated_line',
    'token_stutter',
  ];
  if (reasons.some((r) => reviewTriggers.includes(r))) return 'review';
  if (reasons.length > 0) return 'uncertain';
  return 'solid';
}

interface TextBlock {
  startChar: number;
  endChar: number;
  body: string;
  minuteLabel?: string;
}

function splitOpenAIMinuteBlocks(text: string): TextBlock[] | null {
  const re = /(?:^|\n)(\d{2}):\s*/g;
  const hits: { absLabelStart: number; contentStart: number; mm: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      absLabelStart: m.index,
      contentStart: m.index + m[0].length,
      mm: m[1]!,
    });
  }
  if (hits.length < 2) return null;

  const blocks: TextBlock[] = [];
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1]!.absLabelStart : text.length;
    blocks.push({
      startChar: hits[i]!.absLabelStart,
      endChar: end,
      body: text.slice(hits[i]!.contentStart, end).trim(),
      minuteLabel: hits[i]!.mm,
    });
  }
  return blocks;
}

function splitParagraphBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const parts = text.split(/\n\s*\n+/);
  let cursor = 0;
  for (const raw of parts) {
    const idx = text.indexOf(raw, cursor);
    if (idx < 0) continue;
    cursor = idx + raw.length;
    const trimmed = raw.trim();
    if (trimmed.length < 80) continue;
    blocks.push({
      startChar: idx,
      endChar: idx + raw.length,
      body: trimmed,
    });
  }
  if (blocks.length >= 3) return blocks;

  // Fallback : fenêtres ~550 mots pour longs monoblocs
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 120) {
    const t = text.trim();
    if (t.length >= 40) {
      return [{ startChar: 0, endChar: text.length, body: t }];
    }
    return [];
  }
  const win = 550;
  const step = 400;
  const out: TextBlock[] = [];
  let w = 0;
  while (w < words.length) {
    const chunk = words.slice(w, w + win).join(' ');
    const start = text.indexOf(chunk);
    if (start >= 0) {
      out.push({ startChar: start, endChar: start + chunk.length, body: chunk });
    }
    w += step;
  }
  return out.length ? out : [{ startChar: 0, endChar: text.length, body: text.trim() }];
}

function analyzeBlock(
  body: string,
  opts: { language?: 'fr' | 'ar' | null },
): { reasons: WeakReason[] } {
  const reasons: WeakReason[] = [];
  const lang = opts.language ?? null;

  const cyr = countScriptMatches(body, CYRILLIC);
  const gre = countScriptMatches(body, GREEK);
  if (lang === 'fr' && (cyr >= 3 || gre >= 4)) reasons.push('foreign_script');
  if (lang === null && cyr >= 5) reasons.push('foreign_script');

  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (repeatedLineScore(lines)) reasons.push('repeated_line');

  const words = tokenizeWords(body);
  const consec = maxConsecutiveTokenRepeat(words);
  if (consec >= 6) reasons.push('token_stutter');

  if (findNgramEchoes(body)) reasons.push('ngram_echo');

  const div = lexicalDiversityRatio(body);
  if (words.length >= 80 && div < 0.12) reasons.push('low_lexical_diversity');

  return { reasons: [...new Set(reasons)] };
}

function excerptSlice(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function mergeAdjacentSpans(spans: TranscriptWeakSpan[]): TranscriptWeakSpan[] {
  if (spans.length <= 1) return spans;
  const sorted = [...spans].sort((a, b) => a.startChar - b.startChar);
  const out: TranscriptWeakSpan[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    const gap = s.startChar - cur.endChar;
    const sameBand = s.band === cur.band;
    if (sameBand && gap <= 8) {
      cur.endChar = Math.max(cur.endChar, s.endChar);
      cur.reasons = [...new Set([...cur.reasons, ...s.reasons])];
      cur.excerpt = excerptSlice(`${cur.excerpt} ${s.excerpt}`);
    } else {
      out.push(cur);
      cur = { ...s };
    }
  }
  out.push(cur);
  return out;
}

function severityRank(b: ConfidenceBand): number {
  if (b === 'review') return 2;
  if (b === 'uncertain') return 1;
  return 0;
}

/**
 * Analyse une transcription brute et renvoie des spans à risque (offsets UTF-16
 * alignés sur String JS — même convention que substring / slice).
 */
export function analyzeTranscriptConfidence(
  transcript: string,
  opts: AnalyzeTranscriptConfidenceOpts = {},
): TranscriptConfidenceResult {
  const text = transcript ?? '';
  const maxSpans = opts.maxSpans ?? 14;
  if (!text.trim()) {
    return {
      spans: [],
      stats: { totalChars: 0, uncertainSpanCount: 0, reviewSpanCount: 0 },
    };
  }

  const minuteBlocks = splitOpenAIMinuteBlocks(text);
  const blocks = minuteBlocks ?? splitParagraphBlocks(text);

  const rawSpans: TranscriptWeakSpan[] = [];
  for (const b of blocks) {
    const { reasons } = analyzeBlock(b.body, { language: opts.language });
    if (reasons.length === 0) continue;
    const band = bandFromReasons(reasons);
    if (band === 'solid') continue;

    const slice = text.slice(b.startChar, b.endChar);
    const span: TranscriptWeakSpan = {
      startChar: b.startChar,
      endChar: b.endChar,
      band,
      reasons,
      excerpt: excerptSlice(slice),
    };
    if (b.minuteLabel) {
      span.minuteLabel = b.minuteLabel;
      const mm = parseInt(b.minuteLabel, 10);
      if (!Number.isNaN(mm) && mm >= 1) {
        span.approxStartSec = (mm - 1) * 60;
        span.approxEndSec = mm * 60;
      }
    }
    rawSpans.push(span);
  }

  const merged = mergeAdjacentSpans(rawSpans);
  merged.sort((a, b) => severityRank(b.band) - severityRank(a.band) || a.startChar - b.startChar);
  const spans = merged.slice(0, maxSpans);

  return {
    spans,
    stats: {
      totalChars: text.length,
      uncertainSpanCount: spans.filter((s) => s.band === 'uncertain').length,
      reviewSpanCount: spans.filter((s) => s.band === 'review').length,
    },
  };
}
