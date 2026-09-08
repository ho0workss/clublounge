"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, Rec } from "@/lib/api";
import { canEditLiquorConfig, canEditSupplies } from "@/lib/roles";

type Tab = "board" | "supply" | "config" | "inventory";

const won = (v: any) =>
  v === "" || v === undefined || v === null || isNaN(Number(v))
    ? "-"
    : Number(v).toLocaleString("ko-KR") + "원";

/* 주류 종류 (노션 셀렉트 스타일 색상) */
const CATEGORIES = ["리큐르", "위스키", "데킬라", "보드카", "샴페인"] as const;
const CAT_STYLE: Record<string, string> = {
  리큐르: "bg-pink-100 text-pink-700 ring-pink-200",
  위스키: "bg-amber-100 text-amber-800 ring-amber-200",
  데킬라: "bg-lime-100 text-lime-700 ring-lime-200",
  보드카: "bg-sky-100 text-sky-700 ring-sky-200",
  샴페인: "bg-yellow-100 text-yellow-800 ring-yellow-200",
};
function CatPill({ c }: { c?: string }) {
  if (!c) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        CAT_STYLE[c] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {c}
    </span>
  );
}

function Thumb({ src, fallback = "🍶" }: { src?: string; fallback?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 sm:h-11 sm:w-11"
    />
  ) : (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-base sm:h-11 sm:w-11 sm:text-lg">
      {fallback}
    </div>
  );
}

/** 이미지 파일을 축소해 data URL(jpeg)로 변환 (jsonb 저장용) */
async function fileToThumb(file: File, max = 360): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function priceMapOf(liquors: Rec[]) {
  const m: Record<string, number> = {};
  liquors.forEach((l) => (m[l.data.name] = Number(l.data.price) || 0));
  return m;
}
const setSubtotal = (set: Rec, pm: Record<string, number>) =>
  (set.data.items ?? []).reduce(
    (s: number, it: any) => s + (pm[it.name] || 0) * (Number(it.qty) || 0),
    0
  );
const setFinal = (set: Rec, pm: Record<string, number>) =>
  Math.max(0, setSubtotal(set, pm) - (Number(set.data.discount) || 0));

/** 카테고리별로 주류를 그룹핑. 존재하는 카테고리만, 정해진 순서 + 기타 */
function groupByCategory(liquors: Rec[]) {
  const groups: Record<string, Rec[]> = {};
  for (const l of liquors) {
    const c = (l.data.category as string) || "기타";
    (groups[c] ??= []).push(l);
  }
  const order = [...CATEGORIES, "기타"].filter((c) => groups[c]?.length);
  return { groups, order };
}

