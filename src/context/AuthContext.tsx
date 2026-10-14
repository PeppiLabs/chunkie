import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authService } from '../lib/authService';
import type { User } from '../types/auth';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  loginAsGuest: () => Promise<User>;
  logout: () => void;
  sendResetCode: (email: string) => Promise<{ code: string }>;
  verifyResetCode: (email: string, code: string) => Promise<boolean>;
  resetPassword: (email: string, newPassword: string) => Promise<void>;
  demoCredentials: { email: string; password: string };
  rememberedEmail: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rememberedEmail, setRememberedEmail] = useState('');

  useEffect(() => {
    // Load initial user and remembered email
    const existing = authService.getCurrentUser();
    setUser(existing);
    setRememberedEmail(authService.getRememberedEmail());
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string, rememberMe = false): Promise<User> => {
    const loggedUser = await authService.login(email, password, rememberMe);
    setUser(loggedUser);
    if (rememberMe) {
      setRememberedEmail(email);
    } else {
      setRememberedEmail('');
    }
    return loggedUser;
  };

  const register = async (name: string, email: string, password: string): Promise<User> => {
    const newUser = await authService.register(name, email, password);
    setUser(newUser);
    return newUser;
  };

  const loginAsGuest = async (): Promise<User> => {
    const guest = await authService.loginAsGuest();
    setUser(guest);
    return guest;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const sendResetCode = async (email: string) => {
    return authService.sendPasswordResetCode(email);
  };

  const verifyResetCode = async (email: string, code: string) => {
    return authService.verifyResetCode(email, code);
  };

  const resetPassword = async (email: string, newPassword: string) => {
    return authService.resetPassword(email, newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginAsGuest,
        logout,
        sendResetCode,
        verifyResetCode,
        resetPassword,
        demoCredentials: authService.getDemoCredentials(),
        rememberedEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
