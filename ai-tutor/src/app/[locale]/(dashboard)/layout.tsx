"use client";

import { Header } from "@/components/layout/header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#fbfcfd]">
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        <Header />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
