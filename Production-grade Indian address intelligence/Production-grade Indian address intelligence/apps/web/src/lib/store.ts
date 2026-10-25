import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from './types';

type AppState = {
  user: User | null;
  setUser: (user: User | null) => void;
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      token: null,
      setToken: (token) => set({ token }),
      logout: () => {
        set({ token: null, user: null });
        window.location.href = '/';
      }
    }),
    {
      name: 'mdds-auth',
      partialize: (s) => ({ token: s.token, user: s.user })
    }
  )
);
