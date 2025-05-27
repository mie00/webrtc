import { EMOJIS } from './emojis';

describe('EMOJIS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(EMOJIS)).toBe(true);
    expect(EMOJIS.length).toBeGreaterThan(0);
  });

  it('should contain only strings', () => {
    expect(EMOJIS.every((emoji) => typeof emoji === 'string')).toBe(true);
  });

  it('should not contain empty strings', () => {
    expect(EMOJIS.every((emoji) => emoji.length > 0)).toBe(true);
  });
});
