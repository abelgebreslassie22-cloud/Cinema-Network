import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../utils/firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  name?: string | null;
  username?: string | null;
  photoURL?: string | null;
  provider: 'firebase' | 'custom';
  accountKey: string;
  createdAt?: string | number | Date | null;
}


export function getAccountKey(email: string | null | undefined, fallbackUid: string): string {
  if (email && email.trim()) {
    const normalized = email.trim().toLowerCase();
    return `email_${normalized.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  return fallbackUid;
}

export async function resolveAccountKey(email: string | null | undefined, uid: string, displayName: string | null | undefined, provider: string): Promise<string> {
  if (email && email.trim()) {
    try {
      const res = await fetch('/api/auth/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), displayName: displayName || '', provider })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.internalUserId) {
          return data.internalUserId;
        }
      }
    } catch(e) {
      console.error('Failed to resolve internal user ID:', e);
    }
  }
  return getAccountKey(email, uid);
}


interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  loginCustomUser: (token: string, userData: any) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  loginCustomUser: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for custom token first
    // Initial token check moved to auth listener

    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || null;
        const uid = firebaseUser.uid;
        const accountKey = await resolveAccountKey(email, uid, firebaseUser.displayName, 'firebase');
        
        const fallbackName = firebaseUser.displayName || (email ? email.split('@')[0] : 'User');
        const fallbackUsername = email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') : 'user';

        setUser({
          uid,
          email,
          name: fallbackName,
          username: fallbackUsername,
          displayName: firebaseUser.displayName || fallbackName,
          photoURL: firebaseUser.photoURL,
          provider: 'firebase',
          accountKey,
          createdAt: firebaseUser.metadata?.creationTime || null
        });
        localStorage.removeItem('customAuthToken');

        // Fetch stored profile if exists
        if (email) {
          fetch(`/api/user/profile?email=${encodeURIComponent(email)}`)
            .then(r => r.ok ? r.json() : null)
            .then(p => {
              if (p) {
                setUser(curr => curr ? {
                  ...curr,
                  name: p.name || curr.name,
                  username: p.username || curr.username,
                  displayName: p.displayName || curr.displayName,
                  createdAt: p.createdAt || curr.createdAt
                } : curr);
              }
            }).catch(() => {});
        }
      } else {
        const token = localStorage.getItem('customAuthToken');
        if (token) {
          try {
            const decoded = JSON.parse(atob(token));
            if (decoded && decoded.uid) {
              const email = decoded.email || null;
              const uid = String(decoded.uid);
              const accountKey = await resolveAccountKey(email, uid, decoded.displayName, 'password');
              const userName = decoded.name || decoded.displayName || (email ? email.split('@')[0] : 'User');
              const userUsername = decoded.username || (email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') : 'user');

              setUser({
                uid,
                email,
                name: userName,
                username: userUsername,
                displayName: decoded.displayName || userName,
                provider: 'custom',
                accountKey,
                createdAt: decoded.createdAt || null
              });

              // Background profile refresh to get freshest username/name
              if (email || uid) {
                fetch(`/api/user/profile?email=${encodeURIComponent(email || '')}&uid=${encodeURIComponent(uid)}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(p => {
                    if (p) {
                      setUser(curr => curr ? {
                        ...curr,
                        name: p.name || curr.name,
                        username: p.username || curr.username,
                        displayName: p.displayName || curr.displayName,
                        createdAt: p.createdAt || curr.createdAt
                      } : curr);
                    }
                  }).catch(() => {});
              }
            }
          } catch(e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginCustomUser = async (token: string, userData: any) => {
    localStorage.setItem('customAuthToken', token);
    const email = userData.email || null;
    const uid = String(userData.uid);
    const accountKey = await resolveAccountKey(email, uid, userData.displayName || userData.name, 'password');
    const userName = userData.name || userData.displayName || (email ? email.split('@')[0] : 'User');
    const userUsername = userData.username || (email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') : 'user');

    setUser({
      uid,
      email,
      name: userName,
      username: userUsername,
      displayName: userData.displayName || userName,
      provider: 'custom',
      accountKey,
      createdAt: userData.createdAt || null
    });
  };

  const logout = () => {
    localStorage.removeItem('customAuthToken');
    setUser(null);
    auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, loginCustomUser }}>
      {children}
    </AuthContext.Provider>
  );
};
