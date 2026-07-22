"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENUS } from "@/lib/menu";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        메뉴
      </p>
      {MENUS.map((m) => {
        const href = `/dashboard/${m.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={m.slug}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className="text-lg">{m.icon}</span>
            <span>{m.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
