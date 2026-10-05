import { describe, expect, it } from 'vitest';

import { createStateScript, deserializeState, serializeState } from './serialize';

describe('React state serialization', () => {
  it('escapes inline-script content and preserves JSON state', () => {
    const state = {
      message: '</script><script>alert(1)</script>',
      count: 2,
    };

    const serialized = serializeState(state);
    const script = createStateScript('remote-root', state);
    const json = script.slice(
      '<script type="application/json" data-mfe-state="remote-root">'.length,
      -'</script>'.length,
    );

    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual(state);
    expect(JSON.parse(json)).toEqual(state);
    expect(deserializeState(serialized)).toEqual(state);
    expect(createStateScript('remote"root', state)).toContain('data-mfe-state="remote&quot;root"');
  });

  it('rejects state values that cannot be represented as JSON', () => {
    expect(() => serializeState(BigInt(1))).toThrowError(/State must be JSON serializable/);
  });
});
