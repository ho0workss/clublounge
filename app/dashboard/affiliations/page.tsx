"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, AdminAffiliation } from "@/lib/api";
import { canManageAffiliations } from "@/lib/roles";

export default function AffiliationsPage() {
  const { user } = useAuth();
  const role = user?.role ?? "member";
  const [rows, setRows] = useState<AdminAffiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allowed = canManageAffiliations(role);

  const load = useCallback(() => {
    if (!user || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .adminAffiliations(user.token)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, allowed]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: Promise<void>) {
    try {
      await fn;
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!allowed) return <p className="text-slate-500">권한이 없습니다.</p>;

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");

  return (
    <div>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          🏢 소속 관리
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          신규 소속 승인·거절 및 소속(계정·데이터 포함) 삭제를 관리합니다.
        </p>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {loading ? (
        <div className="p-10 text-center text-slate-400">불러오는 중…</div>
      ) : (
        <div className="space-y-8">
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">
              승인 대기 <span className="text-amber-600">({pending.length})</span>
            </h3>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
                대기 중인 소속이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{a.name}</p>
                      <p className="text-xs text-slate-500">
                        신청자: {a.created_by ?? "-"} · 계정 {a.members}개
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          act(api.approveAffiliation(user!.token, a.name))
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`'${a.name}' 신청을 거절하고 관련 계정을 삭제합니다.`))
                            act(api.rejectAffiliation(user!.token, a.name));
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-700">
              활성 소속 <span className="text-slate-400">({approved.length})</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {approved.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-500">계정 {a.members}개</p>
                  </div>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `'${a.name}' 소속을 삭제하면 해당 소속의 모든 계정·데이터가 함께 삭제됩니다. 계속하시겠습니까?`
                        )
                      )
                        act(api.deleteAffiliation(user!.token, a.name));
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
