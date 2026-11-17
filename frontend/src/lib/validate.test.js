import { describe, it, expect } from 'vitest';
import { commentError, usernameError, bioError, nameError, avatarFileError, normalizeUsername } from './validate';

describe('validation mirrors the server', () => {
  it('comments', () => {
    expect(commentError('   ')).toBeTruthy();
    expect(commentError('a'.repeat(500))).toBeNull();
    expect(commentError('a'.repeat(501))).toBeTruthy();
    expect(commentError('தமிழ் '.repeat(100))).toBeNull(); // 600 UTF-16 units but ~400 graphemes
  });
  it('usernames', () => {
    expect(normalizeUsername(' @Tamil_Fan ')).toBe('tamil_fan');
    for (const ok of ['abc', 'tamil_fan1', 'a'.repeat(20)]) expect(usernameError(ok)).toBeNull();
    for (const bad of ['ab', '1abc', 'has space', 'a'.repeat(21), 'admin', 'bad-name', 'தமிழ்']) expect(usernameError(bad)).toBeTruthy();
  });
  it('bio and name', () => {
    expect(bioError('x'.repeat(150))).toBeNull();
    expect(bioError('x'.repeat(151))).toBeTruthy();
    expect(nameError('A')).toBeTruthy();
    expect(nameError('Aarav')).toBeNull();
  });
  it('avatar files', () => {
    expect(avatarFileError(null)).toBeTruthy();
    expect(avatarFileError({ type: 'image/svg+xml', size: 10 })).toBeTruthy();
    expect(avatarFileError({ type: 'image/png', size: 9 * 1024 * 1024 })).toBeTruthy();
    expect(avatarFileError({ type: 'image/webp', size: 1000 })).toBeNull();
  });
});
