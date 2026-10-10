import { renderCard } from './card.js';

const app = document.getElementById('app');
const state = { run: null, index: 0, showOther: {} };
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const key = (caseId, label) => `${caseId}|${label}`;

async function load() {
  state.run = await (await fetch('/api/run')).json();
  render();
}

async function save(caseId, label, patch) {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ case_id: caseId, label, ...patch }),
  });
  if (!res.ok) {
    document.getElementById('status').textContent = `Save failed (${res.status})`;
    return;
  }
  state.run.scores[key(caseId, label)] = (await res.json()).score;
  render();
  document.getElementById('status').textContent = 'Saved';
}

const judged = () => Object.values(state.run.scores).filter((s) => s.verdict).length;
const total = () => state.run.cases.reduce((n, c) => n + Object.keys(c.cards).length, 0);

function column(c, label, card) {
  const s = state.run.scores[key(c.id, label)];
  const other = Boolean(state.showOther[key(c.id, label)]) && card.other;
  const view = other ? card.other : card.default;
  const attrs = (act) => `data-act="${act}" data-case="${esc(c.id)}" data-label="${esc(label)}"`;
  const pick = (act, field, value, text) =>
    `<button ${attrs(act)} data-value="${value}" aria-pressed="${s[field] === value}">${text}</button>`;
  const variantLabel = c.has_location ? (other ? ' · WITHOUT LOCATION' : ' · WITH LOCATION') : '';
  const locationControls =
    c.has_location && card.other
      ? `<div class="row"><button ${attrs('toggle')}>${other ? 'Show with location' : 'Compare without location'}</button></div>
         <div class="row">${pick('location', 'location', 'helped', 'Location helped')}${pick('location', 'location', 'same', 'No difference')}${pick('location', 'location', 'hurt', 'Hurt')}</div>`
      : '';
  return `<section class="col">
    <p class="label">CARD ${esc(label)}${variantLabel}</p>
    ${view ? renderCard(view) : '<p class="body-sm">No result for this variant.</p>'}
    <div class="controls">
      <div class="row">${pick('verdict', 'verdict', 'send', 'Send unedited')}${pick('verdict', 'verdict', 'edit', 'Needs edit')}${pick('verdict', 'verdict', 'bad', 'Bad')}</div>
      <label class="field">Actually it's… <input ${attrs('actually')} value="${esc(s.actually)}" /></label>
      <label class="check"><input type="checkbox" ${attrs('safety')} ${s.safety_should_fire ? 'checked' : ''} /> Safety block should have fired</label>
      <label class="field">Note <textarea ${attrs('note')}>${esc(s.note)}</textarea></label>
      ${locationControls}
    </div>
  </section>`;
}

function render() {
  const run = state.run;
  if (!run.cases.length) {
    app.innerHTML = '<p class="body">This run has no cases.</p>';
    return;
  }
  const c = run.cases[state.index];
  const cols = Object.entries(c.cards)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, card]) => column(c, label, card))
    .join('');
  app.innerHTML = `
    <header class="top">
      <button data-act="prev" ${state.index === 0 ? 'disabled' : ''}>← Prev</button>
      <p class="label">${esc(run.run_id)} · CASE ${state.index + 1} OF ${run.cases.length} · ${judged()}/${total()} JUDGED</p>
      <button data-act="next" ${state.index === run.cases.length - 1 ? 'disabled' : ''}>Next →</button>
      <span id="status" class="label"></span>
    </header>
    <section class="capture">
      ${c.has_photo ? `<img src="/photo/${encodeURIComponent(c.id)}" alt="Capture ${esc(c.id)}" />` : '<p class="label">NOTE-ONLY CAPTURE</p>'}
      ${c.note ? `<p class="body">“${esc(c.note)}”</p>` : ''}
    </section>
    <div class="cols">${cols}</div>`;
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('button[data-act]');
  if (!el) return;
  const { act, case: caseId, label, value } = el.dataset;
  const current = caseId ? state.run.scores[key(caseId, label)] : null;
  if (act === 'prev') { state.index -= 1; render(); }
  else if (act === 'next') { state.index += 1; render(); }
  else if (act === 'verdict') save(caseId, label, { verdict: current.verdict === value ? null : value });
  else if (act === 'location') save(caseId, label, { location: current.location === value ? null : value });
  else if (act === 'toggle') { state.showOther[key(caseId, label)] = !state.showOther[key(caseId, label)]; render(); }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  const { act, case: caseId, label } = el.dataset ?? {};
  if (act === 'actually') save(caseId, label, { actually: el.value.trim() });
  else if (act === 'note') save(caseId, label, { note: el.value.trim() });
  else if (act === 'safety') save(caseId, label, { safety_should_fire: el.checked });
});

document.addEventListener('keydown', (e) => {
  if (!state.run || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowRight' && state.index < state.run.cases.length - 1) { state.index += 1; render(); }
  if (e.key === 'ArrowLeft' && state.index > 0) { state.index -= 1; render(); }
});

load();
