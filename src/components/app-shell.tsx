"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChartLineUp,
  FolderSimple,
  House,
  List,
  MapTrifold,
  Sparkle,
  Target,
  UserCircle,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navigationItems, pageTitles, utilityItems } from "@/lib/navigation";

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
  const renderLink = (item: (typeof navigationItems)[number] | (typeof utilityItems)[number]) => {
    const Icon = icons[item.href as keyof typeof icons];
    const isActive = pathname === item.href;

    return (
      <Link
        className={cn(
          "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        href={item.href}
        key={item.href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" size={18} weight={isActive ? "fill" : "regular"} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav aria-label="Основная навигация" className="flex flex-1 flex-col gap-1">
      {navigationItems.map(renderLink)}
      <Separator className="my-4" />
      {utilityItems.map(renderLink)}
    </nav>
  );
}

function Brand() {
  return (
    <Link className="flex items-center gap-3" href="/dashboard">
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sparkle aria-hidden="true" size={19} weight="fill" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-tight">Aporia</span>
        <span className="block text-xs text-muted-foreground">Личный учебный контур</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Aporia";

  return (
    <div className="min-h-[100dvh] bg-background">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground" href="#main-content">
        Перейти к содержимому
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Brand />
        <Separator className="my-6" />
        <Navigation />
        <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-3">
          <p className="text-xs leading-5 text-muted-foreground">Начни с честного разговора о цели, затем Aporia соберёт твой маршрут.</p>
          <Link className="mt-3 inline-flex text-xs font-medium text-primary hover:underline" href="/onboarding">
            Начать знакомство
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button aria-label="Открыть меню" className="lg:hidden" size="icon" variant="ghost">
                  <List aria-hidden="true" size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[18rem] border-sidebar-border bg-sidebar p-0" side="left">
                <SheetHeader className="p-5">
                  <SheetTitle><Brand /></SheetTitle>
                  <SheetDescription className="sr-only">Навигация Aporia</SheetDescription>
                </SheetHeader>
                <Separator />
                <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col p-4">
                  <Navigation />
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-xs text-muted-foreground">Твой учебный контур</p>
              <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            </div>
          </div>
          <Link className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" href="/profile">
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-medium">Твой профиль</span>
              <span className="block text-xs text-muted-foreground">ещё не настроен</span>
            </span>
            <Avatar className="size-8 border border-border">
              <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">A</AvatarFallback>
            </Avatar>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8" id="main-content">{children}</main>
      </div>
    </div>
  );
}
