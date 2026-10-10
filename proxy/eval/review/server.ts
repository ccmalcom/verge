import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from 'srvx';
import { z } from 'zod';
import { runCli } from '../cli.js';
import { prepareImage } from '../image.js';
import { PHOTOS_DIR, resolveRunDir } from '../paths.js';
import type { Blind, RunResults, ScoreEntry, Scores } from '../types.js';
import { buildRunView, EMPTY_SCORE } from './view.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC: Record<string, string> = { '/': 'index.html', '/app.js': 'app.js', '/card.js': 'card.js', '/styles.css': 'styles.css' };
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const ScorePatch = z.object({
  case_id: z.string(),
  label: z.string(),
  verdict: z.enum(['send', 'edit', 'bad']).nullable().optional(),
  actually: z.string().optional(),
  safety_should_fire: z.boolean().optional(),
  note: z.string().optional(),
  location: z.enum(['helped', 'same', 'hurt']).nullable().optional(),
});

export function createReviewHandler(opts: { runDir: string; photosDir: string }): (req: Request) => Promise<Response> {
  const results: RunResults = JSON.parse(readFileSync(path.join(opts.runDir, 'results.json'), 'utf8'));
  const blind: Blind = JSON.parse(readFileSync(path.join(opts.runDir, 'blind.json'), 'utf8'));
  const scoresPath = path.join(opts.runDir, 'scores.json');
  const readScores = (): Scores => (existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {});

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const file = STATIC[url.pathname];
    if (req.method === 'GET' && file) {
      return new Response(readFileSync(path.join(PUBLIC_DIR, file), 'utf8'), { headers: { 'content-type': TYPES[path.extname(file)] } });
    }
    if (req.method === 'GET' && url.pathname === '/api/run') {
      return Response.json(buildRunView(results, blind, readScores()));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/photo/')) {
      const id = decodeURIComponent(url.pathname.slice('/photo/'.length));
      const c = results.cases.find((x) => x.id === id);
      const photo = c?.file ? path.join(opts.photosDir, c.file) : null;
      if (!photo || !existsSync(photo)) return new Response('not found', { status: 404 });
      return new Response(new Uint8Array(await prepareImage(photo)), { headers: { 'content-type': 'image/jpeg' } });
    }
    if (req.method === 'POST' && url.pathname === '/api/score') {
      let parsed: ReturnType<typeof ScorePatch.safeParse>;
      try {
        parsed = ScorePatch.safeParse(await req.json());
      } catch {
        return Response.json({ error: 'body is not JSON' }, { status: 400 });
      }
      if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
      const { case_id, label, ...patch } = parsed.data;
      const vendor = blind[case_id]?.[label];
      if (!vendor) return Response.json({ error: 'unknown case or label' }, { status: 404 });
      const scores = readScores();
      const key = `${case_id}|${vendor}`;
      const score: ScoreEntry = { ...EMPTY_SCORE, ...scores[key], ...patch };
      scores[key] = score;
      writeFileSync(scoresPath, `${JSON.stringify(scores, null, 2)}\n`);
      return Response.json({ score });
    }
    return new Response('not found', { status: 404 });
  };
}

async function main(): Promise<void> {
  const runDir = resolveRunDir(process.argv[2]);
  const port = Number(process.env.REVIEW_PORT ?? 4777);
  const server = serve({ fetch: createReviewHandler({ runDir, photosDir: PHOTOS_DIR }), port, hostname: '127.0.0.1', silent: true });
  await server.ready();
  console.log(`Reviewing ${path.basename(runDir)} at ${server.url}  (Ctrl-C to stop)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void runCli(main);
