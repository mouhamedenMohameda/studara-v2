import { analyzeTranscriptConfidence } from '../services/transcriptConfidenceHeuristics';

describe('analyzeTranscriptConfidence', () => {
  it('returns empty spans for empty transcript', () => {
    const r = analyzeTranscriptConfidence('', {});
    expect(r.spans).toEqual([]);
    expect(r.stats.totalChars).toBe(0);
  });

  it('flags Cyrillic in French mode (minute blocks)', () => {
    const text = `01: Bonjour tout le monde.\n02: Suite du cours avec erreur атер.\n03: Fin.`;
    const r = analyzeTranscriptConfidence(text, { language: 'fr' });
    const cyr = r.spans.find((s) => s.reasons.includes('foreign_script'));
    expect(cyr).toBeDefined();
    expect(cyr!.band).toBe('review');
    expect(cyr!.minuteLabel).toBe('02');
  });

  it('detects repeated identical long lines', () => {
    const line =
      'La moralité est maturée. La moralité est maturée. La moralité est maturée.';
    const body = `${line}\n${line}\n${line}\n`;
    const r = analyzeTranscriptConfidence(body, {});
    expect(r.spans.some((s) => s.reasons.includes('repeated_line'))).toBe(true);
  });

  it('detects token stutter', () => {
    const words = Array(10).fill('volonté').join(' ');
    const r = analyzeTranscriptConfidence(words, {});
    expect(r.spans.some((s) => s.reasons.includes('token_stutter'))).toBe(true);
  });

  it('detects 4-gram echo', () => {
    const phrase = 'un deux trois quatre';
    const text = `${phrase} ${phrase} ${phrase} suite normale du texte qui continue encore`;
    const r = analyzeTranscriptConfidence(text, {});
    expect(r.spans.some((s) => s.reasons.includes('ngram_echo'))).toBe(true);
  });

  it('respects maxSpans', () => {
    const parts: string[] = [];
    for (let i = 0; i < 20; i++) {
      parts.push(`Para ${i}.\n\n${'bla '.repeat(200)}volonté volonté volonté volonté volonté volonté volonté volonté.\n\n`);
    }
    const r = analyzeTranscriptConfidence(parts.join(''), { maxSpans: 3 });
    expect(r.spans.length).toBeLessThanOrEqual(3);
  });
});
