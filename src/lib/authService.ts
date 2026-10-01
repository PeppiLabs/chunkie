import type { PasswordStrength, User } from '../types/auth';

const STORAGE_USERS_KEY = 'chunkie_users_db_v1';
const STORAGE_CURRENT_USER_KEY = 'chunkie_current_user_v1';
const STORAGE_REMEMBER_KEY = 'chunkie_remembered_email';
const STORAGE_RESET_CODES_KEY = 'chunkie_password_reset_codes';

// In-memory fallback for environments without global localStorage (e.g. node vitest runners)
const memoryStore = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // fallback
    }
    return memoryStore.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // fallback
    }
    memoryStore.set(key, value);
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // fallback
    }
    memoryStore.delete(key);
  },
  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {
      // fallback
    }
    memoryStore.clear();
  },
};

// Default initial demo user
const DEMO_USER: User & { passwordHash: string } = {
  id: 'usr_demo_01',
  name: 'Demo Explorer',
  email: 'demo@peppilabs.com',
  createdAt: '2026-01-15T12:00:00.000Z',
  isDemo: true,
  avatarColor: '#0b5ed7',
  savedPipelinesCount: 3,
  passwordHash: 'ChunkieDemo2026!', // In client-side storage, stored directly for testing/demo
};

const AVATAR_COLORS = [
  '#0b5ed7', // brand blue
  '#0a4bad', // brand dark blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0284c7', // sky
];

interface StoredUserRecord extends User {
  passwordHash: string;
}

/**
 * Initializes local storage with demo user if not already present.
 */
function getStoredUsers(): StoredUserRecord[] {
  try {
    const raw = safeStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      const initial = [DEMO_USER];
      safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const initial = [DEMO_USER];
    safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(initial));
    return initial;
  } catch {
    return [DEMO_USER];
  }
}

function saveStoredUsers(users: StoredUserRecord[]) {
  try {
    safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save users to storage', e);
  }
}

/**
 * Calculates password strength based on standard security criteria.
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (hasMinLength) score++;
  if (hasUppercase) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;

  let label: PasswordStrength['label'] = 'Weak';
  if (score === 2) label = 'Fair';
  else if (score === 3) label = 'Good';
  else if (score === 4) label = 'Strong';

  return {
    score,
    label,
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSpecial,
  };
}

export const authService = {
  /**
   * Clears storage (used for tests or full resets).
   */
  clearAll() {
    safeStorage.clear();
  },

  /**
   * Retrieves the current logged-in user from storage, if any.
   */
  getCurrentUser(): User | null {
    try {
      const raw = safeStorage.getItem(STORAGE_CURRENT_USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  /**
   * Authenticates a user with email and password.
   */
  async login(email: string, password: string, rememberMe = false): Promise<User> {
    // Small artificial delay for UI feel
    await new Promise((r) => setTimeout(r, 20));

    const normalizedEmail = email.trim().toLowerCase();
    const users = getStoredUsers();

    const matched = users.find(
      (u) => u.email.toLowerCase() === normalizedEmail && u.passwordHash === password,
    );

    if (!matched) {
      throw new Error('Invalid email or password. Please verify your credentials or try the demo account.');
    }

    const { passwordHash: _, ...userProfile } = matched;

    safeStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(userProfile));

    if (rememberMe) {
      safeStorage.setItem(STORAGE_REMEMBER_KEY, normalizedEmail);
    } else {
      safeStorage.removeItem(STORAGE_REMEMBER_KEY);
    }

    return userProfile;
  },

  /**
   * Registers a new user account.
   */
  async register(name: string, email: string, password: string): Promise<User> {
    await new Promise((r) => setTimeout(r, 20));

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const newUser: StoredUserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      email: cleanEmail,
      createdAt: new Date().toISOString(),
      avatarColor: randomColor,
      isDemo: false,
      savedPipelinesCount: 0,
      passwordHash: password,
    };

    users.push(newUser);
    saveStoredUsers(users);

    const { passwordHash: _, ...userProfile } = newUser;
    safeStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(userProfile));

    return userProfile;
  },

  /**
   * Initiates a password reset flow by creating a verification code.
   */
  async sendPasswordResetCode(email: string): Promise<{ code: string }> {
    await new Promise((r) => setTimeout(r, 20));
    const cleanEmail = email.trim().toLowerCase();

    const users = getStoredUsers();
    const userExists = users.some((u) => u.email.toLowerCase() === cleanEmail);

    if (!userExists) {
      throw new Error(`We could not find an account with the email "${cleanEmail}".`);
    }

    // Generate random 6 digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const codes = JSON.parse(safeStorage.getItem(STORAGE_RESET_CODES_KEY) || '{}');
      codes[cleanEmail] = {
        code,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      };
      safeStorage.setItem(STORAGE_RESET_CODES_KEY, JSON.stringify(codes));
    } catch (e) {
      console.error(e);
    }

    return { code };
  },

  /**
   * Verifies the 6-digit password reset code.
   */
  async verifyResetCode(email: string, code: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 20));
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    try {
      const codes = JSON.parse(safeStorage.getItem(STORAGE_RESET_CODES_KEY) || '{}');
      const item = codes[cleanEmail];

      if (!item) {
        throw new Error('No password reset was requested for this email.');
      }

      if (Date.now() > item.expiresAt) {
        throw new Error('This verification code has expired. Please request a new one.');
      }

      if (item.code !== cleanCode) {
        throw new Error('The verification code entered is incorrect.');
      }

      return true;
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error('Could not verify code.');
    }
  },

  /**
   * Resets the user's password.
   */
  async resetPassword(email: string, newPassword: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 20));
    const cleanEmail = email.trim().toLowerCase();

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    const users = getStoredUsers();
    const idx = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);

    if (idx === -1) {
      throw new Error('Account not found.');
    }

    users[idx].passwordHash = newPassword;
    saveStoredUsers(users);

    // Clean up reset code
    try {
      const codes = JSON.parse(safeStorage.getItem(STORAGE_RESET_CODES_KEY) || '{}');
      delete codes[cleanEmail];
      safeStorage.setItem(STORAGE_RESET_CODES_KEY, JSON.stringify(codes));
    } catch {
      // ignore
    }
  },

  /**
   * Quick guest login for immediate visualizer exploration.
   */
  async loginAsGuest(): Promise<User> {
    const guestUser: User = {
      id: `guest_${Date.now()}`,
      name: 'Guest Explorer',
      email: 'guest@chunkie.local',
      createdAt: new Date().toISOString(),
      isDemo: true,
      avatarColor: '#55514b',
      savedPipelinesCount: 0,
    };
    safeStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(guestUser));
    return guestUser;
  },

  /**
   * Logs out the user and clears session storage.
   */
  logout() {
    safeStorage.removeItem(STORAGE_CURRENT_USER_KEY);
  },

  getRememberedEmail(): string {
    return safeStorage.getItem(STORAGE_REMEMBER_KEY) || '';
  },

  setRememberedEmail(email: string) {
    if (email) {
      safeStorage.setItem(STORAGE_REMEMBER_KEY, email);
    } else {
      safeStorage.removeItem(STORAGE_REMEMBER_KEY);
    }
  },

  getDemoCredentials() {
    return {
      email: DEMO_USER.email,
      password: DEMO_USER.passwordHash,
    };
  },
};
