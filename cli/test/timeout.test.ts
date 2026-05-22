import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DEFAULT_TIMEOUTS_MS,
  resolveTimeout,
} from '../src/executor/timeout.ts';

describe('resolveTimeout', () => {
  it('returns the default timeout when no override is provided', () => {
    assert.equal(resolveTimeout('detect'), DEFAULT_TIMEOUTS_MS.detect);
    assert.equal(resolveTimeout('install'), DEFAULT_TIMEOUTS_MS.install);
  });

  it('clamps to the smaller of default vs requested', () => {
    assert.equal(resolveTimeout('install', 1000), 1000);
    assert.equal(
      resolveTimeout('install', DEFAULT_TIMEOUTS_MS.install + 100_000),
      DEFAULT_TIMEOUTS_MS.install,
    );
  });

  it('ignores non-positive or invalid overrides', () => {
    assert.equal(resolveTimeout('doctor', 0), DEFAULT_TIMEOUTS_MS.doctor);
    assert.equal(resolveTimeout('doctor', -1), DEFAULT_TIMEOUTS_MS.doctor);
    assert.equal(
      resolveTimeout('doctor', Number.NaN),
      DEFAULT_TIMEOUTS_MS.doctor,
    );
  });
});
