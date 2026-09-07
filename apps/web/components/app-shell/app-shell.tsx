"use client";

import {
  useEffect,
  useState,
} from "react";

import Image from "next/image";
import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import {
  Anchor,
  BarChart3,
  Bot,
  CalendarDays,
  Database,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Mail,
  MessageSquareText,
  Plus,
  Settings,
  Ship,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { BrandMarkPlate } from "@/components/brand/brand-mark";

import {
  logout,
} from "@/app/logout/actions";

import {
  GlobalSearch,
} from "@/components/app-shell/global-search";

import {
  NotificationsPanel,
} from "@/components/app-shell/notifications-panel";

import {
  WorkspaceUserIdentity,
} from "@/components/app-shell/workspace-user-identity";

import {
  ThemeToggle,
} from "@/components/theme-toggle";

import {
  Button,
} from "@/components/ui/button";

import {
  Separator,
} from "@/components/ui/separator";

type AccountResponse = {
  success: boolean;
  account?: {
    companyName:
      | string
      | null;
  };
};

const DEFAULT_COMPANY_NAME =
  "Workspace";

const navigation = [
  {
    name: "Mission Control",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Inquiries",
    href: "/inquiries",
    icon: MessageSquareText,
  },
  {
    name: "Yachts",
    href: "/fleet",
    icon: Ship,
  },
  {
    name: "Availability",
    href: "/availability",
    icon: CalendarDays,
  },
  {
    name: "Data Sources",
    href: "/data-sources",
    icon: Database,
  },
  {
    name: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    name: "Proposals",
    href: "/proposals",
    icon: FileText,
  },
  {
    name: "Charters",
    href: "/charters",
    icon: Anchor,
  },
  {
    name: "Concierge",
    href: "/concierge",
    icon: Sparkles,
  },
  {
    name: "Itineraries",
    href: "/itineraries",
    icon: MapPinned,
  },
  {
    name: "Email",
    href: "/email",
    icon: Mail,
  },
  {
    name: "Documents",
    href: "/documents",
    icon: FolderOpen,
  },
  {
    name: "AI Copilot",
    href: "/ai-copilot",
    icon: Bot,
  },
  {
    name: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
];

function isActiveRoute(
  pathname: string,
  href: string
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
}

function isPublicRoute(
  pathname: string
) {
  return (
    pathname === "/proposal-review" ||
    pathname.startsWith(
      "/proposal-review/"
    ) ||
    /*
     * The contract review page was added without being listed here, so it
     * rendered inside the workspace chrome: a charter client opening the link
     * saw the brokerage's sidebar, its notification bell, and the name and
     * role of whichever broker happened to be signed in on that device.
     *
     * The page has no auth requirement, so this only shows to someone who is
     * already signed in. That is exactly the case that matters: a broker
     * checking their own link sees it framed correctly and concludes the
     * client does too.
     */
    pathname === "/contract-review" ||
    pathname.startsWith(
      "/contract-review/"
    ) ||
    pathname === "/guest" ||
    pathname.startsWith(
      "/guest/"
    ) ||
    (
      pathname.startsWith(
        "/itineraries/"
      ) &&
      pathname.endsWith(
        "/preview"
      )
    ) ||
    pathname === "/onboarding" ||
    pathname.startsWith(
      "/onboarding/"
    ) ||
    pathname === "/sign-up" ||
    pathname.startsWith(
      "/sign-up/"
    ) ||
    pathname === "/login" ||
    pathname.startsWith(
      "/login/"
    ) ||
    pathname ===
      "/forgot-password" ||
    pathname.startsWith(
      "/forgot-password/"
    ) ||
    pathname ===
      "/reset-password" ||
    pathname.startsWith(
      "/reset-password/"
    ) ||
    /*
     * An invited person arrives here with a session and, on the common path,
     * no membership of any company at all. The shell would try to render a
     * workspace switcher and a company name for a workspace they have not
     * joined yet, around a page whose entire purpose is to let them join it.
     */
    pathname === "/invite" ||
    pathname.startsWith(
      "/invite/"
    ) ||
    pathname.startsWith(
      "/auth/"
    )
  );
}

function BahariBrandLockup({
  companyName,
}: {
  companyName: string;
}) {
  return (
    <>
      <BrandMarkPlate priority />

      <div className="min-w-0">
        <p className="font-heading text-2xl leading-none tracking-[0.08em]">
          Bahari OS
        </p>

        <p className="mt-1 max-w-[170px] truncate text-[11px] text-muted-foreground">
          {companyName}
        </p>
      </div>
    </>
  );
}

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-5">
      {navigation.map(
        (
          item
        ) => {
          const Icon =
            item.icon;

          const active =
            isActiveRoute(
              pathname,
              item.href
            );

          return (
            <Link
              key={
                item.href
              }
              href={
                item.href
              }
              onClick={
                onNavigate
              }
              className={`apple-transition flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />

              <span>
                {
                  item.name
                }
              </span>
            </Link>
          );
        }
      )}
    </nav>
  );
}

function SidebarFooter({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-5">
      {/*
        Shown to everyone rather than gated on role. The sidebar is a client
        component with no access to the workspace role, and fetching it here
        would add a request to every page load to hide one link. /team renders
        its own explanation to anyone who cannot manage the team, and the API
        refuses them regardless.
      */}
      <Link
        href="/team"
        onClick={onNavigate}
        className={`apple-transition mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
          isActiveRoute(
            pathname,
            "/team"
          )
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
      >
        <Users className="size-4" />

        Team
      </Link>

      <Link
        href="/settings"
        onClick={
          onNavigate
        }
        className={`apple-transition flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
          isActiveRoute(
            pathname,
            "/settings"
          )
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
      >
        <Settings className="size-4" />

        Settings
      </Link>

      <div className="mt-4 rounded-2xl border border-sidebar-border bg-card/60 p-3 shadow-sm backdrop-blur-xl">
        <WorkspaceUserIdentity />

        <form
          action={
            logout
          }
          className="mt-3"
        >
          <button
            type="submit"
            className="apple-transition inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/40 px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <LogOut className="size-3.5" />

            Log out
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  const pathname =
    usePathname();

  const publicRoute =
    isPublicRoute(
      pathname
    );

  const [
    mobileNavigationOpen,
    setMobileNavigationOpen,
  ] =
    useState(
      false
    );

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      DEFAULT_COMPANY_NAME
    );

  useEffect(
    () => {
      setMobileNavigationOpen(
        false
      );
    },
    [
      pathname,
    ]
  );

  useEffect(
    () => {
      if (
        !mobileNavigationOpen
      ) {
        document.body.style.overflow =
          "";

        return;
      }

      document.body.style.overflow =
        "hidden";

      return () => {
        document.body.style.overflow =
          "";
      };
    },
    [
      mobileNavigationOpen,
    ]
  );

  useEffect(
    () => {
      if (
        publicRoute
      ) {
        return;
      }

      let cancelled =
        false;

      async function loadCompanyName() {
        try {
          const response =
            await fetch(
              "/api/account",
              {
                method: "GET",
                cache: "no-store",
              }
            );

          if (
            !response.ok
          ) {
            return;
          }

          const contentType =
            response.headers.get(
              "content-type"
            ) ?? "";

          if (
            !contentType.includes(
              "application/json"
            )
          ) {
            return;
          }

          const result =
            (await response.json()) as AccountResponse;

          const nextCompanyName =
            result.account
              ?.companyName
              ?.trim();

          if (
            cancelled ||
            !result.success ||
            !nextCompanyName
          ) {
            return;
          }

          setCompanyName(
            nextCompanyName
          );
        } catch {
          // Keep the neutral fallback if the account endpoint
          // is temporarily unavailable.
        }
      }

      void loadCompanyName();

      return () => {
        cancelled =
          true;
      };
    },
    [
      publicRoute,
    ]
  );

  if (
    publicRoute
  ) {
    return (
      <>
        {
          children
        }
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="shrink-0 px-5 pt-5">
          <Link
            href="/"
            className="apple-transition flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-sidebar-accent"
          >
            <BahariBrandLockup
              companyName={
                companyName
              }
            />
          </Link>

          <Separator className="my-5 bg-sidebar-border" />
        </div>

        <NavigationLinks
          pathname={
            pathname
          }
        />

        <SidebarFooter
          pathname={
            pathname
          }
        />
      </aside>

      {/* Mobile dark overlay */}
      <button
        type="button"
        aria-label="Close navigation"
        onClick={() =>
          setMobileNavigationOpen(
            false
          )
        }
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileNavigationOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Mobile sliding sidebar */}
      <aside
        inert={
          !mobileNavigationOpen
        }
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,20rem)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileNavigationOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              onClick={() =>
                setMobileNavigationOpen(
                  false
                )
              }
              className="apple-transition flex min-w-0 items-center gap-3 rounded-2xl px-2 py-3 hover:bg-sidebar-accent"
            >
              <BahariBrandLockup
                companyName={
                  companyName
                }
              />
            </Link>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() =>
                setMobileNavigationOpen(
                  false
                )
              }
              className="shrink-0 rounded-xl"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </Button>
          </div>

          <Separator className="my-5 bg-sidebar-border" />
        </div>

        <NavigationLinks
          pathname={
            pathname
          }
          onNavigate={() =>
            setMobileNavigationOpen(
              false
            )
          }
        />

        <SidebarFooter
          pathname={
            pathname
          }
          onNavigate={() =>
            setMobileNavigationOpen(
              false
            )
          }
        />
      </aside>

      <section className="w-full min-w-0 overflow-x-clip lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-20 w-full min-w-0 items-center justify-between gap-2 border-b border-border bg-background/90 px-3 py-3 backdrop-blur-2xl sm:px-5 lg:h-20 lg:px-8 lg:py-0">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() =>
                setMobileNavigationOpen(
                  true
                )
              }
              className="shrink-0 rounded-xl border-border bg-card/50 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={
                mobileNavigationOpen
              }
            >
              <Menu className="size-5" />
            </Button>

            <div className="min-w-0">
              <p className="truncate font-heading text-[17px] leading-none tracking-[0.04em] sm:text-xl sm:tracking-[0.06em]">
                Bahari OS
              </p>

              <p className="mt-1 hidden max-w-[46vw] truncate text-[10px] leading-tight text-muted-foreground min-[390px]:block sm:max-w-none sm:text-[11px]">
                {
                  companyName
                }
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Search is hidden on narrow phones to preserve room */}
            <div className="hidden md:block">
              <GlobalSearch />
            </div>

            {/* Keep notifications visible on every screen size */}
            <div className="shrink-0">
              <NotificationsPanel />
            </div>

            <div className="shrink-0">
              <ThemeToggle />
            </div>

            <Link
              href="/inquiries/new"
              className="ui-primary-button apple-transition inline-flex size-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-0 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 sm:h-10 sm:w-auto sm:px-4"
              aria-label="New inquiry"
              title="New inquiry"
            >
              <Plus className="size-4 shrink-0" />

              <span className="hidden sm:inline">
                New inquiry
              </span>
            </Link>
          </div>
        </header>

        <main className="min-h-[calc(100dvh-5rem)] min-w-0 overflow-x-clip">
          {
            children
          }
        </main>
      </section>
    </div>
  );
}