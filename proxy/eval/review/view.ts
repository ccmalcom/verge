import { defaultVariant } from '../manifest.js';
import type { Blind, CardView, ResultRecord, RunResults, ScoreEntry, Scores } from '../types.js';

export const EMPTY_SCORE: ScoreEntry = { verdict: null, actually: '', safety_should_fire: false, note: '', location: null };

export function cardView(rec: ResultRecord | undefined): CardView | null {
  if (!rec) return null;
  return {
    status: rec.status,
    card: rec.card,
    error: rec.error,
    deeper: rec.deeper ? { question: rec.deeper.question, answer: rec.deeper.answer, error: rec.deeper.error } : null,
  };
}

// Everything the page needs, keyed by blind label. No vendor or model names leave the server.
export function buildRunView(results: RunResults, blind: Blind, scores: Scores) {
  const cases = results.cases.map((c) => {
    const variant = defaultVariant(c);
    const cards: Record<string, { default: CardView | null; other: CardView | null }> = {};
    for (const [label, vendor] of Object.entries(blind[c.id] ?? {})) {
      const find = (v: 'with' | 'without') => results.records.find((r) => r.case_id === c.id && r.vendor === vendor && r.variant === v);
      cards[label] = { default: cardView(find(variant)), other: variant === 'with' ? cardView(find('without')) : null };
    }
    return { id: c.id, has_photo: Boolean(c.file), note: c.note, has_location: Boolean(c.approx_location), default_variant: variant, cards };
  });
  const labelScores: Record<string, ScoreEntry> = {};
  for (const [caseId, labels] of Object.entries(blind)) {
    for (const [label, vendor] of Object.entries(labels)) {
      labelScores[`${caseId}|${label}`] = scores[`${caseId}|${vendor}`] ?? EMPTY_SCORE;
    }
  }
  return { run_id: results.run_id, prompt_version: results.prompt_version, cases, scores: labelScores };
}
