import { describe, it, expect } from 'vitest';
import { stripIndents } from './stripIndent';

describe('stripIndents', () => {
  it('strips leading whitespace from each line', () => {
    const result = stripIndents(`
      Hello
        World
      Foo
    `);

    expect(result).toBe('Hello\nWorld\nFoo');
  });

  it('works as a template literal tag', () => {
    const name = 'World';
    const result = stripIndents`
      Hello ${name}
      How are you?
    `;

    expect(result).toBe('Hello World\nHow are you?');
  });

  it('handles empty string', () => {
    expect(stripIndents('')).toBe('');
  });

  it('handles single line', () => {
    expect(stripIndents('  hello  ')).toBe('hello');
  });

  it('removes leading newlines', () => {
    const result = stripIndents(`

      Hello
    `);

    expect(result).toMatch(/^Hello/);
  });

  it('handles mixed indentation levels', () => {
    const result = stripIndents(`
      Level 1
          Level 2
      Level 1 again
    `);

    expect(result).toBe('Level 1\nLevel 2\nLevel 1 again');
  });

  it('preserves empty lines between content', () => {
    const result = stripIndents(`
      Line 1

      Line 3
    `);

    expect(result).toContain('Line 1\n\nLine 3');
  });

  it('handles template with multiple interpolations', () => {
    const a = 'foo';
    const b = 'bar';
    const result = stripIndents`
      Start ${a}
      Middle
      End ${b}
    `;

    expect(result).toBe('Start foo\nMiddle\nEnd bar');
  });
});
