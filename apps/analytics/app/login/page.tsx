"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-2xl font-bold mb-2">OEF Analytics</h1>
          <p className="text-zinc-400 text-sm mb-6">Engineering Operating System Dashboard</p>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button type="submit" className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors">
              Sign In
            </button>
          </form>
          <p className="text-xs text-zinc-600 mt-4 text-center">Read-only analytics. No write operations.</p>
        </div>
      </div>
    </div>
  );
}
