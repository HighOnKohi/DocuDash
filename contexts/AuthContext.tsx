import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  deleteAccount as deleteAccountService,
  getCurrentProfile,
  getSession,
  isAdminRole,
  isStaffRole,
  login,
  logout,
  onAuthStateChange,
  register,
  updateProfile as updateProfileService,
  type LoginInput,
  type LoginResult,
  type RegisterInput,
  type RegisterResult,
} from '@/services/authService';
import { cancelAllDocuDashNotifications } from '@/services/notificationService';
import { isSupabaseConfigured, toServiceError } from '@/services/supabase';
import type { DeleteAccountResponse, Profile, ProfileUpdate } from '@/types/database';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  configError: string | null;
  signIn: (input: LoginInput) => Promise<LoginResult>;
  signUp: (input: RegisterInput) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
  deleteAccount: (confirmation: string) => Promise<DeleteAccountResponse>;
  refreshProfile: () => Promise<Profile | null>;
  updateProfile: (updates: ProfileUpdate) => Promise<Profile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [configError] = useState<string | null>(
    isSupabaseConfigured
      ? null
      : 'Supabase environment variables are not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );

  const syncCounterRef = useRef(0);

  const loadSessionAndProfile = useCallback(async (nextSession: Session | null) => {
    const requestId = ++syncCounterRef.current;

    if (!nextSession?.user) {
      setSession(null);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setSession(nextSession);

    try {
      const loadedProfile = await getCurrentProfile(nextSession.user.id);
      if (syncCounterRef.current !== requestId) return;
      setProfile(loadedProfile);
    } catch {
      if (syncCounterRef.current !== requestId) return;
      setProfile(null);
    } finally {
      if (syncCounterRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let isActive = true;

    void (async () => {
      try {
        const initialSession = await getSession();
        if (!isActive) return;
        await loadSessionAndProfile(initialSession);
      } catch {
        if (!isActive) return;
        setSession(null);
        setProfile(null);
        setIsLoading(false);
      }
    })();

    const unsubscribe = onAuthStateChange((_event, nextSession) => {
      if (!isActive) return;
      void loadSessionAndProfile(nextSession);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [loadSessionAndProfile]);

  const signIn = useCallback(async (input: LoginInput): Promise<LoginResult> => {
    const result = await login(input);
    setSession(result.session);
    setProfile(result.profile);
    return result;
  }, []);

  const signUp = useCallback(async (input: RegisterInput): Promise<RegisterResult> => {
    const result = await register(input);
    if (result.session) {
      await loadSessionAndProfile(result.session);
    }
    return result;
  }, [loadSessionAndProfile]);

  const signOut = useCallback(async (): Promise<void> => {
    await logout();
    await cancelAllDocuDashNotifications().catch(() => {});
    setSession(null);
    setProfile(null);
  }, []);

  const deleteAccount = useCallback(
    async (confirmation: string): Promise<DeleteAccountResponse> => {
      const result = await deleteAccountService(confirmation);
      await cancelAllDocuDashNotifications().catch(() => {});
      setSession(null);
      setProfile(null);
      return result;
    },
    []
  );

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!session?.user) {
      setProfile(null);
      return null;
    }
    try {
      const latest = await getCurrentProfile(session.user.id);
      setProfile(latest);
      return latest;
    } catch (error) {
      throw toServiceError(error, 'Unable to refresh profile.');
    }
  }, [session]);

  const updateProfile = useCallback(async (updates: ProfileUpdate): Promise<Profile> => {
    const updated = await updateProfileService(updates);
    setProfile(updated);
    return updated;
  }, []);

  const user = session?.user ?? null;
  const isAuthenticated = Boolean(session && user && profile);
  const isStaff = isStaffRole(profile?.role);
  const isAdmin = isAdminRole(profile?.role);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isLoading,
        isAuthenticated,
        isStaff,
        isAdmin,
        configError,
        signIn,
        signUp,
        signOut,
        deleteAccount,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
