import { describe, it, expect } from 'vitest';
import { validateEmail, validateName, validateNewPassword, validateConfirm, validateCurrentPassword, passwordStrength, rememberEmail, recallEmail, EMAIL_KEY } from './authForm';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe('form validation', () => {
  it('checks the email', () => {
    expect(validateEmail('')).toBe('Enter your email');
    expect(validateEmail('   ')).toBe('Enter your email');
    expect(validateEmail('name@')).toMatch(/valid email/);
    expect(validateEmail('no at sign.com')).toMatch(/valid email/);
    expect(validateEmail('name@example.com')).toBe('');
    expect(validateEmail('  Name@Example.COM ')).toBe('');
    expect(validateEmail(undefined)).toBe('Enter your email');
  });
  it('checks the name', () => {
    expect(validateName('A')).not.toBe('');
    expect(validateName(' Deepak ')).toBe('');
  });
  it('a new password needs 8 characters, and is not changed (spaces count)', () => {
    expect(validateNewPassword('')).toBe('Choose a password');
    expect(validateNewPassword('1234567')).toMatch(/at least 8/);
    expect(validateNewPassword('12345678')).toBe('');
    expect(validateNewPassword('        ')).toBe(''); // eight spaces are eight characters: the password is not trimmed
    expect(validateNewPassword('x'.repeat(129))).toMatch(/too long/);
  });
  it('the confirmation must match exactly', () => {
    expect(validateConfirm('abc12345', 'abc12345')).toBe('');
    expect(validateConfirm('abc12345', 'abc12345 ')).not.toBe('');
    expect(validateConfirm('abc12345', '')).not.toBe('');
  });
  it('sign in only needs something typed', () => {
    expect(validateCurrentPassword('')).not.toBe('');
    expect(validateCurrentPassword('x')).toBe('');
  });
});

describe('password strength hint', () => {
  it('is empty before typing and says how many characters are missing', () => {
    expect(passwordStrength('').label).toBe('');
    expect(passwordStrength('abc')).toMatchObject({ score: 0, label: 'Too short', hint: '5 more characters needed' });
    expect(passwordStrength('abcdefg').hint).toBe('1 more character needed');
  });
  it('flags very common and plain passwords', () => {
    expect(passwordStrength('password123').label).toBe('Weak');
    expect(passwordStrength('aaaaaaaa').label).toBe('Weak');
    expect(passwordStrength('abcdefgh').label).toBe('Weak');
  });
  it('rewards length and variety', () => {
    expect(passwordStrength('Abcdefg1').score).toBe(3);
    expect(passwordStrength('correct horse battery staple').score).toBeGreaterThanOrEqual(3);
    expect(passwordStrength('Tr0ub4dor&3-horse-staple').label).toBe('Strong');
    expect(passwordStrength('abcdefgh1').score).toBeLessThan(passwordStrength('Abcdefgh1!xyz').score);
  });
});

describe('keeping the typed email between forms', () => {
  it('remembers it and gives it back', () => {
    const st = memory();
    expect(recallEmail(st)).toBe('');
    rememberEmail(st, 'name@example.com');
    expect(st.getItem(EMAIL_KEY)).toBe('name@example.com');
    expect(recallEmail(st)).toBe('name@example.com');
  });
  it('never throws when storage is blocked', () => {
    const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(() => rememberEmail(blocked, 'a@b.co')).not.toThrow();
    expect(recallEmail(blocked)).toBe('');
    expect(recallEmail(null)).toBe('');
  });
});
