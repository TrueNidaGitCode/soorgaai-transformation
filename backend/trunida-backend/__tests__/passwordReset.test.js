/**
 * Unit tests — password reset, controllers/authController.js
 *
 * Written after the reset endpoint was found returning the raw reset token in
 * its JSON response — a "development only" convenience that had shipped to
 * production, and let anyone who knew an address set that account's password.
 * The first test here is the one that must never go green by accident.
 *
 * Strategy:
 *  - User model and mailService are mocked.
 *  - Express req/res are minimal fakes; only status() and json() are read.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockFindOne, mockSendReset, mailState } = vi.hoisted(() => ({
  mockFindOne:   vi.fn(),
  mockSendReset: vi.fn(),
  mailState:     { configured: true },
}));

vi.mock('../models/user.js', () => ({ User: { findOne: mockFindOne } }));
vi.mock('../models/EmailOtp.js', () => ({ default: {} }));
vi.mock('../services/mailService.js', () => ({
  sendOtpEmail: vi.fn(),
  sendPasswordResetEmail: mockSendReset,
  get mailConfigured() { return mailState.configured; },
}));
vi.mock('dotenv', () => ({ default: { config: () => {} } }));

const { requestPasswordReset, resetPassword } = await import('../controllers/authController.js');

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

const user = (over = {}) => ({
  email: 'Teacher@Example.com',
  save: vi.fn().mockResolvedValue(true),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mailState.configured = true;
  mockSendReset.mockResolvedValue('sent');
  process.env.NODE_ENV = 'test';
});

describe('requestPasswordReset', () => {
  // The bug this file exists for.
  it('never returns the token or the link in the response', async () => {
    mockFindOne.mockResolvedValue(user());
    const r = res();
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, r);

    expect(r.code).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/token/i);
    expect(JSON.stringify(r.body)).not.toMatch(/reset-password\.html/);
    expect(r.body).not.toHaveProperty('resetToken');
    expect(r.body).not.toHaveProperty('resetUrl');
  });

  it('puts the token in the email, and only there', async () => {
    const u = user();
    mockFindOne.mockResolvedValue(u);
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, res());

    expect(mockSendReset).toHaveBeenCalledTimes(1);
    const [to, url] = mockSendReset.mock.calls[0];
    expect(to).toBe('Teacher@Example.com');
    expect(url).toMatch(/\/login\/reset-password\.html\?token=[0-9a-f]{64}&email=/);
    // What is stored is the hash, so a database copy is not a set of links.
    const token = new URL(url).searchParams.get('token');
    expect(u.resetPasswordToken).not.toBe(token);
    expect(u.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
    expect(u.save).toHaveBeenCalled();
  });

  it('builds the link from FRONTEND_URL and the stored address, not localhost', async () => {
    mockFindOne.mockResolvedValue(user());
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, res());
    const url = mockSendReset.mock.calls[0][1];
    expect(url).not.toContain('localhost:3000');
    expect(url).toContain('email=Teacher%40Example.com');
  });

  it('matches the address case-insensitively, since signup stores it as typed', async () => {
    mockFindOne.mockResolvedValue(user());
    await requestPasswordReset({ body: { email: 'TEACHER@example.COM' } }, res());
    const query = mockFindOne.mock.calls[0][0];
    expect(query.email).toBeInstanceOf(RegExp);
    expect(query.email.test('Teacher@Example.com')).toBe(true);
    expect(query.email.test('teacher@example.com.evil')).toBe(false);
  });

  it('escapes the address before it becomes a pattern', async () => {
    mockFindOne.mockResolvedValue(null);
    await requestPasswordReset({ body: { email: 'a.b+c@example.com' } }, res());
    const re = mockFindOne.mock.calls[0][0].email;
    expect(re.test('a.b+c@example.com')).toBe(true);
    expect(re.test('aXb+c@example.com')).toBe(false);
  });

  it('says the same thing whether or not the account exists', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const missing = res();
    await requestPasswordReset({ body: { email: 'nobody@example.com' } }, missing);

    mockFindOne.mockResolvedValueOnce(user());
    const present = res();
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, present);

    expect(missing.code).toBe(200);
    expect(present.code).toBe(200);
    expect(missing.body.msg).toBe(present.body.msg);
    expect(mockSendReset).toHaveBeenCalledTimes(1);
  });

  // The old behaviour: "instructions sent" with nothing configured to send.
  it('refuses honestly in production when no mail transport exists', async () => {
    mailState.configured = false;
    process.env.NODE_ENV = 'production';
    mockFindOne.mockResolvedValue(user());
    const r = res();
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, r);

    expect(r.code).toBe(503);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  it('tells the person when the email failed rather than sending them to an empty inbox', async () => {
    mockFindOne.mockResolvedValue(user());
    mockSendReset.mockRejectedValue(new Error('Brevo 401'));
    const r = res();
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, r);
    expect(r.code).toBe(502);
    expect(r.body.msg).toMatch(/couldn.t send/i);
  });

  it('flags console delivery so the client does not say "check your email"', async () => {
    mockFindOne.mockResolvedValue(user());
    mockSendReset.mockResolvedValue('console');
    const r = res();
    await requestPasswordReset({ body: { email: 'teacher@example.com' } }, r);
    expect(r.code).toBe(200);
    expect(r.body.delivery).toBe('console');
  });

  it('rejects a missing or non-string email', async () => {
    const a = res(); await requestPasswordReset({ body: {} }, a);
    const b = res(); await requestPasswordReset({ body: { email: { $ne: '' } } }, b);
    expect(a.code).toBe(400);
    expect(b.code).toBe(400);
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  it('matches the address case-insensitively, same as the request', async () => {
    mockFindOne.mockResolvedValue(null);
    await resetPassword({ body: { email: 'TEACHER@example.com', token: 'abc', newPassword: 'secret123' } }, res());
    const query = mockFindOne.mock.calls[0][0];
    expect(query.email).toBeInstanceOf(RegExp);
    expect(query.email.test('Teacher@Example.com')).toBe(true);
    expect(query.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an unknown or expired token', async () => {
    mockFindOne.mockResolvedValue(null);
    const r = res();
    await resetPassword({ body: { email: 'teacher@example.com', token: 'abc', newPassword: 'secret123' } }, r);
    expect(r.code).toBe(400);
  });
});
