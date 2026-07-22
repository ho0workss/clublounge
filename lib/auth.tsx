"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { api, SessionUser } from "./api";

const TOKEN_KEY = "cl_token";
const AFF_KEY = "cl_selected_aff";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /** Affiliation whose data is currently displayed. For members this is fixed. */
  activeAffiliation: string | null;
  setActiveAffiliation: (aff: string) => void;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, affiliation: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAff, setActiveAff] = useState<string | null>(null);

  // Restore session on first load.
  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me(token)
      .then((me) => {
        const restored: SessionUser = { token, ...me };
        setUser(restored);
        initAffiliation(restored);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  function initAffiliation(u: SessionUser) {
    if (u.role === "master") {
      const saved =
        typeof window !== "undefined" ? localStorage.getItem(AFF_KEY) : null;
      setActiveAff(saved || null);
    } else {
      setActiveAff(u.affiliation);
    }
  }

  function persist(u: SessionUser) {
    localStorage.setItem(TOKEN_KEY, u.token);
    setUser(u);
    initAffiliation(u);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      activeAffiliation: activeAff,
      setActiveAffiliation: (aff: string) => {
        setActiveAff(aff);
        if (typeof window !== "undefined") localStorage.setItem(AFF_KEY, aff);
      },
      login: async (username, password) => {
        persist(await api.login(username, password));
      },
      signup: async (username, password, affiliation) => {
        persist(await api.signup(username, password, affiliation));
      },
      logout: async () => {
        if (user) {
          try {
            await api.logout(user.token);
          } catch {
            /* ignore */
          }
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(AFF_KEY);
        setUser(null);
        setActiveAff(null);
      },
    }),
    [user, loading, activeAff]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
