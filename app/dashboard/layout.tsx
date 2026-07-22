"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { DashboardProvider } from "@/lib/dashboard";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">
        불러오는 중…
      </div>
    );
  }

  return (
    <DashboardProvider>
      <div className="min-h-screen">
        <Header onMenuClick={() => setDrawer(true)} />

        <div className="mx-auto flex max-w-[1400px]">
          {/* desktop sidebar */}
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
            <Sidebar />
          </aside>

          {/* mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setDrawer(false)}
              />
              <aside className="absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-white shadow-xl">
                <div className="flex h-16 items-center px-5 text-lg font-bold text-slate-800">
                  메뉴
                </div>
                <Sidebar onNavigate={() => setDrawer(false)} />
              </aside>
            </div>
          )}

          <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </DashboardProvider>
  );
}
