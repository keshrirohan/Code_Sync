// ============================================================================
// tests/middleware.test.js — Unit tests for errorHandler and requestLogger.
//
// We build lightweight mock req/res/next objects so no HTTP server is needed.
// ============================================================================

import { jest } from '@jest/globals';

// ── Mock logger so we can assert on log calls ─────────────────────────────────

const mockLogger = {
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  http:  jest.fn(),
};

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const { errorHandler }   = await import('../src/middleware/errorHandler.js');
const { requestLogger }  = await import('../src/middleware/requestLogger.js');

// ── Mock req/res builders ─────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    path:   '/api/test',
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    _headers:   {},
    _body:      null,
    _listeners: {},
  };
  res.status  = jest.fn().mockImplementation((code) => { res.statusCode = code; return res; });
  res.json    = jest.fn().mockImplementation((body)  => { res._body = body; return res; });
  res.on      = jest.fn().mockImplementation((event, cb) => { res._listeners[event] = cb; });
  res.emit    = (event) => { if (res._listeners[event]) res._listeners[event](); };
  return res;
}

// ── errorHandler() ───────────────────────────────────────────────────────────

describe('errorHandler()', () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('sends a JSON response with the error message', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new Error('Something broke');

    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalled();
    expect(res._body.error).toBe('Something broke');
  });

  test('uses err.status when set', () => {
    const req = mockReq();
    const res = mockRes();
    const err = Object.assign(new Error('Not found'), { status: 404 });

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('uses err.statusCode when set', () => {
    const req = mockReq();
    const res = mockRes();
    const err = Object.assign(new Error('Forbidden'), { statusCode: 403 });

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('defaults to 500 when no status is set', () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler(new Error('oops'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('logs the error via logger.error', () => {
    const req = mockReq({ method: 'POST', path: '/api/auth' });
    const res = mockRes();
    errorHandler(new Error('DB error'), req, res, next);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('includes stack trace in development', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const req = mockReq();
    const res = mockRes();
    errorHandler(new Error('dev error'), req, res, next);
    expect(res._body).toHaveProperty('stack');
    process.env.NODE_ENV = original;
  });

  test('omits stack trace in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const req = mockReq();
    const res = mockRes();
    errorHandler(new Error('prod error'), req, res, next);
    expect(res._body).not.toHaveProperty('stack');
    process.env.NODE_ENV = original;
  });

  test('handles errors without a message gracefully', () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler({}, req, res, next);
    expect(res._body.error).toBe('Internal server error');
  });

  test('does NOT call next()', () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler(new Error('test'), req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── requestLogger() ───────────────────────────────────────────────────────────

describe('requestLogger()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls next() so the request chain continues', () => {
    const req  = mockReq();
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('logs at info level for 2xx responses', () => {
    const req  = mockReq({ method: 'GET', path: '/api/config' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    // 'http' level falls back to logger.info in our mock
    const logCalls = [
      ...mockLogger.info.mock.calls,
      ...mockLogger.http.mock.calls,
    ];
    expect(logCalls.length).toBeGreaterThan(0);
    const logMsg = logCalls[0][0];
    expect(logMsg).toContain('GET');
    expect(logMsg).toContain('/api/config');
    expect(logMsg).toContain('200');
  });

  test('logs at warn level for 4xx responses', () => {
    const req  = mockReq({ method: 'POST', path: '/api/auth/leetcode' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    res.statusCode = 400;
    res.emit('finish');

    expect(mockLogger.warn).toHaveBeenCalled();
    const msg = mockLogger.warn.mock.calls[0][0];
    expect(msg).toContain('400');
  });

  test('logs at error level for 5xx responses', () => {
    const req  = mockReq({ method: 'GET', path: '/api/repos' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    res.statusCode = 500;
    res.emit('finish');

    expect(mockLogger.error).toHaveBeenCalled();
    const msg = mockLogger.error.mock.calls[0][0];
    expect(msg).toContain('500');
  });

  test('skips logging for SSE /stream endpoints', () => {
    const req  = mockReq({ path: '/api/sync/abc123/stream' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    // next() still called
    expect(next).toHaveBeenCalledTimes(1);
    // But no 'finish' listener attached — no log when done
    res.emit('finish');
    const totalLogs =
      mockLogger.info.mock.calls.length +
      mockLogger.warn.mock.calls.length +
      mockLogger.error.mock.calls.length +
      mockLogger.http.mock.calls.length;
    expect(totalLogs).toBe(0);
  });

  test('log message includes response time in ms', () => {
    const req  = mockReq({ method: 'DELETE', path: '/api/history/123' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    const logCalls = [
      ...mockLogger.info.mock.calls,
      ...mockLogger.http.mock.calls,
    ];
    const msg = logCalls[0][0];
    expect(msg).toMatch(/\d+ms/);
  });

  test('includes HTTP method in log message', () => {
    const req  = mockReq({ method: 'DELETE', path: '/api/history/x' });
    const res  = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    const logCalls = [...mockLogger.info.mock.calls, ...mockLogger.http.mock.calls];
    expect(logCalls[0][0]).toContain('DELETE');
  });
});
