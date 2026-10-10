export const meta = {
  name: 'execute-plan',
  description: 'Execute a batched implementation plan: one fresh agent per pending batch, a review gate after each, stop on failure',
  whenToUse: 'Run the answer-card plan (or any plan with a batch table and a ledger) without starting each batch by hand',
  phases: [
    { title: 'Scout', detail: 'read the ledger, list pending batches' },
    { title: 'Implement', detail: 'one fresh agent per batch' },
    { title: 'Review', detail: 'check commits, tests, typecheck, origin' },
    { title: 'Fix', detail: 'one fix pass and one re-review on rejection' },
  ],
}

const PLAN = (args && args.plan) || 'docs/superpowers/plans/2026-10-10-answer-card.md'
const LEDGER = (args && args.ledger) || 'docs/superpowers/plans/2026-10-10-answer-card-ledger.md'

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string', description: 'feature branch named in the plan Execution section' },
    pending: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          batch: { type: 'string' },
          tasks: { type: 'array', items: { type: 'integer' } },
        },
        required: ['batch', 'tasks'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['branch', 'pending'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked', 'needs_chase'] },
    commits: { type: 'array', items: { type: 'string' }, description: 'short SHA and subject of each commit made' },
    verification: { type: 'string', description: 'commands run and their results' },
    needs_chase: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'deviations from the plan, or why blocked' },
  },
  required: ['status', 'commits', 'verification', 'needs_chase', 'notes'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' }, description: 'concrete defects, each with file and what is wrong' },
    checked: { type: 'string', description: 'what was run and inspected' },
  },
  required: ['approved', 'issues', 'checked'],
}

const GIT_RULES = `Git: Chase has granted standing authority for this repository, so commit and push without asking. ` +
  `Work only on the plan's feature branch, never main. Stage explicit paths. Plain commit messages with no ` +
  `Co-Authored-By trailer. Push after every commit. Never force-push or rewrite history.`

const CONTEXT_RULES = `Read the plan's header through the end of its Review Focus section (Goal, Execution, Global ` +
  `Constraints, Review Focus), then only your batch's section. Do not read other batches' tasks.`

phase('Scout')
const scout = await agent(
  `Read the ledger at ${LEDGER} and the "Execution" section of the plan at ${PLAN}. ` +
    `Return the feature branch name and the batches whose ledger status is not "done" or "needs_chase", in plan order, ` +
    `with their task numbers. If a batch is "blocked", return it first and say why in notes. Read only; change nothing.`,
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, effort: 'low' },
)

if (!scout || scout.pending.length === 0) {
  log('No pending batches.')
  return { done: [], stopped: null, needs_chase: [], notes: scout ? scout.notes || '' : 'scout failed' }
}
log(`Pending: ${scout.pending.map((b) => b.batch).join(', ')} on ${scout.branch}`)

const done = []
const needsChase = []
let stopped = null

