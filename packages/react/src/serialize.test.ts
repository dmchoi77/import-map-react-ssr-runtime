import { describe, expect, it } from 'vitest';

import {
  createHydrationScript,
  deserializeHydrationData,
  serializeHydrationData,
} from './serialize';

describe('React hydration contract serialization', () => {
  it('escapes inline-script content and preserves hydration data', () => {
    const data = {
      specifier: '@mfe/greeting',
      props: {
        message: '</script><script>alert(1)</script>',
        count: 2,
      },
      identifierPrefix: 'greeting-',
    };

    const serialized = serializeHydrationData(data);
    const script = createHydrationScript('remote-root', data);
    const json = script.slice(
      '<script type="application/json" data-mfe-react-hydration="remote-root">'.length,
      -'</script>'.length,
    );

    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual(data);
    expect(JSON.parse(json)).toEqual(data);
    expect(deserializeHydrationData(serialized)).toEqual(data);
    expect(createHydrationScript('remote"root', data)).toContain(
      'data-mfe-react-hydration="remote&quot;root"',
    );
  });

  it('rejects values that cannot be represented as JSON', () => {
    expect(() => serializeHydrationData(BigInt(1))).toThrowError(
      /Hydration data must be JSON serializable/,
    );
  });
});
