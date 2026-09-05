import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError('プロフィールの取得に失敗しました。');
      return;
    }

    setProfile((data as Profile) ?? null);
    setProfileError(data ? null : 'プロフィールが見つかりません。');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          setProfileError('ログイン状態の取得に失敗しました。');
          return;
        }
        setSession(data.session);
        if (data.session?.user) await loadProfile(data.session.user.id);
      })
      .catch(() => {
        if (active) setProfileError('ログイン状態の取得に失敗しました。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        // auth callback 内で別の Supabase リクエストを await するとデッドロックし得るため、次のタスクで取得する。
        setTimeout(() => {
          if (active) void loadProfile(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async (redirectPath = '/') => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, profileError, loading, refreshProfile, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