for (const b of scout.pending) {
  const tasks = b.tasks.join(', ')

  const impl = await agent(
    `You are executing Batch ${b.batch} (Tasks ${tasks}) of the plan at ${PLAN}, and nothing else.\n\n` +
      `Use the superpowers:executing-plans skill for these tasks only. ${CONTEXT_RULES}\n\n` +
      `Set up the branch exactly as the plan's Execution section says (create ${scout.branch} if it is not on origin; otherwise switch to it and pull).\n` +
      `Follow each task's steps in order: failing test first, then implementation, then \`cd proxy && npm test && npm run typecheck\`. ` +
      `Commit and push after each task with the commit command the task gives. After each task, update the ledger at ${LEDGER} ` +
      `(task log entry, batch status) and include it in that task's commit.\n\n` +
      `If the plan's code does not work as written (an API behaves differently, a type does not check), fix it minimally to meet the task's ` +
      `tests and interfaces, and record the deviation and reason in the ledger. Never weaken or delete a test to make it pass. ` +
      `Never change another task's interfaces.\n\n` +
      `Verify against the real flow where a task has a CLI step: run it and report the output. Never read, print or log values from ` +
      `proxy/.env.local; key names only. Anything only Chase can supply (key values, his photos, his Mac) goes in the ledger's ` +
      `"Needs Chase" list; finish everything else and return status needs_chase.\n\n` +
      `${GIT_RULES}\n\n` +
      `Stop when Batch ${b.batch} is complete. Return status "blocked" with the reason if you cannot complete it.`,
    { label: `implement:${b.batch}`, phase: 'Implement', schema: IMPL_SCHEMA },
  )

  if (!impl || impl.status === 'blocked') {
    stopped = { batch: b.batch, stage: 'implement', reason: impl ? impl.notes : 'implement agent failed' }
    break
  }
  needsChase.push(...impl.needs_chase)

  const reviewPrompt = (round) =>
    `Review Batch ${b.batch} (Tasks ${tasks}) of the plan at ${PLAN} on branch ${scout.branch}${round > 1 ? ' after a fix pass' : ''}. ` +
    `${CONTEXT_RULES}\n\n` +
    `Check, and report each check in "checked":\n` +
    `1. \`git fetch origin\`; every commit for these tasks is on origin/${scout.branch} (\`git log origin/${scout.branch}\`). ` +
    `Implementer reported: ${JSON.stringify(impl.commits)}.\n` +
    `2. Every file the tasks list exists, and the code matches each task's Interfaces block (names, signatures, types).\n` +
    `3. Every test the tasks specify is present and not weakened, including any Review Focus test owned by these tasks.\n` +
    `4. \`cd proxy && npm ci && npm test && npm run typecheck\` passes from a clean install.\n` +
    `5. Global Constraints hold: AI SDK v7 API only, NodeNext .js imports, no secrets read or logged, no eval data committed, ` +
    `no Co-Authored-By trailer, nothing committed to main.\n` +
    `6. The ledger at ${LEDGER} has an entry per task with verification, and any deviation is recorded with a reason.\n\n` +
    `Approve only if all six hold. Deviations from the plan's code that are recorded and keep the interfaces and tests intact are fine. ` +
    `List concrete defects only, each with file and what is wrong. Do not change any file.`

  let review = await agent(reviewPrompt(1), { label: `review:${b.batch}`, phase: 'Review', schema: REVIEW_SCHEMA })

  if (review && !review.approved) {
    log(`Batch ${b.batch} review found ${review.issues.length} issue(s); one fix pass.`)
    const fix = await agent(
      `Batch ${b.batch} (Tasks ${tasks}) of the plan at ${PLAN} failed review on branch ${scout.branch}. Fix exactly these issues:\n` +
        review.issues.map((i, n) => `${n + 1}. ${i}`).join('\n') +
        `\n\n${CONTEXT_RULES}\nRun \`cd proxy && npm test && npm run typecheck\` after fixing. Record the fixes in the ledger at ${LEDGER}. ` +
        `${GIT_RULES}\nReturn status "blocked" if an issue cannot be fixed without changing the plan's interfaces.`,
      { label: `fix:${b.batch}`, phase: 'Fix', schema: IMPL_SCHEMA },
    )
    if (!fix || fix.status === 'blocked') {
      stopped = { batch: b.batch, stage: 'fix', reason: fix ? fix.notes : 'fix agent failed', issues: review.issues }
      break
    }
    needsChase.push(...fix.needs_chase)
    review = await agent(reviewPrompt(2), { label: `re-review:${b.batch}`, phase: 'Fix', schema: REVIEW_SCHEMA })
  }

  if (!review || !review.approved) {
    stopped = { batch: b.batch, stage: 'review', reason: 'review not approved after one fix pass', issues: review ? review.issues : ['review agent failed'] }
    break
  }

  done.push({ batch: b.batch, status: impl.status, commits: impl.commits, verification: impl.verification, notes: impl.notes })
  log(`Batch ${b.batch} approved (${impl.status}).`)
}

return {
  done,
  stopped,
  needs_chase: [...new Set(needsChase)],
  ledger: LEDGER,
}
