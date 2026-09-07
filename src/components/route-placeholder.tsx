"use client";

import Link from "next/link";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type RoutePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
};

export function RoutePlaceholder({ eyebrow, title, description, actionHref, actionLabel }: RoutePlaceholderProps) {
  return (
    <section className="grid min-h-[calc(100dvh-10rem)] content-center gap-8 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{title}</h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">{description}</p>
        <Button asChild className="mt-8" size="lg">
          <Link href={actionHref}>
            {actionLabel}
            <ArrowRight aria-hidden="true" data-icon="inline-end" size={17} />
          </Link>
        </Button>
      </div>
      <aside className="self-end rounded-lg border border-border bg-card p-5">
        <Sparkle aria-hidden="true" className="text-primary" size={24} weight="fill" />
        <p className="mt-5 text-sm font-medium">Основа готова</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Экран уже в учебном контуре. Содержимое появится, когда подключим профиль и данные.</p>
      </aside>
    </section>
  );
}
