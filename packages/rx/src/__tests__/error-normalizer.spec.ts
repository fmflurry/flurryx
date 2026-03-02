import { describe, it, expect } from 'vitest';
import { defaultErrorNormalizer } from '../error/error-normalizer';

describe('defaultErrorNormalizer', () => {
  it('should extract errors from nested error.errors array', () => {
    const error = {
      error: {
        errors: [{ code: 'E001', message: 'Bad request' }],
      },
    };
    expect(defaultErrorNormalizer(error)).toEqual([
      { code: 'E001', message: 'Bad request' },
    ]);
  });

  it('should create error from status + message object', () => {
    const error = { status: 404, message: 'Not found' };
    expect(defaultErrorNormalizer(error)).toEqual([
      { code: '404', message: 'Not found' },
    ]);
  });

  it('should handle Error instances', () => {
    const error = new Error('Something broke');
    const result = defaultErrorNormalizer(error);
    expect(result).toEqual([{ code: 'UNKNOWN', message: 'Something broke' }]);
  });

  it('should handle unknown error types', () => {
    const result = defaultErrorNormalizer('random error');
    expect(result).toEqual([{ code: 'UNKNOWN', message: 'random error' }]);
  });

  it('should handle null', () => {
    const result = defaultErrorNormalizer(null);
    expect(result).toEqual([{ code: 'UNKNOWN', message: 'null' }]);
  });

  it('should prioritize nested errors over status+message', () => {
    const error = {
      status: 500,
      message: 'Internal',
      error: {
        errors: [{ code: 'CUSTOM', message: 'Custom error' }],
      },
    };
    expect(defaultErrorNormalizer(error)).toEqual([
      { code: 'CUSTOM', message: 'Custom error' },
    ]);
  });
});
