import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, EffectivePermissions, PublicUser } from '@sephraxia/shared';

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  permissions: EffectivePermissions | null;
  setSession: (user: PublicUser, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  patchUser: (patch: Partial<PublicUser>) => void;
  setPermissions: (permissions: EffectivePermissions) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      permissions: null,
      setSession: (user, tokens) =>
        set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      setTokens: (tokens) =>
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      patchUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      setPermissions: (permissions) => set({ permissions }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, permissions: null }),
    }),
    {
      name: 'sephraxia-auth',
      // Don't persist permissions — always refetch on connect.
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);
