"use client";

import Link from "next/link";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-7 sm:p-9">
        <Sparkle aria-hidden="true" className="text-primary" size={26} weight="fill" />
        <p className="mt-7 text-sm font-medium text-primary">Aporia</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Соберём твой учебный контур.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Регистрация появится с подключением Supabase. Пока можно начать знакомство в демо.</p>
        <Button asChild className="mt-8" size="lg">
          <Link href="/onboarding">Начать знакомство <ArrowRight aria-hidden="true" data-icon="inline-end" size={17} /></Link>
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">Уже был профиль? <Link className="text-primary hover:underline" href="/login">Войти</Link></p>
      </section>
    </main>
  );
}
