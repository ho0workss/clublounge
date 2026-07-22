"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { MENUS } from "@/lib/menu";

export default function DashboardHome() {
  const { user, activeAffiliation } = useAuth();
  const isMaster = user?.role === "master";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 sm:text-2xl">
          안녕하세요, {user?.username}님 👋
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isMaster
            ? activeAffiliation
              ? `현재 [${activeAffiliation}] 소속을 관리 중입니다. 우측 상단에서 소속을 전환할 수 있습니다.`
              : "마스터 계정입니다. 우측 상단에서 소속을 선택해 각 소속별 페이지를 확인하세요."
            : `[${activeAffiliation}] 소속 관리 페이지입니다.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MENUS.map((m) => (
          <Link
            key={m.slug}
            href={`/dashboard/${m.slug}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-2xl">
                {m.icon}
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 group-hover:text-brand-700">
                  {m.label}
                </h3>
                <p className="text-sm text-slate-500">{m.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
