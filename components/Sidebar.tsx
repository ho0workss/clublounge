"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENUS } from "@/lib/menu";
import { useAuth } from "@/lib/auth";
import { canManageAffiliations, canManageMembers } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role ?? "member";

  const admin: NavItem[] = [];
  if (canManageMembers(role))
    admin.push({ href: "/dashboard/members", label: "구성원 관리", icon: "👥" });
  if (canManageAffiliations(role))
    admin.push({ href: "/dashboard/affiliations", label: "소속 관리", icon: "🏢" });
  admin.push({ href: "/dashboard/settings", label: "설정", icon: "⚙️" });

  function Item({ href, label, icon }: NavItem) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          active
            ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <span className="text-lg">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        메뉴
      </p>
      {MENUS.map((m) => (
        <Item key={m.slug} href={`/dashboard/${m.slug}`} label={m.label} icon={m.icon} />
      ))}

      <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        관리
      </p>
      {admin.map((a) => (
        <Item key={a.href} {...a} />
      ))}
    </nav>
  );
}
