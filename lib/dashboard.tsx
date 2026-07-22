"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api, Branding } from "./api";
import { useAuth } from "./auth";

interface DashboardState {
  affiliations: string[];
  branding: Branding | null;
  refreshBranding: () => void;
  saveBranding: (displayName: string, logoUrl: string | null) => Promise<void>;
}

const Ctx = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { user, activeAffiliation } = useAuth();
  const [affiliations, setAffiliations] = useState<string[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    api.affiliations().then(setAffiliations).catch(() => {});
  }, [user]);

  const refreshBranding = useCallback(() => {
    if (!user) return;
    // master with no selection yet -> show default app branding
    if (user.role === "master" && !activeAffiliation) {
      setBranding({ affiliation: "", display_name: "ClubLounge", logo_url: null });
      return;
    }
    api
      .getBranding(user.token, activeAffiliation)
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [user, activeAffiliation]);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  const saveBranding = useCallback(
    async (displayName: string, logoUrl: string | null) => {
      if (!user) return;
      const b = await api.setBranding(
        user.token,
        activeAffiliation,
        displayName,
        logoUrl
      );
      setBranding(b);
    },
    [user, activeAffiliation]
  );

  return (
    <Ctx.Provider
      value={{ affiliations, branding, refreshBranding, saveBranding }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
