// Pure string renderer shared by the review page (browser) and eval:export (Node). No DOM.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ring = (extra = '') => `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" ${extra}/>`;
const MARKS = {
  confident: '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
  likely: `${ring()}<path d="M12 3 a9 9 0 0 0 0 18 z" fill="currentColor"/>`,
  unsure: ring(),
  cant_tell: ring('stroke-dasharray="3 3"'),
};
const WORDS = { confident: 'Confident', likely: 'Likely', unsure: 'Unsure', cant_tell: "Can't tell from this" };

const paragraphs = (text) =>
  esc(text)
    .split(/\n\s*\n/)
    .map((p) => `<p class="body-sm">${p}</p>`)
    .join('');

export function renderCard(view) {
  if (view.status !== 200 || !view.card) {
    return `<article class="card card--error"><p class="label">ERROR ${esc(view.status)}</p><p class="body-sm">${esc(view.error?.detail ?? 'No card')}</p></article>`;
  }
  const c = view.card;
  const out = [];
  out.push(
    `<header class="conf conf--${esc(c.confidence)}"><svg class="mark" viewBox="0 0 24 24" aria-hidden="true">${MARKS[c.confidence] ?? ''}</svg>` +
      `<span class="label">${esc(WORDS[c.confidence] ?? c.confidence).toUpperCase()}</span>` +
      `<span class="label lens">${esc(c.lens)} · ${esc(c.class)}</span></header>`,
  );
  out.push(`<h2 class="headline">${esc(c.headline)}</h2><p class="body">${esc(c.summary)}</p>`);
  if (c.safety) {
    const look = c.safety.lookalike_line ? ` ${esc(c.safety.lookalike_line)}` : '';
    out.push(
      `<section class="safety"><p class="label">${esc(c.safety.heading).toUpperCase()}</p>` +
        `<p class="body-sm">${esc(c.safety.lead)}${look} ${esc(c.safety.rest)}</p></section>`,
    );
  }
  out.push(`<section class="tier"><p class="label">${esc(c.tier2_label).toUpperCase()}</p><p class="body-sm">${esc(c.tier2_body)}</p>`);
  if (c.confidence === 'cant_tell') {
    const asks = (c.help_asks ?? []).map((a) => `<li>${esc(a)} →</li>`).join('');
    out.push(`<ul class="asks">${asks}<li>Leave it a mystery →</li></ul>`);
  }
  out.push('</section>');
  const deeperLabel = c.confidence === 'cant_tell' ? 'Go deeper anyway' : 'Go deeper';
  out.push(`<section class="tier"><p class="label">${deeperLabel.toUpperCase()}</p>`);
  out.push(`<ul class="followups">${c.follow_ups.map((q) => `<li>${esc(q)} →</li>`).join('')}</ul>`);
  if (view.deeper) {
    const body = view.deeper.answer
      ? paragraphs(view.deeper.answer.answer)
      : `<p class="body-sm">Deeper call failed: ${esc(view.deeper.error?.detail)}</p>`;
    out.push(`<div class="deeper"><p class="label">ASKED: ${esc(view.deeper.question)}</p>${body}</div>`);
  }
  out.push('</section>');
  return `<article class="card">${out.join('')}</article>`;
}
