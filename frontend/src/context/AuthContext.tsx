import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { AuthUser, UserRole } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const storageKey = 'water-velocity-auth';
// auth imported from firebase.ts

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed: AuthUser = JSON.parse(cached);
      setUser(parsed);
      setAuthToken(parsed.token);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    const authed: AuthUser = {
      uid: cred.user.uid,
      email: cred.user.email || email,
      role: 'user',
      token
    };
    setUser(authed);
    localStorage.setItem(storageKey, JSON.stringify(authed));
  };

  const register = async (email: string, password: string, role: UserRole) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    const authed: AuthUser = {
      uid: cred.user.uid,
      email: cred.user.email || email,
      role,
      token
    };
    setUser(authed);
    localStorage.setItem(storageKey, JSON.stringify(authed));
  };

  const logout = () => {
    signOut(auth).catch(() => undefined);
    setUser(null);
    setAuthToken(undefined);
    localStorage.removeItem(storageKey);
  };

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
