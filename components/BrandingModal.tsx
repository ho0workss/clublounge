"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/lib/dashboard";

const MIN_PX = 300;
const MAX_PX = 1000;

export default function BrandingModal({ onClose }: { onClose: () => void }) {
  const { branding, saveBranding } = useDashboard();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(branding?.display_name ?? "");
    setLogo(branding?.logo_url ?? null);
  }, [branding]);

  function pickFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        if (
          img.width < MIN_PX ||
          img.height < MIN_PX ||
          img.width > MAX_PX ||
          img.height > MAX_PX
        ) {
          setError(
            `로고 크기는 ${MIN_PX}×${MIN_PX} ~ ${MAX_PX}×${MAX_PX}px 사이여야 합니다. (현재 ${img.width}×${img.height})`
          );
          return;
        }
        setLogo(dataUrl);
      };
      img.onerror = () => setError("이미지를 읽을 수 없습니다.");
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveBranding(name.trim() || (branding?.affiliation ?? ""), logo);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "저장에 실패했습니다.");
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
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">브랜딩 설정</h2>
        <p className="mt-1 text-sm text-slate-500">
          {branding?.affiliation
            ? `[${branding.affiliation}] 로고와 이름을 설정합니다.`
            : "표시할 이름과 로고를 설정합니다."}
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-600">
              로고 ({MIN_PX}×{MIN_PX} ~ {MAX_PX}×{MAX_PX}px)
            </span>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 grid place-items-center">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-2xl">🍸</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  이미지 선택
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="text-xs text-slate-400 hover:text-red-500"
                  >
                    로고 제거
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">
              이름
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="표시할 이름"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

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
