"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, AdminAffiliation } from "@/lib/api";
import { MENUS } from "@/lib/menu";

export default function MasterAffiliationsPanel() {
  const { user, activeAffiliation, setActiveAffiliation } = useAuth();
  const [rows, setRows] = useState<AdminAffiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(activeAffiliation);

  useEffect(() => {
    if (!user) return;
    api
      .adminAffiliations(user.token)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const approved = rows.filter((r) => r.status === "approved");
  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">
          소속 목록 <span className="text-slate-400">({approved.length})</span>
        </h3>
        {pending.length > 0 && (
          <Link
            href="/dashboard/affiliations"
            className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
          >
            승인 대기 {pending.length}건 →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          불러오는 중…
        </div>
      ) : approved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          등록된 소속이 없습니다. 회원가입으로 소속이 신청되면 여기에서 승인·관리할 수 있습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {approved.map((a) => {
            const expanded = open === a.name;
            const isActive = activeAffiliation === a.name;
            return (
              <div
                key={a.name}
                className={`overflow-hidden rounded-2xl border bg-white transition ${
                  isActive ? "border-brand-400 ring-1 ring-brand-200" : "border-slate-200"
                }`}
              >
                <button
                  onClick={() => setOpen(expanded ? null : a.name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg ${
                      isActive ? "bg-brand-600 text-white" : "bg-slate-100"
                    }`}
                  >
                    🏢
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">
                      {a.name}
                      {isActive && (
                        <span className="ml-2 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          선택됨
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">계정 {a.members}개</p>
                  </div>
                  <span
                    className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                    <button
                      onClick={() => setActiveAffiliation(a.name)}
                      className="mb-3 w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto sm:px-5"
                    >
                      이 소속으로 전환
                    </button>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {MENUS.map((m) => (
                        <Link
                          key={m.slug}
                          href={`/dashboard/${m.slug}`}
                          onClick={() => setActiveAffiliation(a.name)}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                        >
                          <span>{m.icon}</span>
                          <span className="truncate">{m.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
