"use client";

import Link from "next/link";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-7 sm:p-9">
        <Sparkle aria-hidden="true" className="text-primary" size={26} weight="fill" />
        <p className="mt-7 text-sm font-medium text-primary">Aporia</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">С возвращением.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Вход подключим на следующем этапе вместе с безопасным хранением профиля.</p>
        <Button asChild className="mt-8" size="lg">
          <Link href="/dashboard">Открыть демо <ArrowRight aria-hidden="true" data-icon="inline-end" size={17} /></Link>
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">Впервые здесь? <Link className="text-primary hover:underline" href="/signup">Создать профиль</Link></p>
      </section>
    </main>
  );
}
