"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useDashboard } from "@/lib/dashboard";
import SettingsModal from "./SettingsModal";
import { ROLE_LABEL } from "@/lib/roles";

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout, activeAffiliation, setActiveAffiliation } = useAuth();
  const { branding, affiliations } = useDashboard();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const role = user?.role ?? "member";
  const isMaster = role === "master";

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
      {/* mobile menu button */}
      <button
        onClick={onMenuClick}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="메뉴 열기"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* logo + name (top-left, per spec) */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {branding?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt="logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xl">🍸</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-800 sm:text-lg">
            {branding?.display_name || "ClubLounge"}
          </h1>
          {activeAffiliation && (
            <p className="truncate text-xs text-slate-400">{activeAffiliation}</p>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* master affiliation selector */}
        {isMaster && (
          <select
            value={activeAffiliation ?? ""}
            onChange={(e) => setActiveAffiliation(e.target.value)}
            className="max-w-[42vw] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 outline-none focus:border-brand-500 sm:max-w-none"
          >
            <option value="" disabled>
              소속 선택
            </option>
            {affiliations.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {/* settings (all users) */}
        <button
          onClick={() => setShowSettings(true)}
          className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          title="설정"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
        </button>

        <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 sm:flex">
          <span className="text-sm font-medium text-slate-600">
            {user?.username}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
              isMaster
                ? "bg-brand-600"
                : role === "chief_admin"
                ? "bg-emerald-600"
                : role === "operator"
                ? "bg-sky-600"
                : "bg-slate-400"
            }`}
          >
            {ROLE_LABEL[role]}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
        >
          로그아웃
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  );
}
