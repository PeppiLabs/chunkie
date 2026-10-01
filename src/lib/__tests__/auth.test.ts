import { describe, it, expect, beforeEach } from 'vitest';
import { authService, calculatePasswordStrength } from '../authService';

describe('calculatePasswordStrength', () => {
  it('identifies weak passwords under 8 chars', () => {
    const res = calculatePasswordStrength('short');
    expect(res.score).toBeLessThanOrEqual(1);
    expect(res.label).toBe('Weak');
    expect(res.hasMinLength).toBe(false);
  });

  it('identifies fair passwords', () => {
    const res = calculatePasswordStrength('password123');
    expect(res.score).toBe(2);
    expect(res.label).toBe('Fair');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasUppercase).toBe(false);
  });

  it('identifies good passwords', () => {
    const res = calculatePasswordStrength('Password123');
    expect(res.score).toBe(3);
    expect(res.label).toBe('Good');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(false);
  });

  it('identifies strong passwords with all criteria', () => {
    const res = calculatePasswordStrength('StrongPass!2026');
    expect(res.score).toBe(4);
    expect(res.label).toBe('Strong');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(true);
  });
});

describe('authService', () => {
  beforeEach(() => {
    authService.clearAll();
  });

  it('logs in with pre-seeded demo user credentials', async () => {
    const creds = authService.getDemoCredentials();
    const user = await authService.login(creds.email, creds.password, false);

    expect(user).toBeDefined();
    expect(user.email).toBe(creds.email);
    expect(user.isDemo).toBe(true);

    const currentUser = authService.getCurrentUser();
    expect(currentUser?.email).toBe(creds.email);
  });

  it('rejects invalid passwords', async () => {
    const creds = authService.getDemoCredentials();
    await expect(authService.login(creds.email, 'WrongPassword123!')).rejects.toThrow(
      /Invalid email or password/,
    );
  });

  it('registers a new user and allows login', async () => {
    const newUser = await authService.register(
      'Ada Lovelace',
      'ada@example.com',
      'AnalyticalEngine2026!',
    );

    expect(newUser.name).toBe('Ada Lovelace');
    expect(newUser.email).toBe('ada@example.com');
    expect(newUser.isDemo).toBe(false);

    // Can log in with new credentials
    authService.logout();
    expect(authService.getCurrentUser()).toBeNull();

    const loggedIn = await authService.login('ada@example.com', 'AnalyticalEngine2026!');
    expect(loggedIn.email).toBe('ada@example.com');
  });

  it('prevents registering duplicate email addresses', async () => {
    await authService.register('First User', 'dup@test.com', 'SecurePass123!');

    await expect(
      authService.register('Second User', 'dup@test.com', 'AnotherPass123!'),
    ).rejects.toThrow(/already exists/);
  });

  it('handles password reset flow: code generation, verification and password update', async () => {
    const creds = authService.getDemoCredentials();

    // 1. Send reset code
    const { code } = await authService.sendPasswordResetCode(creds.email);
    expect(code).toMatch(/^\d{6}$/);

    // 2. Verify code
    const isValid = await authService.verifyResetCode(creds.email, code);
    expect(isValid).toBe(true);

    // 3. Reset password
    const newPass = 'BrandNewSecret2026!';
    await authService.resetPassword(creds.email, newPass);

    // 4. Old password fails
    await expect(authService.login(creds.email, creds.password)).rejects.toThrow();

    // 5. New password succeeds
    const loggedIn = await authService.login(creds.email, newPass);
    expect(loggedIn.email).toBe(creds.email);
  });

  it('handles guest login session', async () => {
    const guest = await authService.loginAsGuest();
    expect(guest.name).toBe('Guest Explorer');
    expect(authService.getCurrentUser()?.id).toBe(guest.id);

    authService.logout();
    expect(authService.getCurrentUser()).toBeNull();
  });
});
