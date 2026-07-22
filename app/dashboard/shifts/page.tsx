"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { canManageTables } from "@/lib/roles";

type Shape = "square" | "circle";
type View = "visual" | "text";
const SIZE = 84;

export default function ShiftsPage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const canManage = canManageTables(role);
  const needsAff = role === "master" && !activeAffiliation;

  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("visual");
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const load = useCallback(async () => {
    if (!user || needsAff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await api.listRecords(user.token, "table", activeAffiliation));
    } finally {
      setLoading(false);
    }
  }, [user, activeAffiliation, needsAff]);

  useEffect(() => {
    load();
  }, [load]);

  async function persist(row: Rec, data: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, row.id, "table", activeAffiliation, data);
  }

  async function addTable() {
    if (!user) return;
    const n = rows.length + 1;
    await api.upsertRecord(user.token, null, "table", activeAffiliation, {
      name: `${n}번`,
      shape: "square",
      x: 20 + ((n * 20) % 200),
      y: 20 + ((n * 16) % 160),
    });
    load();
  }

  async function rename(row: Rec) {
    const name = prompt("테이블 명칭", row.data.name ?? "");
    if (name == null) return;
    await persist(row, { ...row.data, name: name.trim() || row.data.name });
    load();
  }
  async function toggleShape(row: Rec) {
    const shape: Shape = row.data.shape === "circle" ? "square" : "circle";
    await persist(row, { ...row.data, shape });
    load();
  }
  async function remove(row: Rec) {
    if (!user) return;
    if (!confirm(`'${row.data.name}' 테이블을 삭제하시겠습니까?`)) return;
    await api.deleteRecord(user.token, row.id);
    setSelected(null);
    load();
  }

  // ----- drag (pointer) -----
  function onPointerDown(e: React.PointerEvent, row: Rec) {
    if (!canManage) return;
    setSelected(row.id);
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = {
      id: row.id,
      ox: e.clientX - rect.left - Number(row.data.x ?? 0),
      oy: e.clientY - rect.top - Number(row.data.y ?? 0),
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    let x = e.clientX - rect.left - drag.current.ox;
    let y = e.clientY - rect.top - drag.current.oy;
    x = Math.max(0, Math.min(rect.width - SIZE, x));
    y = Math.max(0, Math.min(rect.height - SIZE, y));
    setRows((prev) =>
      prev.map((r) => (r.id === drag.current!.id ? { ...r, data: { ...r.data, x, y } } : r))
    );
  }
  async function onPointerUp() {
    if (!drag.current) return;
    const row = rows.find((r) => r.id === drag.current!.id);
    drag.current = null;
    if (row) await persist(row, row.data);
  }

  const sel = rows.find((r) => r.id === selected) || null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          🗓️ 조판현황
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(["visual", "text"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  view === v ? "bg-white text-brand-700 shadow" : "text-slate-500"
                }`}
              >
                {v === "visual" ? "시각화" : "텍스트"}
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

      {needsAff ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="text-4xl">👆</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">소속을 선택하세요</p>
        </div>
      ) : loading ? (
        <div className="p-10 text-center text-slate-400">불러오는 중…</div>
      ) : !canManage && rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          배치된 테이블이 없습니다.
        </p>
      ) : view === "visual" ? (
        <>
          {canManage && sel && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">선택: {sel.data.name}</span>
              <button onClick={() => toggleShape(sel)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
                {sel.data.shape === "circle" ? "◻ 사각형으로" : "◯ 원형으로"}
              </button>
              <button onClick={() => rename(sel)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
                이름 변경
              </button>
              <button onClick={() => remove(sel)} className="rounded-md px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                삭제
              </button>
            </div>
          )}
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => {
              if (e.target === canvasRef.current) setSelected(null);
            }}
            className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-white [background-size:24px_24px]"
          >
            {rows.map((r) => {
              const isSel = r.id === selected;
              return (
                <div
                  key={r.id}
                  onPointerDown={(e) => onPointerDown(e, r)}
                  onDoubleClick={() => canManage && rename(r)}
                  style={{
                    left: Number(r.data.x ?? 0),
                    top: Number(r.data.y ?? 0),
                    width: SIZE,
                    height: SIZE,
                  }}
                  className={`absolute grid select-none place-items-center border-2 bg-white text-center text-sm font-bold text-slate-700 shadow-sm ${
                    canManage ? "cursor-move" : ""
                  } ${r.data.shape === "circle" ? "rounded-full" : "rounded-xl"} ${
                    isSel ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-300"
                  }`}
                >
                  <span className="px-1 leading-tight">{r.data.name}</span>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="absolute inset-0 grid place-items-center text-sm text-slate-400">
                {canManage ? "‘+ 테이블’로 테이블을 추가하고 드래그해 배치하세요." : "배치된 테이블이 없습니다."}
              </p>
            )}
          </div>
          {canManage && (
            <p className="mt-2 text-xs text-slate-400">
              드래그로 이동 · 클릭으로 선택 · 더블클릭으로 이름 변경
            </p>
          )}
        </>
      ) : (
        // text view
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">테이블이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">테이블</th>
                  <th className="px-4 py-3 font-semibold">형태</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.data.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.data.shape === "circle" ? "◯ 원형" : "◻ 사각형"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => toggleShape(r)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                            형태
                          </button>
                          <button onClick={() => rename(r)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                            이름
                          </button>
                          <button onClick={() => remove(r)} className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                            삭제
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
