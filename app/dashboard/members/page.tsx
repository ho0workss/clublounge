"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ManagedUser, Role } from "@/lib/api";
import {
  ROLE_LABEL,
  assignableRoles,
  canDeleteUser,
  canManageMembers,
} from "@/lib/roles";

const roleBadge: Record<Role, string> = {
  master: "bg-brand-600",
  chief_admin: "bg-emerald-600",
  operator: "bg-sky-600",
  member: "bg-slate-400",
};

export default function MembersPage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMaster = role === "master";
  const needsAffiliation = isMaster && !activeAffiliation;
  const allowed = canManageMembers(role);

  const load = useCallback(() => {
    if (!user || !allowed || needsAffiliation) {
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
  }, [user, activeAffiliation, allowed, needsAffiliation]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(target: ManagedUser, newRole: Role) {
    if (!user || newRole === target.role) return;
    try {
      await api.setUserRole(user.token, target.id, newRole);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function remove(target: ManagedUser) {
    if (!user) return;
    if (!confirm(`'${target.username}' 계정을 탈퇴 처리하시겠습니까? 되돌릴 수 없습니다.`))
      return;
    try {
      await api.deleteUser(user.token, target.id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!allowed) {
    return <p className="text-slate-500">권한이 없습니다.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          👥 구성원 관리
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isMaster
            ? "선택한 소속의 계정 권한을 지정하거나 탈퇴 처리합니다."
            : `[${activeAffiliation}] 소속 구성원의 권한을 관리합니다.`}
        </p>
      </div>

      {needsAffiliation ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="text-4xl">👆</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">소속을 선택하세요</p>
          <p className="mt-1 text-sm text-slate-500">
            우측 상단에서 관리할 소속을 선택하면 구성원이 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && <div className="p-4 text-sm text-red-600">{error}</div>}
          {loading ? (
            <div className="p-10 text-center text-slate-400">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-slate-500">구성원이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">아이디</th>
                    <th className="px-4 py-3 font-semibold">권한</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                    <th className="px-4 py-3 text-right font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const isSelf = u.username === user?.username;
                    const options = assignableRoles(role, u.role);
                    const canEditRole = !isSelf && options.length > 0;
                    const canRemove = !isSelf && canDeleteUser(role, u.role);
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-xs text-slate-400">(나)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canEditRole ? (
                            <select
                              value={u.role}
                              onChange={(e) => changeRole(u, e.target.value as Role)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                            >
                              {(options.includes(u.role)
                                ? options
                                : [u.role, ...options]
                              ).map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${roleBadge[u.role]}`}
                            >
                              {ROLE_LABEL[u.role]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.active ? (
                            <span className="text-emerald-600">활성</span>
                          ) : (
                            <span className="text-amber-600">대기</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRemove ? (
                            <button
                              onClick={() => remove(u)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                            >
                              탈퇴
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
