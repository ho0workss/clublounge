"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { ROLE_RANK } from "@/lib/roles";

type Group = "sales" | "operator";
type Tab = "sales" | "operator" | "config";

export default function AttendancePage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const canManage = ROLE_RANK[role] >= ROLE_RANK.operator; // 운영진 이상
  const needsAff = role === "master" && !activeAffiliation;

  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("sales");

  const load = useCallback(async () => {
    if (!user || needsAff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await api.listRecords(user.token, "attendance", activeAffiliation));
    } finally {
      setLoading(false);
    }
  }, [user, activeAffiliation, needsAff]);

  useEffect(() => {
    load();
  }, [load]);

  const salesRows = useMemo(() => rows.filter((r) => r.data.group === "sales"), [rows]);
  const opRows = useMemo(() => rows.filter((r) => r.data.group === "operator"), [rows]);
  const config = useMemo(() => rows.find((r) => r.data.group === "config") || null, [rows]);

  async function addPerson(group: Group, name: string) {
    if (!user || !name.trim()) return;
    await api.upsertRecord(user.token, null, "attendance", activeAffiliation, {
      group,
      name: name.trim(),
      present: false,
    });
    load();
  }
  async function togglePresent(row: Rec) {
    if (!user) return;
    await api.upsertRecord(user.token, row.id, "attendance", activeAffiliation, {
      ...row.data,
      present: !row.data.present,
    });
    load();
  }
  async function removePerson(row: Rec) {
    if (!user) return;
    if (!confirm(`'${row.data.name}'을(를) 명단에서 삭제하시겠습니까?`)) return;
    await api.deleteRecord(user.token, row.id);
    load();
  }
  async function saveConfig(patch: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, config?.id ?? null, "attendance", activeAffiliation, {
      group: "config",
      opTarget: 0,
      salesTarget: 0,
      ...(config?.data ?? {}),
      ...patch,
    });
    load();
  }

  const tabs: { id: Tab; label: string; icon: string; manageOnly?: boolean }[] = [
    { id: "sales", label: "영업진", icon: "💼" },
    { id: "operator", label: "운영진", icon: "🛡️", manageOnly: true },
    { id: "config", label: "출근인원 설정", icon: "⚙️", manageOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.manageOnly || canManage);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "sales";

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          🕐 출근부
        </h2>
      </div>

      {needsAff ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="text-4xl">👆</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">소속을 선택하세요</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeTab === t.id ? "bg-white text-brand-700 shadow" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400">불러오는 중…</div>
          ) : activeTab === "sales" ? (
            <Roster
              title="영업진"
              rows={salesRows}
              canManage={canManage}
              target={Number(config?.data?.salesTarget) || 0}
              onAdd={(n) => addPerson("sales", n)}
              onToggle={togglePresent}
              onRemove={removePerson}
            />
          ) : activeTab === "operator" ? (
            <Roster
              title="운영진"
              rows={opRows}
              canManage={canManage}
              target={Number(config?.data?.opTarget) || 0}
              onAdd={(n) => addPerson("operator", n)}
              onToggle={togglePresent}
              onRemove={removePerson}
            />
          ) : (
            <ConfigPanel
              config={config}
              opRows={opRows}
              salesRows={salesRows}
              onSave={saveConfig}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 명단(출근 체크) ---------- */
function Roster({
  title,
  rows,
  canManage,
  target,
  onAdd,
  onToggle,
  onRemove,
}: {
  title: string;
  rows: Rec[];
  canManage: boolean;
  target: number;
  onAdd: (name: string) => void;
  onToggle: (row: Rec) => void;
  onRemove: (row: Rec) => void;
}) {
  const [name, setName] = useState("");
  const present = rows.filter((r) => r.data.present).length;

  return (
    <div>
      {/* 요약 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-bold text-slate-700">{title} 출근 현황</span>
        <span className="text-2xl font-extrabold text-brand-600">
          {present}
          <span className="text-base font-semibold text-slate-400"> / {rows.length}명</span>
        </span>
        {target > 0 && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              present >= target ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            목표 {target}명 {present >= target ? "달성" : `· ${target - present}명 부족`}
          </span>
        )}
      </div>

      {canManage && (
        <div className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAdd(name);
                setName("");
              }
            }}
            placeholder={`${title} 이름 입력 후 추가`}
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
          <button
            onClick={() => {
              onAdd(name);
              setName("");
            }}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + 추가
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          등록된 {title}이(가) 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const on = !!r.data.present;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      on ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <span className="truncate font-semibold text-slate-800">{r.data.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => canManage && onToggle(r)}
                    disabled={!canManage}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      on
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    } ${canManage ? "hover:brightness-95" : "cursor-default"}`}
                  >
                    {on ? "출근" : "미출근"}
                  </button>
                  {canManage && (
                    <button
                      onClick={() => onRemove(r)}
                      className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- 출근인원 설정 (운영진 이상) ---------- */
function ConfigPanel({
  config,
  opRows,
  salesRows,
  onSave,
}: {
  config: Rec | null;
  opRows: Rec[];
  salesRows: Rec[];
  onSave: (patch: Record<string, any>) => void;
}) {
  const [opTarget, setOpTarget] = useState(String(Number(config?.data?.opTarget) || 0));
  const [salesTarget, setSalesTarget] = useState(String(Number(config?.data?.salesTarget) || 0));

  const opPresent = opRows.filter((r) => r.data.present).length;
  const salesPresent = salesRows.filter((r) => r.data.present).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">출근 목표 인원 설정</h3>
        <p className="mb-4 text-xs text-slate-400">
          각 그룹의 목표 출근 인원을 설정하면, 영업진·운영진 화면 상단에 달성 여부가 표시됩니다.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">운영진 목표(명)</span>
            <input
              value={opTarget}
              onChange={(e) => setOpTarget(e.target.value)}
              type="number"
              min={0}
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">영업진 목표(명)</span>
            <input
              value={salesTarget}
              onChange={(e) => setSalesTarget(e.target.value)}
              type="number"
              min={0}
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
          </label>
          <button
            onClick={() =>
              onSave({
                opTarget: Math.max(0, Number(opTarget) || 0),
                salesTarget: Math.max(0, Number(salesTarget) || 0),
              })
            }
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            저장
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard
          label="운영진"
          present={opPresent}
          total={opRows.length}
          target={Number(config?.data?.opTarget) || 0}
        />
        <SummaryCard
          label="영업진"
          present={salesPresent}
          total={salesRows.length}
          target={Number(config?.data?.salesTarget) || 0}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  present,
  total,
  target,
}: {
  label: string;
  present: number;
  total: number;
  target: number;
}) {
  const ok = target > 0 && present >= target;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-brand-600">
        {present}
        <span className="text-base font-semibold text-slate-400"> / {total}명 출근</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">
        목표 {target > 0 ? `${target}명` : "미설정"}
        {target > 0 && (
          <span className={`ml-1 font-semibold ${ok ? "text-emerald-600" : "text-amber-600"}`}>
            {ok ? "· 달성 ✓" : `· ${Math.max(0, target - present)}명 부족`}
          </span>
        )}
      </p>
    </div>
  );
}
