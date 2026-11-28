import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { getManagerDashboard } from '@/services/managerService';
import { toServiceError } from '@/services/supabase';
import type { AppManagerDashboardResponse } from '@/types/database';

export interface ManagerDataContextValue {
  data: AppManagerDashboardResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const ManagerDataContext = createContext<ManagerDataContextValue | null>(null);

export function useManagerData(): ManagerDataContextValue {
  const value = use(ManagerDataContext);
  if (!value) {
    throw new Error('useManagerData must be used inside <ManagerDataProvider>.');
  }
  return value;
}

export function ManagerDataProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppManagerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getManagerDashboard()
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(toServiceError(err, 'Unable to load App Manager dashboard.').message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await getManagerDashboard();
      setData(res);
    } catch (err) {
      setError(toServiceError(err, 'Unable to refresh App Manager dashboard.').message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  return (
    <ManagerDataContext.Provider value={{ data, loading, refreshing, error, refresh }}>
      {children}
    </ManagerDataContext.Provider>
  );
}
