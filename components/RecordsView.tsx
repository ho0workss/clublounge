"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { FieldDef, MenuDef } from "@/lib/menu";

export default function RecordsView({ menu }: { menu: MenuDef }) {
  const { user, activeAffiliation } = useAuth();
  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Rec | "new" | null>(null);

  const needsAffiliation = user?.role === "master" && !activeAffiliation;
  const columns = useMemo(
    () => menu.fields.filter((f) => f.column !== false),
    [menu]
  );

  const load = useCallback(() => {
    if (!user || needsAffiliation) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listRecords(user.token, menu.kind, activeAffiliation)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, activeAffiliation, menu.kind, needsAffiliation]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(row: Rec) {
    if (!user) return;
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    await api.deleteRecord(user.token, row.id);
    load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      Object.values(r.data).some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
            <span>{menu.icon}</span> {menu.label}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{menu.description}</p>
        </div>
        {!needsAffiliation && (
          <button
            onClick={() => setEditing("new")}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
          >
            + 추가
          </button>
        )}
      </div>

      {needsAffiliation ? (
        <EmptyState
          icon="👆"
          title="소속을 선택하세요"
          desc="우측 상단에서 조회할 소속을 선택하면 데이터가 표시됩니다."
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <div className="relative flex-1 max-w-xs">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
              />
            </div>
            <span className="ml-auto text-sm text-slate-400">
              {filtered.length}건
            </span>
          </div>

          {error && (
            <div className="p-4 text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="p-10 text-center text-slate-400">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-4xl">{menu.icon}</p>
              <p className="mt-3 text-slate-500">등록된 항목이 없습니다.</p>
              <button
                onClick={() => setEditing("new")}
                className="mt-4 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
              >
                첫 항목 추가하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    {columns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                    >
                      {columns.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {renderCell(c, row.data[c.key])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditing(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => remove(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <RecordModal
          menu={menu}
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function renderCell(field: FieldDef, value: any) {
  if (value === undefined || value === null || value === "")
    return <span className="text-slate-300">—</span>;
  if (field.type === "select" && field.key === "status") {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        {value}
      </span>
    );
  }
  return String(value);
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
      <p className="text-4xl">{icon}</p>
      <p className="mt-3 text-lg font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

function RecordModal({
  menu,
  record,
  onClose,
  onSaved,
}: {
  menu: MenuDef;
  record: Rec | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, activeAffiliation } = useAuth();
  const [data, setData] = useState<Record<string, any>>(record?.data ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.upsertRecord(
        user.token,
        record?.id ?? null,
        menu.kind,
        activeAffiliation,
        data
      );
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800">
          {record ? "항목 수정" : `${menu.label} 추가`}
        </h3>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {menu.fields.map((f) => (
            <div
              key={f.key}
              className={f.type === "textarea" ? "sm:col-span-2" : ""}
            >
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                {f.label}
              </label>
              <FieldInput
                field={f}
                value={data[f.key] ?? ""}
                onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
}) {
  const cls =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white";

  if (field.type === "select") {
    return (
      <select
        className={cls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className={cls}
        rows={2}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className={cls}
      type={field.type}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) =>
        onChange(
          field.type === "number"
            ? e.target.value === ""
              ? ""
              : Number(e.target.value)
            : e.target.value
        )
      }
    />
  );
}
