"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { canManageTables, canEditSupplies } from "@/lib/roles";

type Shape = "square" | "circle";
type View = "visual" | "text" | "timetable";
type LiquorItem = { name: string; price: number; qty: number };

const DEFAULT_SIZE = 96;
const MIN_SIZE = 60;
const MAX_SIZE = 240;
const INPUT_CLS =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const won = (n: number) => `${(n || 0).toLocaleString("ko-KR")}원`;
const sizeOf = (r: Rec) => Number(r.data.w ?? DEFAULT_SIZE);

function tableTotal(data: Record<string, any>) {
  const list: LiquorItem[] = data.liquors ?? [];
  return list.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
}
const toManwon = (total: number) => Math.floor(total / 10000);

function infoLine(data: Record<string, any>) {
  const parts = [data.reserver, data.team, data.sales]
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean);
  const label = parts.length ? parts.join("/") : "미지정";
  return `${label}(${toManwon(tableTotal(data))})`;
}

/* ---------- 날짜 유틸 (클라이언트) ---------- */
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDate(date: string, delta: number) {
  const [y, m, dd] = date.split("-").map(Number);
  const d = new Date(y, m - 1, dd + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function prettyDate(date: string) {
  const [y, m, dd] = date.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, dd).getDay()];
  return `${m}월 ${dd}일 (${wd})`;
}

/* 시간 문자열(HH:MM) → 분. 새벽(00~05시)은 다음날로 취급해 클럽 영업시간 정렬 */
function toMin(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  let v = h * 60 + (m || 0);
  if (h < 6) v += 1440;
  return v;
}

