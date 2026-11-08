"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import type { TranslationSchema } from "@/lib/i18n/types";

type SidebarKeys = keyof TranslationSchema["layout"]["sidebar"];

interface NavItem {
  readonly href: string;
  readonly labelKey: SidebarKeys;
  readonly icon: React.ReactNode;
}

interface NavGroup {
  readonly groupKey: SidebarKeys;
  readonly items: readonly NavItem[];
}

const navGroups: readonly NavGroup[] = [
  {
    groupKey: "workspace",
    items: [
      {
        href: "/",
        labelKey: "dashboard",
        icon: (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        ),
      },
    ],
  },
  {
    groupKey: "authoring",
    items: [
      {
        href: "/brainstorm",
        labelKey: "mindOrganization",
        icon: (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        ),
      },
      {
        href: "/writing",
        labelKey: "documentWriting",
        icon: (
          <>
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </>
        ),
      },
    ],
  },
  {
    groupKey: "settings",
    items: [
      {
        href: "/models",
        labelKey: "modelManagement",
        icon: (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </>
        ),
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-white dark:bg-sidebar border-r flex flex-col z-50">
      {/* Top brand block */}
      <div className="h-16 shrink-0 flex items-center gap-3 border-b border-border px-6">
        <Image
          src="/logo.png"
          alt="Synthetix"
          width={30}
          height={30}
          className="shrink-0"
          priority
        />
        <h1 className="text-xl font-bold font-display tracking-tight">Synthetix</h1>
      </div>

      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.groupKey} className="mb-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 px-3 mb-1.5">
              {t.layout.sidebar[group.groupKey]}
            </div>
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={`${group.groupKey}-${item.labelKey}`}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-primary-50 text-primary font-semibold dark:bg-primary/10"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <svg
                    className="w-[18px] h-[18px] shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {item.icon}
                  </svg>
                  {t.layout.sidebar[item.labelKey]}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

