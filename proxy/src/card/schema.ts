import { z } from 'zod';

export const CLASSES = ['plant', 'fungus', 'animal', 'insect', 'building', 'infrastructure', 'sign_or_art', 'geology', 'other'] as const;
export const LENSES = ['nature', 'built', 'history', 'light_weather', 'signs_people', 'surprise'] as const;
export const CONFIDENCES = ['confident', 'likely', 'unsure', 'cant_tell'] as const;
export const CLOUD_VENDORS = ['anthropic', 'openai', 'google'] as const;

export type CardClass = (typeof CLASSES)[number];
export type Lens = (typeof LENSES)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type CloudVendor = (typeof CLOUD_VENDORS)[number];

// What the model produces. Flat, every key required, nullable instead of optional
// (OpenAI strict structured outputs reject optional properties).
export const TierOneOutput = z.object({
  class: z.enum(CLASSES),
  lens: z.enum(LENSES),
  confidence: z.enum(CONFIDENCES),
  headline: z.string(),
  summary: z.string(),
  tier2_body: z.string(),
  help_asks: z.array(z.string()).nullable(),
  edible_or_medicinal: z.boolean(),
  lookalike_line: z.string().nullable(),
  follow_ups: z.array(z.string()),
});
export type TierOneOutput = z.infer<typeof TierOneOutput>;

export const DeeperOutput = z.object({
  answer: z.string(),
  follow_ups: z.array(z.string()),
});
export type DeeperOutput = z.infer<typeof DeeperOutput>;

// The app picks the tier-2 label from confidence; the model never does.
export const TIER2_LABELS: Record<Confidence, string> = {
  confident: 'What to look for',
  likely: 'What would settle it',
  unsure: 'How to tell them apart',
  cant_tell: 'What would help',
};

const SafetySchema = z.object({
  heading: z.string(),
  lead: z.string(),
  rest: z.string(),
  lookalike_line: z.string().nullable(),
});
export type Safety = z.infer<typeof SafetySchema>;

export const EnforcedCard = TierOneOutput.extend({
  tier2_label: z.string(),
  safety: SafetySchema.nullable(),
});
export type EnforcedCard = z.infer<typeof EnforcedCard>;

export const AskContext = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'date must start with YYYY-MM-DD'),
  prompt_text: z.string().optional(),
  lens: z.enum(LENSES).optional(),
  approx_location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  neighborhood: z.string().optional(),
});
export type AskContext = z.infer<typeof AskContext>;

// Our own request contract (never sent to a model), so optional is fine here.
export const AskRequest = z.object({
  kind: z.enum(['card', 'deeper']),
  image: z.string().optional(),
  note: z.string().optional(),
  context: AskContext,
  card: EnforcedCard.optional(),
  question: z.string().optional(),
  vendor: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export type AskMeta = {
  vendor: string;
  model: string;
  prompt_version: string;
  capped: boolean;
  latency_ms: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type AskError = {
  error: 'bad_request' | 'too_large' | 'invalid_output' | 'vendor_error';
  detail: string;
};

export type AskResponse = { card: EnforcedCard; meta: AskMeta } | { deeper: DeeperOutput; meta: AskMeta };