export default function ShiftsPage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const canManage = canManageTables(role);
  const canNavigateDates = canEditSupplies(role); // 부운영진 이상
  const needsAff = role === "master" && !activeAffiliation;
  const TODAY = todayStr();

  const [rows, setRows] = useState<Rec[]>([]);
  const [liquorDefs, setLiquorDefs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("visual");
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [modalId, setModalId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    ox: number;
    oy: number;
    el: HTMLElement;
    w: number;
    moved: boolean;
    lastX: number;
    lastY: number;
  } | null>(null);
  const resizeRef = useRef<{ id: string; el: HTMLElement; startX: number; startY: number; startW: number; w: number } | null>(null);

  const load = useCallback(async () => {
    if (!user || needsAff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tbls, liqs] = await Promise.all([
        api.listRecords(user.token, "table", activeAffiliation),
        api.listRecords(user.token, "liquor", activeAffiliation),
      ]);
      setRows(tbls);
      setLiquorDefs(liqs);
    } finally {
      setLoading(false);
    }
  }, [user, activeAffiliation, needsAff]);

  useEffect(() => {
    load();
  }, [load]);

  // 선택 날짜의 테이블만 (날짜 없는 레거시 레코드는 오늘로 간주)
  const dayRows = useMemo(
    () => rows.filter((r) => (r.data.date || TODAY) === selectedDate),
    [rows, selectedDate, TODAY]
  );

  async function persist(id: string, data: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, id, "table", activeAffiliation, data);
  }
  function patchRow(id: string, data: Record<string, any>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, data } : r)));
    persist(id, data);
  }

  async function addTable() {
    if (!user) return;
    const n = dayRows.length + 1;
    await api.upsertRecord(user.token, null, "table", activeAffiliation, {
      name: `${n}번`,
      shape: "square",
      x: 24 + ((n * 28) % 260),
      y: 24 + ((n * 22) % 200),
      w: DEFAULT_SIZE,
      date: selectedDate,
      start: "",
      end: "",
      reserver: "",
      team: "",
      sales: "",
      liquors: [],
    });
    load();
  }

  async function remove(id: string) {
    if (!user) return;
    const row = rows.find((r) => r.id === id);
    if (!confirm(`'${row?.data.name ?? ""}' 테이블을 삭제하시겠습니까?`)) return;
    await api.deleteRecord(user.token, id);
    setModalId(null);
    load();
  }

  // ---------- smooth drag ----------
  function onShapePointerDown(e: React.PointerEvent, row: Rec) {
    if (!canManage) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = {
      id: row.id,
      ox: e.clientX - rect.left - Number(row.data.x ?? 0),
      oy: e.clientY - rect.top - Number(row.data.y ?? 0),
      el,
      w: sizeOf(row),
      moved: false,
      lastX: Number(row.data.x ?? 0),
      lastY: Number(row.data.y ?? 0),
    };
    el.setPointerCapture(e.pointerId);
  }
  function onShapePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    let x = e.clientX - rect.left - d.ox;
    let y = e.clientY - rect.top - d.oy;
    x = Math.max(0, Math.min(rect.width - d.w, x));
    y = Math.max(0, Math.min(rect.height - d.w, y));
    if (Math.abs(x - d.lastX) + Math.abs(y - d.lastY) > 2) d.moved = true;
    d.lastX = x;
    d.lastY = y;
    d.el.style.left = `${x}px`;
    d.el.style.top = `${y}px`;
  }
  function onShapePointerUp(row: Rec) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (!d.moved) {
      setModalId(row.id);
      return;
    }
    patchRow(row.id, { ...row.data, x: Math.round(d.lastX), y: Math.round(d.lastY) });
  }

  // ---------- resize ----------
  function onResizeDown(e: React.PointerEvent, row: Rec, shapeEl: HTMLElement | null) {
    e.stopPropagation();
    e.preventDefault();
    if (!shapeEl) return;
    resizeRef.current = {
      id: row.id,
      el: shapeEl,
      startX: e.clientX,
      startY: e.clientY,
      startW: sizeOf(row),
      w: sizeOf(row),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resizeRef.current;
    if (!r) return;
    const delta = Math.max(e.clientX - r.startX, e.clientY - r.startY);
    const w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, r.startW + delta));
    r.w = w;
    r.el.style.width = `${w}px`;
    r.el.style.height = `${w}px`;
  }
  function onResizeUp(row: Rec) {
    const r = resizeRef.current;
    if (!r) return;
    resizeRef.current = null;
    patchRow(row.id, { ...row.data, w: Math.round(r.w) });
  }

  const modalRow = rows.find((r) => r.id === modalId) || null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          🗓️ 조판현황
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(["visual", "text", "timetable"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  view === v ? "bg-white text-brand-700 shadow" : "text-slate-500"
                }`}
              >
                {v === "visual" ? "시각화" : v === "text" ? "텍스트" : "타임테이블"}
              </button>
            ))}
          </div>
          {canManage && (
            <button
              onClick={addTable}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + 테이블
            </button>
          )}
        </div>
      </div>

      {/* 날짜 바 */}
      {!needsAff && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {canNavigateDates ? (
            <>
              <button
                onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ‹ 이전
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || TODAY)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <button
                onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                다음 ›
              </button>
              {selectedDate !== TODAY && (
                <button
                  onClick={() => setSelectedDate(TODAY)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
                >
                  오늘
                </button>
              )}
            </>
          ) : (
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
              오늘
            </span>
          )}
          <span className="text-sm font-bold text-slate-700">{prettyDate(selectedDate)}</span>
          <span className="text-xs text-slate-400">· 테이블 {dayRows.length}개</span>
        </div>
      )}

      {needsAff ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="text-4xl">👆</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">소속을 선택하세요</p>
        </div>
      ) : loading ? (
        <div className="p-10 text-center text-slate-400">불러오는 중…</div>
      ) : view === "timetable" ? (
        <TimetableView rows={dayRows} onOpen={(id) => setModalId(id)} />
      ) : view === "visual" ? (
        <>
          <div
            ref={canvasRef}
            onClick={(e) => {
              if (e.target === canvasRef.current) setExpanded(null);
            }}
            className="relative h-[560px] w-full touch-none overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-white [background-size:24px_24px]"
          >
            {dayRows.map((r) => {
              const w = sizeOf(r);
              const shape: Shape = r.data.shape === "circle" ? "circle" : "square";
              let shapeEl: HTMLElement | null = null;
              return (
                <div
                  key={r.id}
                  ref={(el) => {
                    shapeEl = el;
                  }}
                  onPointerDown={(e) => onShapePointerDown(e, r)}
                  onPointerMove={onShapePointerMove}
                  onPointerUp={() => onShapePointerUp(r)}
                  onClick={() => {
                    if (!canManage) setModalId(r.id);
                  }}
                  style={{
                    left: Number(r.data.x ?? 0),
                    top: Number(r.data.y ?? 0),
                    width: w,
                    height: w,
                    touchAction: "none",
                  }}
                  className={`absolute grid touch-none select-none place-items-center border-2 border-slate-300 bg-white shadow-sm transition-colors hover:border-brand-400 ${
                    canManage ? "cursor-move" : "cursor-pointer"
                  } ${shape === "circle" ? "rounded-full" : "rounded-xl"}`}
                >
                  <div className="pointer-events-none px-1 text-center leading-tight">
                    <div
                      className="font-bold text-slate-700"
                      style={{ fontSize: Math.max(12, Math.round(w * 0.16)) }}
                    >
                      {r.data.name}
                    </div>
                    {(r.data.start || r.data.end) && (
                      <div
                        className="text-brand-500"
                        style={{ fontSize: Math.max(9, Math.round(w * 0.095)) }}
                      >
                        {r.data.start}
                        {r.data.end ? `~${r.data.end}` : ""}
                      </div>
                    )}
                    <div
                      className="mt-0.5 break-all text-slate-400"
                      style={{ fontSize: Math.max(9, Math.round(w * 0.1)) }}
                    >
                      {infoLine(r.data)}
                    </div>
                  </div>
                  {canManage && (
                    <div
                      onPointerDown={(e) => onResizeDown(e, r, shapeEl)}
                      onPointerMove={onResizeMove}
                      onPointerUp={() => onResizeUp(r)}
                      style={{ touchAction: "none" }}
                      className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-brand-500 shadow"
                    />
                  )}
                </div>
              );
            })}
            {dayRows.length === 0 && (
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-400">
                {canManage
                  ? "‘+ 테이블’로 추가하고 드래그해 배치하세요. 테이블을 클릭하면 시간·주류를 설정할 수 있습니다."
                  : "이 날짜에 배치된 테이블이 없습니다."}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {canManage
              ? "드래그로 이동 · 모서리 손잡이로 크기 조절 · 클릭(탭)으로 시간·주류 설정"
              : "테이블을 클릭하면 상세 정보를 볼 수 있습니다."}
          </p>
        </>
      ) : (
        // ---------------- text view ----------------
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {dayRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">테이블이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">테이블</th>
                  <th className="px-4 py-3 font-semibold">시간</th>
                  <th className="px-4 py-3 font-semibold">예약자/팀/영업진(합계·만원)</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {dayRows.map((r) => {
                  const list: LiquorItem[] = r.data.liquors ?? [];
                  const open = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : r.id)}
                        className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">
                          <span className="mr-1 text-slate-300">{open ? "▾" : "▸"}</span>
                          {r.data.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {r.data.start || r.data.end
                            ? `${r.data.start || "?"}~${r.data.end || "?"}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{infoLine(r.data)}</td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalId(r.id);
                              }}
                              className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                            >
                              편집
                            </button>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={canManage ? 4 : 3} className="px-6 py-3">
                            {list.length === 0 ? (
                              <p className="text-xs text-slate-400">등록된 주류가 없습니다.</p>
                            ) : (
                              <div className="space-y-1">
                                {list.map((l, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between text-xs text-slate-600"
                                  >
                                    <span>
                                      {l.name} <span className="text-slate-400">× {l.qty}</span>
                                    </span>
                                    <span className="tabular-nums">{won(l.price * l.qty)}</span>
                                  </div>
                                ))}
                                <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 text-xs font-semibold text-slate-800">
                                  <span>합계</span>
                                  <span className="tabular-nums">{won(tableTotal(r.data))}</span>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modalRow && (
        <TableModal
          row={modalRow}
          liquorDefs={liquorDefs}
          canManage={canManage}
          onClose={() => setModalId(null)}
          onPatch={(data) => patchRow(modalRow.id, data)}
          onDelete={() => remove(modalRow.id)}
        />
      )}
    </div>
  );
}

