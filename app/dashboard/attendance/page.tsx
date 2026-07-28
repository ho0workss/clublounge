"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { ROLE_RANK } from "@/lib/roles";

type Tab = "sales" | "operator" | "config";
type ViewMode = "month" | "day";

const won = (n: any) => `${(Number(n) || 0).toLocaleString("ko-KR")}원`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function todayStr() {
  return fmt(new Date());
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
const prettyMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${y}년 ${m}월`;
};
function prettyDay(ds: string) {
  const [y, m, d] = ds.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}
/** 현재 시각을 KST(HH:MM)로 */
function nowKST() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** 대한민국 공휴일(대체공휴일 포함, 근사치 — 2025~2027) */
const HOLIDAYS = new Set<string>([
  // 2025
  "2025-01-01", "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30",
  "2025-03-01", "2025-03-03", "2025-05-05", "2025-05-06", "2025-06-06",
  "2025-08-15", "2025-10-03", "2025-10-06", "2025-10-07", "2025-10-08",
  "2025-10-09", "2025-12-25",
  // 2026
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01",
  "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06",
  "2026-07-17", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25",
  "2026-09-26", "2026-09-28", "2026-10-03", "2026-10-05", "2026-10-09",
  "2026-12-25",
  // 2027
  "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09",
  "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-07-17",
  "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16",
  "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25",
]);

/** 영업일: 금·토 + 공휴일 전날 (+ 사용자가 추가한 공휴일 반영) */
function operatingDates(ym: string, extra: string[] = []): string[] {
  const [y, m] = ym.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const all = new Set([...Array.from(HOLIDAYS), ...extra]);
  const res: string[] = [];
  for (let d = 1; d <= dim; d++) {
    const date = new Date(y, m - 1, d);
    const dow = date.getDay(); // 0 일 … 6 토
    const nextDs = fmt(new Date(y, m - 1, d + 1));
    if (dow === 5 || dow === 6 || all.has(nextDs)) res.push(fmt(date));
  }
  return res;
}
/** 그 날짜가 '공휴일 전날'이라서 포함됐는지 */
function isHolidayEve(ds: string, extra: string[] = []) {
  const [y, m, d] = ds.split("-").map(Number);
  const next = fmt(new Date(y, m - 1, d + 1));
  return HOLIDAYS.has(next) || extra.includes(next);
}
/** 연속된 영업일 묶음 안에서의 '오픈 N일차' */
function openIndexMap(dates: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  let idx = 0;
  for (let i = 0; i < dates.length; i++) {
    const prev = i > 0 ? dates[i - 1] : null;
    let consecutive = false;
    if (prev) {
      const a = new Date(prev + "T00:00:00");
      const b = new Date(dates[i] + "T00:00:00");
      consecutive = (b.getTime() - a.getTime()) / 86400000 === 1;
    }
    idx = consecutive ? idx + 1 : 1;
    map[dates[i]] = idx;
  }
  return map;
}
const RATE_TIERS = [1, 2, 3];

export default function AttendancePage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const canManage = ROLE_RANK[role] >= ROLE_RANK.operator; // 운영진 이상
  const needsAff = role === "master" && !activeAffiliation;

  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("sales");
  const [month, setMonth] = useState(todayMonth());
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  const configRow = useMemo(() => rows.find((r) => r.data.group === "config") || null, [rows]);
  const customHolidays: string[] = useMemo(
    () => (configRow?.data?.holidays ?? []) as string[],
    [configRow]
  );

  const opDates = useMemo(
    () => operatingDates(month, customHolidays),
    [month, customHolidays]
  );
  const openIdx = useMemo(() => openIndexMap(opDates), [opDates]);

  const [date, setDate] = useState<string>("");
  useEffect(() => {
    // 월이 바뀌면 그 달의 영업일 중 오늘 이후(없으면 첫 영업일)로
    if (opDates.length === 0) {
      setDate("");
      return;
    }
    const t = todayStr();
    setDate(opDates.find((d) => d >= t) ?? opDates[0]);
  }, [opDates]);

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
  const config = configRow;
  const guestPay = Number(config?.data?.guestPay) || 0;
  const guests = (config?.data?.guests ?? {}) as Record<string, number>;

  const rateFor = useCallback(
    (d: string) => {
      const idx = Math.min(openIdx[d] ?? 1, RATE_TIERS.length);
      return Number(config?.data?.opRates?.[String(idx)]) || 0;
    },
    [openIdx, config]
  );

  // ---- persistence ----
  async function savePerson(row: Rec, patch: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, row.id, "attendance", activeAffiliation, {
      ...row.data,
      ...patch,
    });
    load();
  }
  async function addPerson(group: "operator" | "sales", name: string, team?: string) {
    if (!user || !name.trim()) return;
    await api.upsertRecord(user.token, null, "attendance", activeAffiliation, {
      group,
      name: name.trim(),
      ...(group === "sales" ? { team: (team || "미배정").trim() } : {}),
    });
    load();
  }
  async function removePerson(row: Rec) {
    if (!user) return;
    if (!confirm(`'${row.data.name}'을(를) 삭제하시겠습니까?`)) return;
    await api.deleteRecord(user.token, row.id);
    load();
  }
  async function saveConfig(patch: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, config?.id ?? null, "attendance", activeAffiliation, {
      group: "config",
      guestPay: 0,
      opRates: {},
      guests: {},
      holidays: [],
      ...(config?.data ?? {}),
      ...patch,
    });
    load();
  }
  async function setGuestCount(d: string, next: number) {
    const g = { ...guests, [d]: Math.max(0, next) };
    await saveConfig({ guests: g });
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
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
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

          {/* 월/일 네비게이션 (영업진·운영진 탭) */}
          {activeTab !== "config" && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  ‹
                </button>
                <span className="min-w-[5.5rem] text-center text-sm font-bold text-slate-700">
                  {prettyMonth(month)}
                </span>
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  ›
                </button>
                <div className="ml-1 flex rounded-lg bg-slate-100 p-0.5">
                  {(["month", "day"] as ViewMode[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setViewMode(v)}
                      className={`rounded-md px-3 py-1 text-sm font-semibold ${
                        viewMode === v ? "bg-white text-brand-700 shadow" : "text-slate-500"
                      }`}
                    >
                      {v === "month" ? "월별" : "일자별"}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === "day" && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {opDates.length === 0 && (
                    <span className="text-xs text-slate-400">이 달의 영업일이 없습니다.</span>
                  )}
                  {opDates.map((d) => {
                    const eve = isHolidayEve(d, customHolidays);
                    return (
                      <button
                        key={d}
                        onClick={() => setDate(d)}
                        title={eve ? "공휴일 전날" : undefined}
                        className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                          date === d
                            ? "border-brand-500 bg-brand-600 text-white"
                            : eve
                            ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {eve && <span className="mr-0.5">🎌</span>}
                        {prettyDay(d)}
                        <span className="ml-1 opacity-70">·{openIdx[d]}일차</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-slate-400">불러오는 중…</div>
          ) : activeTab === "sales" ? (
            <SalesView
              rows={salesRows}
              viewMode={viewMode}
              date={date}
              opDates={opDates}
              guests={guests}
              guestPay={guestPay}
              onCheck={(row, patch) => savePerson(row, patch)}
              onGuest={setGuestCount}
            />
          ) : activeTab === "operator" ? (
            <OperatorView
              rows={opRows}
              viewMode={viewMode}
              date={date}
              opDates={opDates}
              openIdx={openIdx}
              rateFor={rateFor}
              onPay={(row, d, amt) =>
                savePerson(row, { pay: { ...(row.data.pay ?? {}), [d]: amt } })
              }
            />
          ) : (
            <ConfigView
              config={config}
              opRows={opRows}
              salesRows={salesRows}
              onSaveConfig={saveConfig}
              onAdd={addPerson}
              onRemove={removePerson}
              onEditPerson={savePerson}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ============================ 영업진 ============================ */
function SalesView({
  rows,
  viewMode,
  date,
  opDates,
  guests,
  guestPay,
  onCheck,
  onGuest,
}: {
  rows: Rec[];
  viewMode: ViewMode;
  date: string;
  opDates: string[];
  guests: Record<string, number>;
  guestPay: number;
  onCheck: (row: Rec, patch: Record<string, any>) => void;
  onGuest: (date: string, next: number) => void;
}) {
  const teams = useMemo(() => {
    const t: Record<string, Rec[]> = {};
    rows.forEach((r) => ((t[r.data.team || "미배정"] ??= []).push(r)));
    return t;
  }, [rows]);
  const teamNames = Object.keys(teams).sort();

  const guestCount = Number(guests[date]) || 0;
  const monthGuests = opDates.reduce((s, d) => s + (Number(guests[d]) || 0), 0);

  return (
    <div className="space-y-4">
      {/* 게스트 현황 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-bold text-slate-700">게스트 현황</p>
          <p className="text-xs text-slate-400">
            {viewMode === "day" ? prettyDay(date || "-") : `${prettyMonthShort(opDates)} 합계`} · 게스트페이{" "}
            {won(guestPay)}
          </p>
        </div>
        {viewMode === "day" ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => date && onGuest(date, guestCount - 1)}
                disabled={!date}
                className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              >
                −
              </button>
              <span className="w-10 text-center text-xl font-extrabold text-slate-800">{guestCount}</span>
              <button
                onClick={() => date && onGuest(date, guestCount + 1)}
                disabled={!date}
                className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                +
              </button>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">금액</p>
              <p className="text-lg font-extrabold text-brand-600">{won(guestPay * guestCount)}</p>
            </div>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-xs text-slate-400">월 게스트 {monthGuests}명</p>
            <p className="text-lg font-extrabold text-brand-600">{won(guestPay * monthGuests)}</p>
          </div>
        )}
      </div>

      {/* 팀별 토글 */}
      {rows.length === 0 ? (
        <Empty text="등록된 영업진이 없습니다. ‘출근인원 설정’에서 추가하세요." />
      ) : (
        teamNames.map((team) => (
          <Accordion
            key={team}
            title={team}
            badge={<TeamBadge />}
            count={`${teams[team].length}명`}
            defaultOpen
          >
            <div className="divide-y divide-slate-50 p-2">
              {teams[team].map((r) => {
                const att = (r.data.att ?? {})[date] ?? {};
                if (viewMode === "month") {
                  const days = opDates.filter((d) => (r.data.att ?? {})[d]?.in).length;
                  return (
                    <div key={r.id} className="flex items-center justify-between px-2 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{r.data.name}</span>
                      <span className="text-slate-500">
                        출근 <b className="text-brand-600">{days}</b> / {opDates.length}일
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                      {r.data.name}
                    </span>
                    <div className="flex shrink-0 gap-1.5">
                      <CheckBtn
                        label="출근"
                        time={att.in}
                        tone="in"
                        disabled={!date}
                        onClick={() =>
                          onCheck(r, {
                            att: {
                              ...(r.data.att ?? {}),
                              [date]: { ...att, in: att.in ? undefined : nowKST() },
                            },
                          })
                        }
                      />
                      <CheckBtn
                        label="퇴근"
                        time={att.out}
                        tone="out"
                        disabled={!date}
                        onClick={() =>
                          onCheck(r, {
                            att: {
                              ...(r.data.att ?? {}),
                              [date]: { ...att, out: att.out ? undefined : nowKST() },
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Accordion>
        ))
      )}
    </div>
  );
}

function CheckBtn({
  label,
  time,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  time?: string;
  tone: "in" | "out";
  disabled?: boolean;
  onClick: () => void;
}) {
  const on = !!time;
  const onCls =
    tone === "in" ? "bg-emerald-500 text-white" : "bg-sky-500 text-white";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[3.6rem] rounded-lg px-2 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
        on ? onCls : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {label}
      {on && <span className="ml-1 font-semibold opacity-90">{time}</span>}
    </button>
  );
}

/* ============================ 운영진 ============================ */
function OperatorView({
  rows,
  viewMode,
  date,
  opDates,
  openIdx,
  rateFor,
  onPay,
}: {
  rows: Rec[];
  viewMode: ViewMode;
  date: string;
  opDates: string[];
  openIdx: Record<string, number>;
  rateFor: (d: string) => number;
  onPay: (row: Rec, date: string, amount: number) => void;
}) {
  if (rows.length === 0)
    return <Empty text="등록된 운영진이 없습니다. ‘출근인원 설정’에서 추가하세요." />;

  const payOf = (r: Rec, d: string) => {
    const ov = r.data.pay?.[d];
    return ov === undefined || ov === null || ov === "" ? rateFor(d) : Number(ov);
  };

  if (viewMode === "month") {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">운영진</th>
              <th className="px-4 py-3 text-right font-semibold">월 급여 합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = opDates.reduce((s, d) => s + payOf(r, d), 0);
              return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.data.name}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-brand-600">{won(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // day view — 일자별 급여 조정
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400">
        {prettyDay(date || "-")} · 오픈 {openIdx[date] ?? "-"}일차 · 기본 급여 {won(rateFor(date))}{" "}
        (설정값). 값을 바꾸면 이 날짜만 조정됩니다.
      </p>
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3"
        >
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{r.data.name}</span>
          <div className="flex items-center gap-1">
            <input
              key={`${r.id}-${date}`}
              defaultValue={payOf(r, date)}
              type="number"
              min={0}
              disabled={!date}
              onBlur={(e) =>
                date && onPay(r, date, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))
              }
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500 focus:bg-white disabled:opacity-40"
            />
            <span className="text-sm text-slate-400">원</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ 출근인원 설정 ============================ */
function ConfigView({
  config,
  opRows,
  salesRows,
  onSaveConfig,
  onAdd,
  onRemove,
  onEditPerson,
}: {
  config: Rec | null;
  opRows: Rec[];
  salesRows: Rec[];
  onSaveConfig: (patch: Record<string, any>) => void;
  onAdd: (group: "operator" | "sales", name: string, team?: string) => void;
  onRemove: (row: Rec) => void;
  onEditPerson: (row: Rec, patch: Record<string, any>) => void;
}) {
  const [guestPay, setGuestPay] = useState(String(Number(config?.data?.guestPay) || 0));
  const rates = (config?.data?.opRates ?? {}) as Record<string, string | number>;
  const [rateInputs, setRateInputs] = useState<Record<string, string>>(
    Object.fromEntries(RATE_TIERS.map((t) => [String(t), String(Number(rates[String(t)]) || 0)]))
  );
  const [opName, setOpName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [salesTeam, setSalesTeam] = useState("");

  const teams = useMemo(() => {
    const t: Record<string, Rec[]> = {};
    salesRows.forEach((r) => ((t[r.data.team || "미배정"] ??= []).push(r)));
    return t;
  }, [salesRows]);

  return (
    <div className="space-y-4">
      {/* 게스트페이 + 운영진 요일별 금액 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">금액 설정</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">게스트페이(1명당)</span>
            <div className="flex items-center gap-1">
              <input
                value={guestPay}
                onChange={(e) => setGuestPay(e.target.value)}
                type="number"
                min={0}
                className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
              />
              <span className="text-sm text-slate-400">원</span>
            </div>
          </label>
          <button
            onClick={() => onSaveConfig({ guestPay: Math.max(0, Number(guestPay) || 0) })}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            게스트페이 저장
          </button>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            운영진 급여 — 오픈 일차별 기본 금액
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {RATE_TIERS.map((t) => (
              <label key={t} className="block">
                <span className="mb-1 block text-xs text-slate-500">오픈 {t}일차</span>
                <div className="flex items-center gap-1">
                  <input
                    value={rateInputs[String(t)] ?? "0"}
                    onChange={(e) =>
                      setRateInputs((s) => ({ ...s, [String(t)]: e.target.value }))
                    }
                    type="number"
                    min={0}
                    className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-right text-sm outline-none focus:border-brand-500 focus:bg-white"
                  />
                  <span className="text-sm text-slate-400">원</span>
                </div>
              </label>
            ))}
            <button
              onClick={() => {
                const opRates: Record<string, number> = {};
                RATE_TIERS.forEach((t) => (opRates[String(t)] = Math.max(0, Number(rateInputs[String(t)]) || 0)));
                onSaveConfig({ opRates });
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              급여 저장
            </button>
          </div>
        </div>
      </div>

      {/* 공휴일 관리 */}
      <HolidayPanel
        holidays={(config?.data?.holidays ?? []) as string[]}
        onSave={(list) => onSaveConfig({ holidays: list })}
      />

      {/* 운영진 명단 */}
      <Accordion title="운영진 명단" badge={<OpBadge />} count={`${opRows.length}명`} defaultOpen>
        <div className="space-y-2 p-3">
          <div className="flex gap-2">
            <input
              value={opName}
              onChange={(e) => setOpName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (onAdd("operator", opName), setOpName(""))}
              placeholder="운영진 이름"
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
            <button
              onClick={() => {
                onAdd("operator", opName);
                setOpName("");
              }}
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + 추가
            </button>
          </div>
          {opRows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-slate-800">{r.data.name}</span>
              <button
                onClick={() => onRemove(r)}
                className="text-xs text-slate-400 hover:text-red-500"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </Accordion>

      {/* 영업진 명단 — 팀별 토글 */}
      <Accordion title="영업진 명단" badge={<TeamBadge />} count={`${salesRows.length}명`} defaultOpen>
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={salesTeam}
              onChange={(e) => setSalesTeam(e.target.value)}
              placeholder="팀명 (예: A팀)"
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
            <input
              value={salesName}
              onChange={(e) => setSalesName(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (onAdd("sales", salesName, salesTeam), setSalesName(""))
              }
              placeholder="영업진 이름"
              className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
            <button
              onClick={() => {
                onAdd("sales", salesName, salesTeam);
                setSalesName("");
              }}
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + 추가
            </button>
          </div>

          {Object.keys(teams).sort().map((team) => (
            <Accordion key={team} title={team} badge={<TeamBadge />} count={`${teams[team].length}명`}>
              <div className="space-y-2 p-2">
                {teams[team].map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                      {r.data.name}
                    </span>
                    <input
                      defaultValue={r.data.team || "미배정"}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== r.data.team) onEditPerson(r, { team: v });
                      }}
                      className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-brand-500"
                    />
                    <button
                      onClick={() => onRemove(r)}
                      className="text-xs text-slate-400 hover:text-red-500"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      </Accordion>
    </div>
  );
}

/* ---------- 공휴일 관리 ---------- */
function HolidayPanel({
  holidays,
  onSave,
}: {
  holidays: string[];
  onSave: (list: string[]) => void;
}) {
  const [d, setD] = useState("");
  const sorted = [...holidays].sort();

  return (
    <Accordion
      title="공휴일 관리"
      badge={<HolidayBadge />}
      count={sorted.length ? `추가 ${sorted.length}일` : "기본값 사용"}
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-slate-400">
          대한민국 공휴일(대체공휴일 포함)은 기본 내장되어 있습니다. 누락되거나 임시공휴일이 생기면
          여기에 추가하세요. 추가한 <b>공휴일의 전날</b>이 영업일에 자동으로 포함됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={d}
            onChange={(e) => setD(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
          <button
            onClick={() => {
              if (!d || holidays.includes(d)) return;
              onSave([...holidays, d].sort());
              setD("");
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + 공휴일 추가
          </button>
        </div>
        {sorted.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((h) => (
              <span
                key={h}
                className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200"
              >
                🎌 {h}
                <button
                  onClick={() => onSave(holidays.filter((x) => x !== h))}
                  className="text-rose-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Accordion>
  );
}

/* ============================ 공용 ============================ */
function prettyMonthShort(opDates: string[]) {
  if (opDates.length === 0) return "이번 달";
  const [y, m] = opDates[0].split("-").map(Number);
  return `${m}월`;
}
function Accordion({
  title,
  count,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className={`inline-block text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
        {badge}
        <span className="font-bold text-slate-800">{title}</span>
        {count && <span className="text-xs font-normal text-slate-400">{count}</span>}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}
function TeamBadge() {
  return (
    <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
      팀
    </span>
  );
}
function HolidayBadge() {
  return (
    <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
      공휴일
    </span>
  );
}
function OpBadge() {
  return (
    <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
      운영
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