/* 접이식(토글) 섹션 */
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
        <span
          className={`inline-block text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
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
function SetBadge() {
  return (
    <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
      세트
    </span>
  );
}

export default function BeveragesPage() {
  const { user, activeAffiliation } = useAuth();
  const role = user?.role ?? "member";
  const [tab, setTab] = useState<Tab>("board");
  const [liquors, setLiquors] = useState<Rec[]>([]);
  const [sets, setSets] = useState<Rec[]>([]);
  const [supplies, setSupplies] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  const needsAff = role === "master" && !activeAffiliation;

  const load = useCallback(async () => {
    if (!user || needsAff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [l, s, sp] = await Promise.all([
        api.listRecords(user.token, "liquor", activeAffiliation),
        api.listRecords(user.token, "liquor_set", activeAffiliation),
        api.listRecords(user.token, "supply", activeAffiliation),
      ]);
      setLiquors(l);
      setSets(s);
      setSupplies(sp);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user, activeAffiliation, needsAff]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "board", label: "주류대", icon: "🍸" },
    { id: "supply", label: "비품대", icon: "🧻" },
    { id: "config", label: "주류구성", icon: "⚙️" },
    { id: "inventory", label: "재고현황", icon: "📦" },
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          🍾 주류 및 비품
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
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === t.id ? "bg-white text-brand-700 shadow" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400">불러오는 중…</div>
          ) : tab === "board" ? (
            <LiquorBoard liquors={liquors} sets={sets} />
          ) : tab === "supply" ? (
            <SupplyBoard supplies={supplies} canEdit={canEditSupplies(role)} onChange={load} />
          ) : tab === "config" ? (
            <LiquorConfig
              liquors={liquors}
              sets={sets}
              canEdit={canEditLiquorConfig(role)}
              onChange={load}
            />
          ) : (
            <Inventory liquors={liquors} supplies={supplies} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 주류대 (read-only, 종류별 토글 아코디언) ---------- */
function LiquorBoard({ liquors, sets }: { liquors: Rec[]; sets: Rec[] }) {
  const pm = priceMapOf(liquors);
  if (liquors.length === 0 && sets.length === 0)
    return <Empty text="주류구성에서 주류와 세트를 먼저 등록하세요." />;

  const { groups, order } = groupByCategory(liquors);

  return (
    <div className="space-y-3">
      {order.map((cat) => (
        <Accordion
          key={cat}
          title={cat}
          count={`${groups[cat].length}종`}
          badge={cat === "기타" ? null : <CatPill c={cat} />}
        >
          <div className="divide-y divide-slate-100">
            {groups[cat].map((l) => (
              <div key={l.id} className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
                <Thumb src={l.data.image} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 sm:text-base">
                  {l.data.name}
                </span>
                <span className="shrink-0 text-sm font-extrabold text-brand-600 sm:text-lg">
                  {won(l.data.price)}
                </span>
              </div>
            ))}
          </div>
        </Accordion>
      ))}

      {sets.length > 0 && (
        <Accordion title="세트" count={`${sets.length}개`} badge={<SetBadge />}>
          <div className="divide-y divide-slate-100">
            {sets.map((s) => {
              const sub = setSubtotal(s, pm);
              const fin = setFinal(s, pm);
              const disc = Number(s.data.discount) || 0;
              const items = (s.data.items ?? [])
                .map((it: any) => `${it.name}×${it.qty}`)
                .join(" · ");
              return (
                <div key={s.id} className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-base sm:h-11 sm:w-11 sm:text-lg">
                    🥂
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800 sm:text-base">
                      {s.data.setName}
                    </p>
                    {items && <p className="truncate text-[11px] text-slate-400 sm:text-xs">{items}</p>}
                  </div>
                  <div className="shrink-0 text-right leading-tight">
                    <div className="text-sm font-extrabold text-brand-600 sm:text-lg">{won(fin)}</div>
                    {disc > 0 && (
                      <div className="text-[10px] sm:text-[11px]">
                        <span className="text-slate-400 line-through">{won(sub)}</span>
                        <span className="ml-1 font-semibold text-red-500">−{won(disc)}</span>
                      </div>
                    )}
                  </div>
                  {s.data.category && <CatPill c={s.data.category} />}
                </div>
              );
            })}
          </div>
        </Accordion>
      )}
    </div>
  );
}

/* ---------- 비품대 (부운영진+ : add + click qty) ---------- */
function SupplyBoard({
  supplies,
  canEdit,
  onChange,
}: {
  supplies: Rec[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const { user, activeAffiliation } = useAuth();
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addItem() {
    if (!user || !name.trim()) return;
    await api.upsertRecord(user.token, null, "supply", activeAffiliation, {
      name: name.trim(),
      qty: 0,
    });
    setName("");
    onChange();
  }

  async function adjust(row: Rec, delta: number) {
    if (!user) return;
    setBusyId(row.id);
    const qty = Math.max(0, Number(row.data.qty ?? 0) + delta);
    try {
      await api.upsertRecord(user.token, row.id, "supply", activeAffiliation, { ...row.data, qty });
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: Rec) {
    if (!user) return;
    if (!confirm(`'${row.data.name}' 비품을 삭제하시겠습니까?`)) return;
    await api.deleteRecord(user.token, row.id);
    onChange();
  }

  return (
    <div>
      {canEdit ? (
        <div className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="비품명 입력 후 추가 (예: 냅킨)"
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
          <button
            onClick={addItem}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + 항목 추가
          </button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-400">비품 편집은 부운영진 이상만 가능합니다.</p>
      )}

      {supplies.length === 0 ? (
        <Empty text="등록된 비품이 없습니다." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supplies.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{row.data.name}</p>
                {canEdit && (
                  <button
                    onClick={() => remove(row)}
                    className="text-xs text-slate-400 hover:text-red-500"
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    onClick={() => adjust(row, -1)}
                    disabled={busyId === row.id}
                    className="h-8 w-8 rounded-lg bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                  >
                    −
                  </button>
                )}
                <span className="min-w-[2.5rem] text-center text-xl font-extrabold text-slate-800">
                  {row.data.qty ?? 0}
                </span>
                {canEdit && (
                  <button
                    onClick={() => adjust(row, 1)}
                    disabled={busyId === row.id}
                    className="h-8 w-8 rounded-lg bg-brand-600 text-lg font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 주류구성 (운영진+ : 이름/가격/사진/종류 + 세트·할인) ---------- */
function LiquorConfig({
  liquors,
  sets,
  canEdit,
  onChange,
}: {
  liquors: Rec[];
  sets: Rec[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const { user, activeAffiliation } = useAuth();
  const [lname, setLname] = useState("");
  const [lprice, setLprice] = useState("");
  const [lcat, setLcat] = useState("");
  const [limg, setLimg] = useState<string>("");
  const [setName, setSetName] = useState("");

  if (!canEdit)
    return <Empty text="주류구성 편집은 운영진 이상만 가능합니다. (주류대에서 열람하세요)" />;

  async function addLiquor() {
    if (!user || !lname.trim()) return;
    await api.upsertRecord(user.token, null, "liquor", activeAffiliation, {
      name: lname.trim(),
      price: lprice === "" ? 0 : Number(lprice),
      category: lcat || undefined,
      image: limg || undefined,
    });
    setLname("");
    setLprice("");
    setLcat("");
    setLimg("");
    onChange();
  }
  async function saveLiquor(row: Rec, patch: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, row.id, "liquor", activeAffiliation, {
      ...row.data,
      ...patch,
    });
    onChange();
  }
  async function delLiquor(row: Rec) {
    if (!user) return;
    await api.deleteRecord(user.token, row.id);
    onChange();
  }

  async function addSet() {
    if (!user || !setName.trim()) return;
    await api.upsertRecord(user.token, null, "liquor_set", activeAffiliation, {
      setName: setName.trim(),
      items: [],
      discount: 0,
    });
    setSetName("");
    onChange();
  }
  async function saveSet(row: Rec, patch: Record<string, any>) {
    if (!user) return;
    await api.upsertRecord(user.token, row.id, "liquor_set", activeAffiliation, {
      ...row.data,
      ...patch,
    });
    onChange();
  }
  async function delSet(row: Rec) {
    if (!user) return;
    await api.deleteRecord(user.token, row.id);
    onChange();
  }

  const { groups: cfgGroups, order: cfgOrder } = groupByCategory(liquors);

  return (
    <div className="space-y-8">
      {/* liquors */}
      <section>
        <h3 className="mb-3 text-sm font-bold text-slate-700">주류 단품 · 가격 · 사진 · 종류</h3>

        {/* add form */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
          <input
            value={lname}
            onChange={(e) => setLname(e.target.value)}
            placeholder="주류명"
            className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            value={lprice}
            onChange={(e) => setLprice(e.target.value)}
            type="number"
            placeholder="가격(원)"
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <select
            value={lcat}
            onChange={(e) => setLcat(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">종류</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2">
            {limg ? (
              <Thumb src={limg} />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
                📷
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setLimg(await fileToThumb(f));
              }}
            />
            <span className="text-xs text-slate-500">{limg ? "사진 변경" : "사진 추가"}</span>
          </label>
          <button
            onClick={addLiquor}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            추가
          </button>
        </div>

        {/* list (종류별 토글) */}
        {liquors.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
            등록된 주류가 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {cfgOrder.map((cat) => (
              <Accordion
                key={cat}
                title={cat}
                count={`${cfgGroups[cat].length}종`}
                badge={cat === "기타" ? null : <CatPill c={cat} />}
                defaultOpen
              >
                <div className="divide-y divide-slate-100">
                  {cfgGroups[cat].map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2.5 p-3">
              <label className="cursor-pointer">
                <Thumb src={l.data.image} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) saveLiquor(l, { image: await fileToThumb(f) });
                  }}
                />
              </label>
              <input
                defaultValue={l.data.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== l.data.name) saveLiquor(l, { name: v });
                }}
                className="min-w-[6rem] flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-slate-800 outline-none hover:border-slate-200 focus:border-brand-500 focus:bg-white"
              />
              <select
                defaultValue={l.data.category ?? ""}
                onChange={(e) => saveLiquor(l, { category: e.target.value || undefined })}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              >
                <option value="">종류</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                defaultValue={l.data.price ?? 0}
                type="number"
                onBlur={(e) =>
                  saveLiquor(l, { price: e.target.value === "" ? 0 : Number(e.target.value) })
                }
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500"
              />
              <span className="text-sm text-slate-400">원</span>
              <button
                onClick={() => delLiquor(l)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
                    </div>
                  ))}
                </div>
              </Accordion>
            ))}
          </div>
        )}
      </section>

      {/* sets */}
      <section>
        <h3 className="mb-3 text-sm font-bold text-slate-700">세트 구성 · 할인</h3>
        <div className="mb-3 flex gap-2">
          <input
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            placeholder="세트명 (예: A세트)"
            className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
          <button
            onClick={addSet}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            세트 추가
          </button>
        </div>
        {sets.length > 0 && (
          <Accordion title="세트" count={`${sets.length}개`} badge={<SetBadge />} defaultOpen>
            <div className="space-y-3 p-3">
              {sets.map((s) => (
                <SetEditor
                  key={s.id}
                  set={s}
                  liquors={liquors}
                  onSave={saveSet}
                  onDelete={delSet}
                />
              ))}
            </div>
          </Accordion>
        )}
      </section>
    </div>
  );
}

function SetEditor({
  set,
  liquors,
  onSave,
  onDelete,
}: {
  set: Rec;
  liquors: Rec[];
  onSave: (row: Rec, patch: Record<string, any>) => void;
  onDelete: (row: Rec) => void;
}) {
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState("1");
  const [discInput, setDiscInput] = useState(String(Number(set.data.discount) || 0));
  const pm = priceMapOf(liquors);
  const sub = setSubtotal(set, pm);
  const disc = Number(set.data.discount) || 0;
  const fin = Math.max(0, sub - disc);

  function applyDiscount() {
    onSave(set, { discount: Math.max(0, Number(discInput) || 0) });
  }

  function addItem() {
    if (!sel) return;
    const items = [...(set.data.items ?? []), { name: sel, qty: Math.max(1, Number(qty) || 1) }];
    onSave(set, { items });
    setSel("");
    setQty("1");
  }
  function removeItem(idx: number) {
    const items = (set.data.items ?? []).filter((_: any, i: number) => i !== idx);
    onSave(set, { items });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          defaultValue={set.data.setName}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== set.data.setName) onSave(set, { setName: v });
          }}
          className="min-w-[8rem] flex-1 rounded-lg border border-transparent px-2 py-1 text-base font-bold text-slate-800 outline-none hover:border-slate-200 focus:border-brand-500"
        />
        <select
          defaultValue={set.data.category ?? ""}
          onChange={(e) => onSave(set, { category: e.target.value || undefined })}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">종류</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(set)}
          className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
        >
          세트 삭제
        </button>
      </div>

      <ul className="mb-3 space-y-1">
        {(set.data.items ?? []).map((it: any, i: number) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">
              {it.name} <span className="font-semibold">×{it.qty}</span>
              <span className="ml-2 text-xs text-slate-400">
                {won((pm[it.name] || 0) * (Number(it.qty) || 0))}
              </span>
            </span>
            <button
              onClick={() => removeItem(i)}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              제거
            </button>
          </li>
        ))}
        {(set.data.items ?? []).length === 0 && (
          <li className="text-xs text-slate-400">구성 주류를 추가하세요.</li>
        )}
      </ul>

      <div className="mb-3 flex gap-2">
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">주류 선택</option>
          {liquors.map((l) => (
            <option key={l.id} value={l.data.name}>
              {l.data.name}
            </option>
          ))}
        </select>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          min={1}
          className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <button
          onClick={addItem}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          추가
        </button>
      </div>

      {/* 할인 + 합계 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">가격할인</span>
          <input
            value={discInput}
            onChange={(e) => setDiscInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
            type="number"
            min={0}
            placeholder="0"
            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500"
          />
          <span className="text-xs text-slate-400">원</span>
          <button
            onClick={applyDiscount}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            적용
          </button>
        </div>
        <div className="text-sm">
          <span className="text-slate-400">정가 {won(sub)} · </span>
          <span className="font-extrabold text-brand-600">판매가 {won(fin)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 재고현황 (read-only overview) ---------- */
function Inventory({ liquors, supplies }: { liquors: Rec[]; supplies: Rec[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">비품 재고</h3>
        {supplies.length === 0 ? (
          <p className="text-sm text-slate-400">비품이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {supplies.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span className="text-slate-700">{s.data.name}</span>
                <span
                  className={`font-bold ${
                    Number(s.data.qty ?? 0) <= 3 ? "text-red-500" : "text-slate-800"
                  }`}
                >
                  {s.data.qty ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">주류 단가</h3>
        {liquors.length === 0 ? (
          <p className="text-sm text-slate-400">주류가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {liquors.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  {l.data.name}
                  <CatPill c={l.data.category} />
                </span>
                <span className="font-semibold text-slate-800">{won(l.data.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
