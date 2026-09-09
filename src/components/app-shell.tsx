"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  ChartLineUp,
  FolderSimple,
  House,
  List,
  MapTrifold,
  Target,
  UserCircle,
  ArrowUpRight,
  Pause,
  Play,
  SignOut,
  X,
} from "@phosphor-icons/react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LearningProvider } from "@/components/aporia/learning-provider";
import { navigationItems, pageTitles, utilityItems } from "@/lib/navigation";
import { useProfile } from "@/components/aporia/profile-provider";
import { ProfileAvatar, Rune } from "@/components/aporia/identity";

const icons = {
  "/dashboard": House,
  "/roadmap": MapTrifold,
  "/learn": BookOpen,
  "/projects": FolderSimple,
  "/progress": ChartLineUp,
  "/diagnostic": Target,
  "/profile": UserCircle,
};

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { href } = useProfile();
  const link = (item: { href: string; label: string }) => {
    const Icon = icons[item.href as keyof typeof icons];
    const active = pathname === href(item.href);
    return (
      <Link
        className={`nav-item ${active ? "active" : ""}`}
        href={href(item.href)}
        key={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
      >
        <Icon
          size={19}
          weight={active ? "fill" : "regular"}
          aria-hidden="true"
        />
        {item.label}
        {active && <span className="nav-dot" />}
      </Link>
    );
  };
  return (
    <nav aria-label="Основная навигация" className="app-navigation">
      <span className="nav-label">ТВОЁ ПРОСТРАНСТВО</span>
      {navigationItems.map(link)}
      <span className="nav-label second-label">ЛИЧНОЕ</span>
      {utilityItems.map(link)}
    </nav>
  );
}
export function Brand() {
  const { href } = useProfile();
  return (
    <Link
      href={href("/dashboard")}
      className="brand"
      aria-label="Aporia — главная"
    >
      <span className="brand-mark">
        <Rune />
      </span>
      <span>
        aporia<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
function AppShellContent({ children }: { children: React.ReactNode }) {
  const { profile, href, preview, motion, setMotion } = useProfile();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const route = pathname.replace(/^\/preview/, "") || "/dashboard";
  return (
    <div className={`app-frame ${motion ? "motion-on" : "motion-off"}`}>
      <div className="ambient-background" aria-hidden="true">
        <span />
        <span />
      </div>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <aside className="desktop-sidebar">
        <Brand />
        <Navigation />
        <div className="sidebar-bottom">
          <div className="track-stamp">
            <span className="track-symbol">Py</span>
            <div>
              <strong>Python backend</strong>
              <span>Твой учебный маршрут</span>
            </div>
          </div>
          <Link className="sidebar-profile" href={href("/profile")}>
            <ProfileAvatar profile={profile} className="size-9" />
            <span>
              <strong>{profile.displayName || "Твой профиль"}</strong>
              <small>
                {profile.onboardingComplete
                  ? "Цель определена"
                  : "Давай познакомимся"}
              </small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-location">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="icon-button mobile-menu"
                  aria-label="Открыть меню"
                >
                  <List size={21} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="mobile-sheet"
                showCloseButton={false}
              >
                <button
                  type="button"
                  className="icon-button absolute right-3 top-3"
                  aria-label="Закрыть меню"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
                <SheetHeader>
                  <SheetTitle className="sr-only">Меню Aporia</SheetTitle>
                  <SheetDescription className="sr-only">
                    Выбери раздел приложения
                  </SheetDescription>
                  <Brand />
                </SheetHeader>
                <Navigation onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="breadcrumb">
              Моё пространство <span>/</span>
            </span>
            <strong>
              {pageTitles[route] ??
                (route === "/onboarding" ? "Знакомство" : "Сегодня")}
            </strong>
          </div>
          <div className="topbar-actions">
            {preview && (
              <Link className="preview-pill" href="/login">
                Предпросмотр
              </Link>
            )}
            <button
              className="icon-button motion-toggle"
              onClick={() => setMotion(!motion)}
              aria-label={motion ? "Выключить анимацию" : "Включить анимацию"}
              aria-pressed={motion}
              title={motion ? "Выключить анимацию" : "Включить анимацию"}
            >
              {motion ? <Pause size={17} /> : <Play size={17} />}
            </button>
            {!preview && (
              <form action="/auth/logout" method="post">
                <button className="icon-button" aria-label="Выйти из аккаунта">
                  <SignOut size={19} />
                </button>
              </form>
            )}
            <Link href={href("/profile")} aria-label="Открыть профиль">
              <ProfileAvatar profile={profile} className="size-9" />
            </Link>
          </div>
        </header>
        <main id="main-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            aporia <span>·</span> маленькие шаги, глубокое понимание
          </span>
          <span>PYTHON BACKEND / 01</span>
        </footer>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LearningProvider>
      <AppShellContent>{children}</AppShellContent>
    </LearningProvider>
  );
}
