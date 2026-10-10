import { TIER2_LABELS, type DeeperOutput, type EnforcedCard, type TierOneOutput } from './schema.js';

// Fixed copy. The model cannot alter or suppress it. The model's lookalike_line
// renders between SAFETY_LEAD and SAFETY_REST (design board: wild grape).
export const SAFETY_HEADING = 'Before you taste anything';
export const SAFETY_LEAD = "Don't eat or use anything on the strength of an app.";
export const SAFETY_REST =
  "This is a starting point, not a safe-to-eat verdict. A photo can't tell ripe from unripe or sprayed from unsprayed. If foraging interests you, a local guide or the county extension office is the next step.";

const MAX_FOLLOW_UPS = 3;

// Rules the JSON schema cannot express. A non-null result fails the attempt.
export function checkCardRules(raw: TierOneOutput): string | null {
  if (raw.confidence === 'cant_tell' && (!raw.help_asks || raw.help_asks.length !== 2)) {
    return 'cant_tell requires exactly two help_asks';
  }
  return null;
}

export function enforceCard(raw: TierOneOutput): { card: EnforcedCard; capped: boolean } {
  const capped = raw.edible_or_medicinal && raw.confidence === 'confident';
  const confidence = capped ? 'likely' : raw.confidence;
  const lookalike = raw.edible_or_medicinal ? raw.lookalike_line : null;
  return {
    capped,
    card: {
      ...raw,
      confidence,
      help_asks: confidence === 'cant_tell' ? raw.help_asks : null,
      lookalike_line: lookalike,
      follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS),
      tier2_label: TIER2_LABELS[confidence],
      safety: raw.edible_or_medicinal
        ? { heading: SAFETY_HEADING, lead: SAFETY_LEAD, rest: SAFETY_REST, lookalike_line: lookalike }
        : null,
    },
  };
}

export function enforceDeeper(raw: DeeperOutput): DeeperOutput {
  return { answer: raw.answer, follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS) };
}
