import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseArgs } from '../src/cli.ts';

describe('parseArgs', () => {
  it('extracts command, options and positional args', () => {
    const parsed = parseArgs([
      'login',
      '--server',
      'https://x.example',
      '--token=abc',
      '--name',
      'My Box',
      'extra',
    ]);
    assert.equal(parsed.command, 'login');
    assert.equal(parsed.options.server, 'https://x.example');
    assert.equal(parsed.options.token, 'abc');
    assert.equal(parsed.options.name, 'My Box');
    assert.deepEqual(parsed.positional, ['extra']);
  });

  it('handles boolean flags', () => {
    const parsed = parseArgs(['daemon', '--once']);
    assert.equal(parsed.command, 'daemon');
    assert.equal(parsed.options.once, true);
  });
});
