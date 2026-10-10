import type { AskError, AskMeta, CloudVendor, DeeperOutput, EnforcedCard } from '../src/card/schema.js';

export type HarnessVendor = CloudVendor | 'apple-device' | 'apple-pcc';
export const HARNESS_VENDORS: readonly HarnessVendor[] = ['anthropic', 'openai', 'google', 'apple-device', 'apple-pcc'];

export type Variant = 'with' | 'without';
export type LatLng = { lat: number; lng: number };

export type ManifestCase = {
  id: string;
  file: string | null;
  note_file: string | null;
  taken_at: string;
  approx_location: LatLng | null;
  note: string;
  truth: string;
  neighborhood: string;
};

export type Manifest = { cases: ManifestCase[] };

export type LocationMode = 'both' | 'with' | 'without';

export type DeeperRecord = {
  question: string;
  status: number;
  answer: DeeperOutput | null;
  meta: AskMeta | null;
  error: AskError | null;
};

export type ResultRecord = {
  case_id: string;
  vendor: HarnessVendor;
  variant: Variant;
  status: number;
  card: EnforcedCard | null;
  meta: AskMeta | null;
  error: AskError | null;
  deeper: DeeperRecord | null;
  cost_usd: number | null;
};

export type RunResults = {
  run_id: string;
  prompt_version: string;
  started_at: string;
  vendors: HarnessVendor[];
  skipped_vendors: { vendor: HarnessVendor; reason: string }[];
  cases: ManifestCase[];
  records: ResultRecord[];
};

// case id → blind label (A, B, …) → vendor. Stored per run; the review page never sees vendors.
export type Blind = Record<string, Record<string, HarnessVendor>>;

export type Verdict = 'send' | 'edit' | 'bad';
export type LocationVerdict = 'helped' | 'same' | 'hurt';

export type ScoreEntry = {
  verdict: Verdict | null;
  actually: string;
  safety_should_fire: boolean;
  note: string;
  location: LocationVerdict | null;
};

// Keyed `${caseId}|${vendor}`. Written by the review server; the page only sees labels.
export type Scores = Record<string, ScoreEntry>;

export type CardView = {
  status: number;
  card: EnforcedCard | null;
  error: AskError | null;
  deeper: { question: string; answer: DeeperOutput | null; error: AskError | null } | null;
};
