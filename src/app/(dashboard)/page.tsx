"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { LoadingState } from "@/components/shared/loading-state";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";

interface DraftSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  progress?: { completed: number; total: number };
}

interface DashboardStats {
  draftCount: number;
  totalTokens: number;
  activeTasks: number;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function DashboardPage() {
  const router = useRouter();
  const { t, format } = useLocale();
  const [stats, setStats] = useState<DashboardStats>({
    draftCount: 0,
    totalTokens: 0,
    activeTasks: 0,
  });
  const [recentDrafts, setRecentDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoadDone = useRef(false);

  const load = useCallback(async () => {
    try {
      const [draftsRes, usageRes] = await Promise.all([
        fetch("/api/v1/drafts?limit=5"),
        fetch("/api/v1/models/usage?days=30"),
      ]);

      const draftsData = await draftsRes.json();
      const usageData = await usageRes.json();

      const drafts: DraftSummary[] = draftsData.success ? draftsData.data : [];
      setRecentDrafts(drafts.slice(0, 5));
      setStats((prev) => ({
        ...prev,
        draftCount: draftsData.total ?? drafts.length,
        totalTokens: usageData.success
          ? (usageData.data.summary?.totalInputTokens ?? 0) + (usageData.data.summary?.totalOutputTokens ?? 0)
          : 0,
      }));

      fetch("/api/v1/tasks?status=pending,running&limit=50")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setStats((prev) => ({
              ...prev,
              activeTasks: d.data.filter(
                (task: { status: string }) => task.status === "running" || task.status === "pending"
              ).length,
            }));
          }
        })
        .catch(() => {});
    } catch {
      // swallow — empty state renders
    } finally {
      if (!firstLoadDone.current) {
        firstLoadDone.current = true;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const draftsInProgress = recentDrafts.filter((d) => d.status === "drafting").length;

  return (
    <div>
      <Header title={t.dashboard.title} />

      <div className="p-8 space-y-8">
        {/* Welcome Hero */}
        <div className="bg-mesh border border-border rounded-2xl p-8 relative overflow-hidden shadow-soft flex items-center justify-between animate-fade-in-up">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-400/10 blur-[80px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-card border border-border rounded-full text-xs font-semibold text-primary mb-4 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              {t.dashboard.aiWorkspaceActive}
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-2">{t.dashboard.welcomeBack} 👋</h2>
            <p className="text-muted-foreground text-sm mb-6">
              {draftsInProgress > 0
                ? `${draftsInProgress} ${t.dashboard.draftsInProgress}. ${t.dashboard.workspaceOverview}`
                : t.dashboard.workspaceOverview}
            </p>

            <div className="flex items-center gap-3">
              <Link
                href="/brainstorm"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-md font-medium text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.45.62 2.84 1.5 3.5.76.75 1.23 1.51 1.41 2.5" />
                </svg>
                {t.dashboard.quickActions.brainstorm}
              </Link>
              <Link
                href="/writing"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground rounded-xl hover:bg-secondary transition-colors shadow-sm font-medium text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
                {t.dashboard.quickActions.newDraft}
              </Link>
            </div>
          </div>

          <div className="relative z-10 flex gap-4">
            <StatCard value={String(stats.draftCount)} label={t.dashboard.stats.drafts} />
            <StatCard value={formatTokenCount(stats.totalTokens)} label={t.dashboard.stats.tokens} />
            <StatCard value={String(stats.activeTasks)} label={t.dashboard.stats.activeTasks} isPrimary />
          </div>
        </div>

        {/* Quick Actions Row */}
        <div className="grid grid-cols-2 gap-4">
          <QuickAction
            href="/brainstorm"
            label={t.dashboard.quickActions.brainstorm}
            desc={t.dashboard.quickActions.brainstormDesc}
            iconBg="bg-muted/50 group-hover:bg-blue-50"
            iconColor="text-muted-foreground group-hover:text-blue-600"
            hoverBorderClass="hover:border-blue-200"
            animationClass="animate-fade-in-up-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.45.62 2.84 1.5 3.5.76.75 1.23 1.51 1.41 2.5" />
            </svg>
          </QuickAction>
          <QuickAction
            href="/writing"
            label={t.dashboard.quickActions.newDraft}
            desc={t.dashboard.quickActions.newDraftDesc}
            iconBg="bg-muted/50 group-hover:bg-green-50"
            iconColor="text-muted-foreground group-hover:text-green-600"
            hoverBorderClass="hover:border-green-200"
            animationClass="animate-fade-in-up-3"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </QuickAction>
        </div>

        {/* Recent Drafts */}
        <div className="animate-fade-in-up-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg text-foreground">{t.dashboard.recent.recentDrafts}</h3>
            <Link href="/writing" className="text-sm font-medium text-primary hover:text-primary-700">
              &rarr;
            </Link>
          </div>
          <div className="bg-card border border-border rounded-2xl shadow-soft overflow-hidden">
            {loading ? (
              <LoadingState />
            ) : recentDrafts.length === 0 ? (
              <EmptyState title={t.dashboard.empty.noDrafts} description={t.dashboard.empty.noDraftsDesc} />
            ) : (
              recentDrafts.map((draft, i) => {
                const progress = draft.progress ?? { completed: 0, total: 0 };
                const draftLabel =
                  draft.status === "drafting"
                    ? t.writing.draftList.drafting
                    : draft.status === "modifying"
                      ? t.writing.draftList.modifying
                      : draft.status === "completed"
                        ? t.common.states.completed
                        : draft.status;
                const draftColor =
                  draft.status === "drafting"
                    ? "bg-orange-50 text-orange-600 dark:bg-orange-950/35 dark:text-orange-300"
                    : draft.status === "modifying"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300"
                      : draft.status === "completed"
                        ? "bg-green-50 text-green-600 dark:bg-green-950/35 dark:text-green-300"
                        : "bg-blue-50 text-blue-600 dark:bg-blue-950/35 dark:text-blue-300";
                return (
                  <div
                    key={draft.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/70 transition-colors cursor-pointer group ${
                      i < recentDrafts.length - 1 ? "border-b border-border" : ""
                    }`}
                    onClick={() => router.push(`/writing/${draft.id}`)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          draft.status === "drafting"
                            ? "bg-primary animate-pulse"
                            : draft.status === "completed"
                              ? "bg-green-500"
                              : "bg-blue-500"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium text-foreground text-sm truncate">{draft.title}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ml-2 flex-shrink-0 ${draftColor}`}>
                          {draftLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {progress.completed}/{progress.total} · {format.relativeTime(draft.updatedAt)}
                      </p>
                      {draft.status === "drafting" && progress.total > 0 && (
                        <div className="w-full h-1 bg-secondary rounded-full overflow-hidden mt-1.5">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, isPrimary }: { value: string; label: string; isPrimary?: boolean }) {
  if (isPrimary) {
    return (
      <div className="glass-card border-primary-200 bg-primary-50/50 rounded-xl p-5 w-32 flex flex-col items-center justify-center text-center shadow-sm">
        <span className="text-3xl font-bold text-primary-600 mb-1">{value}</span>
        <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">{label}</span>
      </div>
    );
  }
  return (
    <div className="glass-card rounded-xl p-5 w-32 flex flex-col items-center justify-center text-center shadow-sm">
      <span className="text-3xl font-bold text-foreground mb-1">{value}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function QuickAction({
  href,
  label,
  desc,
  iconBg,
  iconColor,
  hoverBorderClass,
  animationClass,
  children,
}: {
  href: string;
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  hoverBorderClass: string;
  animationClass: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group bg-card p-5 rounded-2xl border border-border shadow-soft hover:shadow-hover hover:-translate-y-1 transition-all flex items-start gap-4 ${hoverBorderClass} ${animationClass}`}
    >
      <div className={`w-12 h-12 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center transition-colors`}>
        {children}
      </div>
      <div>
        <h4 className="font-semibold text-foreground mb-0.5">{label}</h4>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
