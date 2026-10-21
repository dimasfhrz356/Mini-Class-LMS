const test = require('node:test');
const assert = require('node:assert/strict');

const { generateVerificationCode, buildResetEmailContent } = require('../utils/passwordReset');

test('generateVerificationCode produces 6 numeric digits', () => {
  const code = generateVerificationCode();
  assert.equal(code.length, 6);
  assert.match(code, /^\d{6}$/);
});

test('generateVerificationCode rejects invalid lengths', () => {
  assert.throws(() => generateVerificationCode(0), RangeError);
  assert.throws(() => generateVerificationCode(33), RangeError);
  assert.throws(() => generateVerificationCode(1.5), RangeError);
});

test('reset email content includes code and expiry info', () => {
  const email = buildResetEmailContent({ name: 'Budi', code: '123456', expiresInMinutes: 5 });
  assert.match(email.subject, /Kode Verifikasi/i);
  assert.match(email.text, /123456/);
  assert.match(email.text, /5 menit/i);
});
