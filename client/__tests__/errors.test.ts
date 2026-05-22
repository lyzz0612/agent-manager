import { ApiError, describeError, statusToErrorKind } from '../src/api/errors';

describe('statusToErrorKind', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [500, 'server'],
    [502, 'server'],
    [418, 'unknown'],
  ])('maps %i -> %s', (status, expected) => {
    expect(statusToErrorKind(status as number)).toBe(expected);
  });
});

describe('describeError', () => {
  it('returns a friendly Chinese message for unauthorized errors', () => {
    const msg = describeError(new ApiError('unauthorized', 'bad token', 401));
    expect(msg).toContain('Token');
  });

  it('returns a network hint for network errors', () => {
    expect(describeError(new ApiError('network', 'fetch failed'))).toContain('网络');
  });

  it('falls back to error.message for plain Errors', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('handles unknown values', () => {
    expect(describeError('weird')).toBe('未知错误');
  });
});
