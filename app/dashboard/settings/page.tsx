"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { canEditBranding, ROLE_LABEL } from "@/lib/roles";
import BrandingModal from "@/components/BrandingModal";

export default function SettingsPage() {
  const { user, activeAffiliation, applyAffiliationRename } = useAuth();
  const role = user?.role ?? "member";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 sm:text-2xl">설정</h2>
        <p className="mt-1 text-sm text-slate-500">
          {user?.username} · {ROLE_LABEL[role]}
          {activeAffiliation ? ` · ${activeAffiliation}` : ""}
        </p>
      </div>

      <PasswordCard />

      {canEditBranding(role) && (
        <AffiliationCard
          affiliation={activeAffiliation}
          onRenamed={applyAffiliationRename}
        />
      )}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white";

function PasswordCard() {
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
    <Card title="비밀번호 변경" desc="현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          className={inputCls}
          placeholder="현재 비밀번호"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          autoComplete="current-password"
          required
        />
        <input
          type="password"
          className={inputCls}
          placeholder="새 비밀번호 (4자 이상)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          type="password"
          className={inputCls}
          placeholder="새 비밀번호 확인"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "변경 중…" : "비밀번호 변경"}
        </button>
      </form>
    </Card>
  );
}

function AffiliationCard({
  affiliation,
  onRenamed,
}: {
  affiliation: string | null;
  onRenamed: (oldName: string, newName: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(affiliation ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBranding, setShowBranding] = useState(false);

  useEffect(() => setName(affiliation ?? ""), [affiliation]);

  if (!affiliation) {
    return (
      <Card title="소속 설정">
        <p className="text-sm text-slate-500">
          먼저 우측 상단에서 소속을 선택하세요.
        </p>
      </Card>
    );
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const nn = name.trim();
    if (!nn || nn === affiliation) return;
    setBusy(true);
    try {
      await api.renameAffiliation(user!.token, affiliation, nn);
      onRenamed(affiliation!, nn);
      setMsg({ ok: true, text: "소속명이 변경되었습니다." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="소속 설정"
      desc={`[${affiliation}] 의 소속명과 로고·이름을 관리합니다.`}
    >
      <form onSubmit={rename} className="space-y-3">
        <label className="block text-sm font-medium text-slate-600">소속명</label>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !name.trim() || name.trim() === affiliation}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            변경
          </button>
        </div>
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <button
          onClick={() => setShowBranding(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          로고 · 이름 설정
        </button>
      </div>

      {showBranding && <BrandingModal onClose={() => setShowBranding(false)} />}
    </Card>
  );
}
