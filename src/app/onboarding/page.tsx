"use client";

import Link from "next/link";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function OnboardingPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-7 sm:p-10">
        <Sparkle aria-hidden="true" className="text-primary" size={28} weight="fill" />
        <p className="mt-8 text-sm font-medium text-primary">Первый разговор</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Расскажи, к чему хочешь прийти.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">Здесь появится живой диалог с ментором: цель, опыт, доступное время и формат работы. После него Aporia предложит честную стартовую точку.</p>
        <Button asChild className="mt-8" size="lg">
          <Link href="/dashboard">Вернуться в демо <ArrowRight aria-hidden="true" data-icon="inline-end" size={17} /></Link>
        </Button>
      </section>
    </main>
  );
}
