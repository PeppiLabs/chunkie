import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GENERIC_QUESTIONS, SAMPLES, questionsFor } from '../samples';
import { parseTranscript } from '../parse';

describe('bundled samples', () => {
  it('every sample file exists and parses', () => {
    for (const sample of SAMPLES) {
      const raw = readFileSync(`public/${sample.path}`, 'utf8');
      const transcript = parseTranscript(sample.label, raw);
      expect(transcript.messages.length, sample.label).toBeGreaterThan(10);
      expect(transcript.skipped, sample.label).toBe(0);
    }
  });

  it('every sample has tailored questions, not the generic fallback', () => {
    // These are matched by label. When the label and the question list lived in
    // two separate files, a mismatch fell back silently with nothing to show
    // that the tailored questions had been lost.
    for (const sample of SAMPLES) {
      expect(questionsFor(sample.label), sample.label).toBe(sample.questions);
      expect(questionsFor(sample.label), sample.label).not.toBe(GENERIC_QUESTIONS);
    }
  });

  it('falls back to the generic questions for an unknown transcript', () => {
    expect(questionsFor('somebody-elses-file.json')).toBe(GENERIC_QUESTIONS);
  });

  it('asks questions that do not simply repeat the transcript wording', () => {
    // The whole demonstration is that meaning based search beats keyword
    // matching. A question that shares its rare words with the answer would
    // prove nothing, because a keyword search would find it too.
    const common = new Set([
      'the','a','an','and','or','but','is','are','was','were','be','been','to','of','in','on',
      'for','with','my','i','it','that','this','what','when','how','why','do','does','did','not',
      'no','yes','can','could','would','should','will','me','you','we','they','get','got','go',
      'up','out','if','so','at','by','from','as','about','there','their','have','has','had','am',
    ]);

    for (const sample of SAMPLES) {
      const raw = readFileSync(`public/${sample.path}`, 'utf8');
      const body = parseTranscript(sample.label, raw)
        .messages.map((m) => m.text.toLowerCase())
        .join(' ');

      for (const question of sample.questions) {
        const rare = question
          .toLowerCase()
          .split(/\W+/)
          .filter((word) => word.length > 3 && !common.has(word));

        const overlap = rare.filter((word) => body.includes(word));
        // At most one meaningful word may appear verbatim in the transcript.
        expect(
          overlap.length,
          `"${question}" shares ${JSON.stringify(overlap)} with ${sample.label}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
