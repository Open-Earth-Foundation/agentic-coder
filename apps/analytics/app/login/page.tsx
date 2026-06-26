"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OEFLogo } from "@/components/OEFLogo";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) router.push("/");
    else setError("Invalid password");
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex w-1/2 bg-brand-gradient text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative orbs */}
        <div className="absolute top-20 right-10 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <OEFLogo size={30} color="#FFFFFF" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight">OEF Analytics</div>
            <div className="text-[0.62rem] uppercase tracking-wider opacity-70">Agentic OS</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Engineering Metrics, ROI &amp; Estimations
          </h1>
          <p className="text-base text-white/80 mt-6 leading-relaxed">
            Live visibility into every ticket, sprint, and dollar across Open Earth Foundation.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            <div>
              <div className="text-3xl font-extrabold">3</div>
              <div className="text-xs text-white/70 mt-1 leading-snug">Execution modes (human, agent, guided)</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold">60s</div>
              <div className="text-xs text-white/70 mt-1 leading-snug">AI estimation time per issue</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/60">
          Open Earth Foundation · openearth.org
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-gradient flex items-center justify-center">
              <OEFLogo size={24} color="#FFFFFF" />
            </div>
            <div>
              <div className="text-base font-bold text-[#00001F]">OEF Analytics</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-[#00001F] tracking-tight">Welcome back</h2>
          <p className="text-sm text-[#7A7B9A] mt-1.5">Sign in to access the engineering dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-8">
            <label className="block text-xs font-semibold text-[#232640] mb-2 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 border rounded-lg text-sm text-[#00001F] placeholder-[#7A7B9A] focus:outline-none focus:ring-2 focus:ring-[#2351DC] focus:border-[#2351DC] transition-colors"
              style={{ borderColor: "#E5E7EB" }}
              autoFocus
            />
            {error && (
              <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full mt-4 py-3 bg-[#2351DC] hover:bg-[#001EA7] disabled:bg-[#7A7B9A] disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t" style={{ borderColor: "#E5E7EB" }}>
            <p className="text-xs text-[#7A7B9A] leading-relaxed">
              <strong className="text-[#232640]">Read-only access.</strong> This dashboard does not write to any external system.
              All data is fetched live from Linear and refreshed automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
