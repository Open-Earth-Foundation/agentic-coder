"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OEFLogo } from "./OEFLogo";

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { label: "End-to-End Flow", href: "/pipeline", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
      { label: "Linear Data", href: "/linear", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    ],
  },
  {
    title: "Agents & Quality",
    items: [
      { label: "AI Agents", href: "/agents", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
      { label: "DORA Metrics", href: "/dora", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Costs & ROI", href: "/costs", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-white border-r flex flex-col fixed left-0 top-0" style={{ borderColor: "#E5E7EB" }}>
      {/* Logo header */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "#E5E7EB" }}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-gradient shadow-sm">
            <OEFLogo size={26} color="#FFFFFF" />
          </div>
          <div className="flex flex-col">
            <span className="text-[0.95rem] font-bold leading-tight text-[#00001F]">OEF Analytics</span>
            <span className="text-[0.62rem] text-[#7A7B9A] font-semibold tracking-wider uppercase">Agentic OS</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-6">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[#7A7B9A] px-3 mb-2">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#E8EAFB] text-[#2351DC]"
                        : "text-[#232640] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3" style={{ borderColor: "#E5E7EB" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-soft" />
            <span className="text-xs text-[#7A7B9A]">Linear connected</span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs text-[#7A7B9A] hover:text-[#2351DC] font-medium"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
