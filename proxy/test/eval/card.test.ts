import { describe, expect, it } from 'vitest';
import { renderCard } from '../../eval/review/public/card.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const view = (overrides = {}) => ({ status: 200, card: enforceCard(validTierOne(overrides)).card, error: null, deeper: null });

describe('renderCard', () => {
  it('shows the confidence mark, word, headline and tier-2 label', () => {
    const html = renderCard(view());
    expect(html).toContain('conf--confident');
    expect(html).toContain('CONFIDENT');
    expect(html).toContain('Common mullein');
    expect(html).toContain('WHAT TO LOOK FOR');
  });

  it('renders the safety block with the lookalike line between lead and rest', () => {
    const html = renderCard(view({ edible_or_medicinal: true, lookalike_line: 'Moonseed is poisonous.' }));
    const lead = html.indexOf("Don&#39;t eat or use anything");
    const look = html.indexOf('Moonseed is poisonous.');
    const rest = html.indexOf('This is a starting point');
    expect(html).toContain('class="safety"');
    expect(lead).toBeGreaterThan(-1);
    expect(look).toBeGreaterThan(lead);
    expect(rest).toBeGreaterThan(look);
  });

  it('renders cant_tell with two asks, Leave it a mystery, and Go deeper anyway', () => {
    const html = renderCard(view({ confidence: 'cant_tell', help_asks: ['A shot from above', 'A note on size'] }));
    expect(html).toContain('A shot from above');
    expect(html).toContain('A note on size');
    expect(html).toContain('Leave it a mystery');
    expect(html).toContain('GO DEEPER ANYWAY');
  });

  it('escapes model text', () => {
    expect(renderCard(view({ headline: '<script>x</script>' }))).not.toContain('<script>');
  });

  it('renders an error card', () => {
    expect(renderCard({ status: 502, card: null, error: { error: 'vendor_error', detail: '429' }, deeper: null })).toContain('429');
  });
});
