"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useDashboard } from "@/lib/dashboard";
import { api, ManagedUser, Role } from "@/lib/api";
import {
  ROLE_LABEL,
  ROLE_BADGE,
  assignableRoles,
  canDeleteUser,
  canEditBranding,
  canManageMembers,
} from "@/lib/roles";

const MIN_PX = 300;
const MAX_PX = 1000;
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white";

type Tab = "password" | "affiliation" | "members";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const role = user?.role ?? "member";

  const tabs: { id: Tab; label: string }[] = [{ id: "password", label: "비밀번호" }];
  if (canEditBranding(role)) tabs.push({ id: "affiliation", label: "소속 설정" });
  if (canManageMembers(role)) tabs.push({ id: "members", label: "구성원 관리" });

  const [tab, setTab] = useState<Tab>("password");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">설정</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex gap-1 border-b border-slate-100 px-4 pt-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === t.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          {tab === "password" && <PasswordTab />}
          {tab === "affiliation" && <AffiliationTab />}
          {tab === "members" && <MembersTab />}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {msg.text}
    </p>
  );
}

function PasswordTab() {
  const { user } = useAuth();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPw !== confirm) {
      setMsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(user!.token, oldPw, newPw);
      setMsg({ ok: true, text: "비밀번호가 변경되었습니다." });
      setOldPw("");
      setNewPw("");
      setConfirm("");
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-500">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>
      <input type="password" className={inputCls} placeholder="현재 비밀번호"
        value={oldPw} onChange={(e) => setOldPw(e.target.value)}
        autoComplete="current-password" required />
      <input type="password" className={inputCls} placeholder="새 비밀번호 (4자 이상)"
        value={newPw} onChange={(e) => setNewPw(e.target.value)}
        autoComplete="new-password" required />
      <input type="password" className={inputCls} placeholder="새 비밀번호 확인"
        value={confirm} onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password" required />
      <Msg msg={msg} />
      <button type="submit" disabled={busy}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {busy ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}

function AffiliationTab() {
  const { user, activeAffiliation, applyAffiliationRename } = useAuth();
  const { branding, saveBranding, refreshBranding } = useDashboard();

  const [newName, setNewName] = useState(activeAffiliation ?? "");
  const [displayName, setDisplayName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setNewName(activeAffiliation ?? ""), [activeAffiliation]);
  useEffect(() => {
    setDisplayName(branding?.display_name ?? "");
    setLogo(branding?.logo_url ?? null);
  }, [branding]);

  const pickFile = useCallback((file: File) => {
    setMsg(null);
    if (!file.type.startsWith("image/")) {
      setMsg({ ok: false, text: "이미지 파일만 업로드할 수 있습니다." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width < MIN_PX || img.height < MIN_PX || img.width > MAX_PX || img.height > MAX_PX) {
          setMsg({
            ok: false,
            text: `로고 크기는 ${MIN_PX}×${MIN_PX} ~ ${MAX_PX}×${MAX_PX}px 사이여야 합니다. (현재 ${img.width}×${img.height})`,
          });
          return;
        }
        setLogo(dataUrl);
      };
      img.onerror = () => setMsg({ ok: false, text: "이미지를 읽을 수 없습니다." });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  if (!activeAffiliation) {
    return (
      <p className="text-sm text-slate-500">
        먼저 우측 상단(또는 홈 화면)에서 소속을 선택하세요.
      </p>
    );
  }

  async function rename() {
    const nn = newName.trim();
    if (!nn || nn === activeAffiliation) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.renameAffiliation(user!.token, activeAffiliation, nn);
      applyAffiliationRename(activeAffiliation!, nn);
      refreshBranding();
      setMsg({ ok: true, text: "소속명이 변경되었습니다." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveBrand() {
    setBusy(true);
    setMsg(null);
    try {
      await saveBranding(displayName.trim() || activeAffiliation!, logo);
      setMsg({ ok: true, text: "로고·이름이 저장되었습니다." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-700">소속명 변경</label>
        <div className="flex gap-2">
          <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button onClick={rename}
            disabled={busy || !newName.trim() || newName.trim() === activeAffiliation}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            변경
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-5">
        <label className="block text-sm font-semibold text-slate-700">로고 · 이름</label>
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-2xl">🍸</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              이미지 선택 ({MIN_PX}~{MAX_PX}px)
            </button>
            {logo && (
              <button onClick={() => setLogo(null)} className="text-xs text-slate-400 hover:text-red-500">
                로고 제거
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            로고 옆 이름 (영문·특수문자 가능)
          </label>
          <input className={inputCls} value={displayName} maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="예: ClubLounge, ABC & Co., 本店 …" />
        </div>

        <button onClick={saveBrand} disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? "저장 중…" : "로고·이름 저장"}
        </button>
      </div>

      <Msg msg={msg} />
    </div>
  );
}

function MembersTab() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMaster = role === "master";
  const needsAffiliation = isMaster && !activeAffiliation;

  const load = useCallback(() => {
    if (!user || needsAffiliation) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listUsers(user.token, activeAffiliation)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, activeAffiliation, needsAffiliation]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(t: ManagedUser, r: Role) {
    if (!user || r === t.role) return;
    try {
      await api.setUserRole(user.token, t.id, r);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }
  async function remove(t: ManagedUser) {
    if (!user) return;
    if (!confirm(`'${t.username}' 계정을 탈퇴 처리하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await api.deleteUser(user.token, t.id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (needsAffiliation)
    return <p className="text-sm text-slate-500">먼저 소속을 선택하세요.</p>;
  if (loading) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">구성원이 없습니다.</p>;

  return (
    <div className="space-y-2">
      {rows.map((u) => {
        const isSelf = u.username === user?.username;
        const options = assignableRoles(role, u.role);
        const canEditRole = !isSelf && options.length > 0;
        const canRemove = !isSelf && canDeleteUser(role, u.role);
        return (
          <div key={u.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700">
                {u.username}
                {isSelf && <span className="ml-1 text-xs text-slate-400">(나)</span>}
                {!u.active && <span className="ml-1 text-xs text-amber-600">대기</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canEditRole ? (
                <select value={u.role}
                  onChange={(e) => changeRole(u, e.target.value as Role)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500">
                  {(options.includes(u.role) ? options : [u.role, ...options]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              ) : (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${ROLE_BADGE[u.role]}`}>
                  {ROLE_LABEL[u.role]}
                </span>
              )}
              {canRemove && (
                <button onClick={() => remove(u)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                  탈퇴
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
