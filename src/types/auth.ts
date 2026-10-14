/**
 * Types for user authentication and account management.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isDemo?: boolean;
  avatarColor?: string;
  savedPipelinesCount?: number;
}

export type AuthMode = 'login' | 'register' | 'forgot-password';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface PasswordStrength {
  score: number; // 0 to 4
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}
