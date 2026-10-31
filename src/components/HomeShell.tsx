/**
 * Page frame for everything outside the trace view: brand, the Campaigns / Runs
 * navigation and the theme switch. Campaigns is the home view (`#/`).
 */
import React from "react";
import { Activity, History, Target } from "lucide-react";
import { ThemeSwitch } from "./ThemeSwitch";

export type HomeSection = "campaigns" | "runs";

const SECTIONS: { id: HomeSection; label: string; hash: string; icon: React.ReactNode }[] = [
  { id: "campaigns", label: "Campaigns", hash: "#/", icon: <Target className="w-4 h-4" aria-hidden="true" /> },
  { id: "runs", label: "Runs", hash: "#/runs", icon: <History className="w-4 h-4" aria-hidden="true" /> },
];

export function HomeShell({
  active,
  navigate,
  children,
}: {
  active: HomeSection;
  navigate: (hash: string) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="app-hero">
      <header className="home-header">
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <ThemeSwitch />
      </header>
      <nav className="home-nav" aria-label="Sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={s.hash}
            className="home-nav-tab"
            aria-current={active === s.id ? "page" : undefined}
            onClick={(e) => { e.preventDefault(); navigate(s.hash); }}
          >
            {s.icon}
            {s.label}
          </a>
        ))}
      </nav>
      {children}
    </main>
  );
}
