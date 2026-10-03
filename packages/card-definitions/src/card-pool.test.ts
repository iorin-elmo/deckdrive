import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allCardDefinitions, validateCardDefinitions } from './index.js';

describe('complete proposal catalog', () => {
  it('implements every stable proposal ID exactly once with valid definitions', () => {
    const proposal = readFileSync(
      new URL('../../../docs/game/card-pool-proposals.md', import.meta.url),
      'utf8',
    );
    const ids = [
      ...proposal.matchAll(
        /\|\s*((?:sword|guardian|mage|alchemist|hunter|trickster|neutral)_\d{3})\s*\|/g,
      ),
    ].map((match) => match[1]);
    expect(new Set(ids).size).toBe(93);
    for (const id of ids)
      expect(allCardDefinitions.filter((card) => card.id === id)).toHaveLength(1);
    expect(validateCardDefinitions(allCardDefinitions)).toEqual({ ok: true });
  });
});