/* =============================== 타임테이블 (에브리타임 스타일) =============================== */
const BLOCK_COLORS = [
  "bg-sky-100 border-sky-300 text-sky-900",
  "bg-emerald-100 border-emerald-300 text-emerald-900",
  "bg-amber-100 border-amber-300 text-amber-900",
  "bg-violet-100 border-violet-300 text-violet-900",
  "bg-rose-100 border-rose-300 text-rose-900",
  "bg-teal-100 border-teal-300 text-teal-900",
  "bg-indigo-100 border-indigo-300 text-indigo-900",
];
const HOUR_PX = 60;
const COL_W = 116;

function TimetableView({ rows, onOpen }: { rows: Rec[]; onOpen: (id: string) => void }) {
  const booked = rows
    .map((r) => {
      const s = toMin(r.data.start);
      let e = toMin(r.data.end);
      if (s == null || e == null) return null;
      if (e <= s) e += 1440;
      return { row: r, s, e };
    })
    .filter(Boolean) as { row: Rec; s: number; e: number }[];

  if (booked.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
        시간이 설정된 테이블이 없습니다. 테이블 상세에서 시작·종료 시간을 입력하면 타임테이블에 표시됩니다.
      </div>
    );

  const minH = Math.floor(Math.min(...booked.map((b) => b.s)) / 60);
  const maxH = Math.ceil(Math.max(...booked.map((b) => b.e)) / 60);
  const axisMin = minH * 60;
  const totalH = (maxH - minH) * HOUR_PX;
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <div className="flex min-w-max">
        {/* 시간 축 */}
        <div className="sticky left-0 z-10 w-12 shrink-0 border-r border-slate-100 bg-white">
          <div className="h-8 border-b border-slate-100" />
          <div className="relative" style={{ height: totalH }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                style={{ top: i * HOUR_PX }}
              >
                {pad(h % 24)}:00
              </div>
            ))}
          </div>
        </div>

        {/* 테이블 컬럼들 */}
        <div className="flex">
          {booked.map((b, ci) => (
            <div key={b.row.id} className="shrink-0 border-r border-slate-100" style={{ width: COL_W }}>
              <div className="flex h-8 items-center justify-center truncate border-b border-slate-100 px-1 text-xs font-bold text-slate-700">
                {b.row.data.name}
              </div>
              <div className="relative" style={{ height: totalH }}>
                {/* 시간 격자 */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-b border-slate-50"
                    style={{ top: i * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {/* 예약 블록 */}
                <button
                  onClick={() => onOpen(b.row.id)}
                  style={{
                    top: ((b.s - axisMin) / 60) * HOUR_PX,
                    height: ((b.e - b.s) / 60) * HOUR_PX,
                  }}
                  className={`absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-95 ${
                    BLOCK_COLORS[ci % BLOCK_COLORS.length]
                  }`}
                >
                  <p className="font-bold">{b.row.data.name}</p>
                  <p className="opacity-80">
                    {b.row.data.start}~{b.row.data.end}
                  </p>
                  {(b.row.data.reserver || b.row.data.team) && (
                    <p className="truncate opacity-80">
                      {[b.row.data.reserver, b.row.data.team].filter(Boolean).join("/")}
                    </p>
                  )}
                  <p className="font-semibold opacity-90">{toManwon(tableTotal(b.row.data))}만</p>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =============================== Table detail modal =============================== */
function TableModal({
  row,
  liquorDefs,
  canManage,
  onClose,
  onPatch,
  onDelete,
}: {
  row: Rec;
  liquorDefs: Rec[];
  canManage: boolean;
  onClose: () => void;
  onPatch: (data: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(row.data);
  const total = tableTotal(draft);
  const list: LiquorItem[] = draft.liquors ?? [];

  function apply(patch: Record<string, any>) {
    const d = { ...draft, ...patch };
    setDraft(d);
    onPatch(d);
  }
  function qtyOf(name: string) {
    return list.find((l) => l.name === name)?.qty ?? 0;
  }
  function setQty(name: string, price: number, qty: number) {
    const rest = list.filter((l) => l.name !== name);
    const next = qty > 0 ? [...rest, { name, price, qty }] : rest;
    apply({ liquors: next });
  }

  const shape: Shape = draft.shape === "circle" ? "circle" : "square";

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-800">
            {draft.name || "테이블"}{" "}
            <span className="text-sm font-normal text-slate-400">상세</span>
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="테이블명">
              {canManage ? (
                <input
                  defaultValue={draft.name ?? ""}
                  onBlur={(e) => apply({ name: e.target.value.trim() || draft.name })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.name || "-"}</p>
              )}
            </Field>
            <Field label="예약자명">
              {canManage ? (
                <input
                  defaultValue={draft.reserver ?? ""}
                  onBlur={(e) => apply({ reserver: e.target.value })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.reserver || "-"}</p>
              )}
            </Field>
            <Field label="팀명">
              {canManage ? (
                <input
                  defaultValue={draft.team ?? ""}
                  onBlur={(e) => apply({ team: e.target.value })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.team || "-"}</p>
              )}
            </Field>
            <Field label="영업진명">
              {canManage ? (
                <input
                  defaultValue={draft.sales ?? ""}
                  onBlur={(e) => apply({ sales: e.target.value })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.sales || "-"}</p>
              )}
            </Field>
            <Field label="시작 시간">
              {canManage ? (
                <input
                  type="time"
                  defaultValue={draft.start ?? ""}
                  onBlur={(e) => apply({ start: e.target.value })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.start || "-"}</p>
              )}
            </Field>
            <Field label="종료 시간">
              {canManage ? (
                <input
                  type="time"
                  defaultValue={draft.end ?? ""}
                  onBlur={(e) => apply({ end: e.target.value })}
                  className={INPUT_CLS}
                />
              ) : (
                <p className="pt-1.5 text-sm text-slate-700">{draft.end || "-"}</p>
              )}
            </Field>
          </div>

          {/* 형태 / 크기 */}
          {canManage && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">형태</span>
                <button
                  onClick={() => apply({ shape: shape === "circle" ? "square" : "circle" })}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  {shape === "circle" ? "◯ 원형" : "◻ 사각형"}
                </button>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">크기</span>
                <input
                  type="range"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  value={Number(draft.w ?? DEFAULT_SIZE)}
                  onChange={(e) => apply({ w: Number(e.target.value) })}
                  className="flex-1 accent-brand-600"
                />
                <span className="w-10 text-right text-xs tabular-nums text-slate-400">
                  {Number(draft.w ?? DEFAULT_SIZE)}
                </span>
              </div>
            </div>
          )}

          {/* 주류 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-700">주류</h4>
              <span className="text-xs text-slate-400">
                합계 <b className="text-slate-700">{won(total)}</b> · {toManwon(total)}만
              </span>
            </div>

            {canManage ? (
              liquorDefs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                  ‘주류 및 비품 → 주류구성’에서 주류를 먼저 등록하세요.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {liquorDefs.map((d) => {
                    const name = d.data.name as string;
                    const price = Number(d.data.price) || 0;
                    const q = qtyOf(name);
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">{name}</p>
                          <p className="text-xs text-slate-400">{won(price)}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setQty(name, price, Math.max(0, q - 1))}
                            className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums">{q}</span>
                          <button
                            onClick={() => setQty(name, price, q + 1)}
                            className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : list.length === 0 ? (
              <p className="text-xs text-slate-400">등록된 주류가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {list.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-sm text-slate-600">
                    <span>
                      {l.name} <span className="text-slate-400">× {l.qty}</span>
                    </span>
                    <span className="tabular-nums">{won(l.price * l.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <button
              onClick={onDelete}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
            >
              테이블 삭제
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              완료
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
