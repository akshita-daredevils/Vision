import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error('Anonymous sign-in failed', err);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const authed: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || 'guest',
        role: 'user',
        token: await firebaseUser.getIdToken()
      };
      setUser(authed);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const authed: AuthUser = {
      uid: cred.user.uid,
      email: cred.user.email || email,
      role: 'user',
      token: await cred.user.getIdToken()
    };
    setUser(authed);
  };

  const register = async (email: string, password: string, role: UserRole) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const authed: AuthUser = {
      uid: cred.user.uid,
      email: cred.user.email || email,
      role,
      token: await cred.user.getIdToken()
    };
    setUser(authed);
  };

  const logout = () => {
    signOut(auth).catch(() => undefined);
    setUser(null);
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
