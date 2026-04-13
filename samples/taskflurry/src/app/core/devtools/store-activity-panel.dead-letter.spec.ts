import { describe, expect, it } from 'vitest';
import { createDeadLetterMessageDisplay } from './store-activity-panel.dead-letter';

describe('createDeadLetterMessageDisplay', () => {
  it('extracts http status from dead-letter error message', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'dead-letter',
        error: 'Http failure response for /api/tasks/123: 404 Not Found',
        httpStatus: 404,
        httpMessage: 'Not Found',
      })
    ).toEqual({
      httpStatus: '404',
      summary: 'HTTP 404',
      detail: 'Http failure response for /api/tasks/123: 404 Not Found (Not Found)',
    });
  });

  it('extracts response status instead of url port', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'dead-letter',
        error: 'Http failure response for http://localhost:300/api/tasks/123: 404 Not Found',
      })
    ).toEqual({
      httpStatus: '404',
      summary: 'HTTP 404',
      detail: 'Http failure response for http://localhost:300/api/tasks/123: 404 Not Found',
    });
  });

  it('prefers structured dead-letter metadata when provided', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'dead-letter',
        error: 'Server error',
        httpStatus: 500,
        httpMessage: 'Internal Server Error',
      })
    ).toEqual({
      httpStatus: '500',
      summary: 'HTTP 500',
      detail: 'Server error (Internal Server Error)',
    });
  });

  it('returns null for non dead-letter messages', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'acknowledged',
        error: 'Http failure response for /api/tasks/123: 404 Not Found',
      })
    ).toBeNull();
  });

  it('returns dead-letter error text when status code missing', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'dead-letter',
        error: 'Message was not acknowledged',
      })
    ).toEqual({
      httpStatus: null,
      summary: 'Message was not acknowledged',
      detail: 'Message was not acknowledged',
    });
  });

  it('returns default dead-letter label when error empty', () => {
    expect(
      createDeadLetterMessageDisplay({
        status: 'dead-letter',
        error: null,
      })
    ).toEqual({
      httpStatus: null,
      summary: 'Dead-letter error',
      detail: 'Dead-letter error',
    });
  });
});
