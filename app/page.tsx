"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

type Mode = "login" | "signup";

export default function AuthPage() {
  const { user, loading, login, signup } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [newAff, setNewAff] = useState("");
  const [affiliations, setAffiliations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    api.affiliations().then(setAffiliations).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
        router.replace("/dashboard");
      } else {
        const aff = affiliation === "__new__" ? newAff.trim() : affiliation.trim();
        if (!aff) throw new Error("소속을 선택하거나 입력해 주세요.");
        const res = await signup(username.trim(), password, aff);
        if (res.pending) {
          setMode("login");
          setPassword("");
          setAffiliation("");
          setNewAff("");
          setNotice(
            `'${res.affiliation}' 소속은 마스터 승인 후 이용할 수 있습니다. 승인되면 로그인해 주세요.`
          );
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (err: any) {
      setError(err.message ?? "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || user) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-400">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-indigo-500 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 text-white">
          <div className="mx-auto mb-4 h-16 w-16 grid place-items-center rounded-2xl bg-white/15 backdrop-blur text-3xl shadow-lg">
            🍸
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ClubLounge</h1>
          <p className="mt-2 text-sm text-white/70">소속별 매장 운영 관리 시스템</p>
        </div>

        <div className="rounded-2xl bg-white shadow-2xl p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-6">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m
                    ? "bg-white text-brand-700 shadow"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="아이디">
              <input
                className="cl-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디"
                autoComplete="username"
                required
              />
            </Field>

            <Field label="비밀번호">
              <input
                type="password"
                className="cl-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </Field>

            {mode === "signup" && (
              <Field label="소속">
                <select
                  className="cl-input"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    소속을 선택하세요
                  </option>
                  {affiliations.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value="__new__">+ 새 소속 직접 입력</option>
                </select>
                {affiliation === "__new__" && (
                  <input
                    className="cl-input mt-2"
                    value={newAff}
                    onChange={(e) => setNewAff(e.target.value)}
                    placeholder="새 소속명 입력 (예: 강남점)"
                    required
                  />
                )}
              </Field>
            )}

            {mode === "signup" && affiliation === "__new__" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                새 소속은 마스터 승인 후 활성화됩니다. 승인 전에는 로그인할 수 없습니다.
              </p>
            )}

            {notice && (
              <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">
                {notice}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand-600 py-3 text-white font-semibold shadow-lg shadow-brand-600/30 hover:bg-brand-700 transition disabled:opacity-60"
            >
              {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          © {new Date().getFullYear()} ClubLounge
        </p>
      </div>

      <style jsx global>{`
        .cl-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0.65rem 0.85rem;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.15s;
        }
        .cl-input:focus {
          border-color: rgb(99 102 241);
          background: white;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
