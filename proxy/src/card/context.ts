import type { AskContext } from './schema.js';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

// Northern-hemisphere meteorological seasons, read from the date as written
// (YYYY-MM...), so a local timestamp never shifts month through UTC conversion.
export function seasonFor(dateIso: string): Season {
  const month = Number(dateIso.slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function roundLocation(loc?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  return loc ? { lat: roundCoord(loc.lat), lng: roundCoord(loc.lng) } : null;
}

export function contextText(ctx: AskContext): string {
  const lines = [`Season: ${seasonFor(ctx.date)} (date ${ctx.date.slice(0, 10)}).`];
  if (ctx.prompt_text) {
    lines.push(`Active prompt: "${ctx.prompt_text}"${ctx.lens ? ` (lens: ${ctx.lens})` : ''}.`);
  } else {
    lines.push('No prompt is active.');
  }
  const loc = roundLocation(ctx.approx_location);
  if (loc) lines.push(`Approximate location, rounded to about 100 m: ${loc.lat}, ${loc.lng}.`);
  if (ctx.neighborhood) lines.push(`Neighborhood: ${ctx.neighborhood}.`);
  return lines.join('\n');
}
