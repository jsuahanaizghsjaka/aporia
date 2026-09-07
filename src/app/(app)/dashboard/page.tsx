"use client";

import Link from "next/link";
import { ArrowRight, Brain, Target } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-primary">Добро пожаловать</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Начнём с твоей реальной точки.</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Aporia не выдаёт случайный план. Сначала она поймёт твою цель, опыт и способ учиться.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-primary">Первая миссия</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">Познакомиться с твоей целью</h3>
            </div>
            <Target aria-hidden="true" className="shrink-0 text-primary" size={27} weight="duotone" />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">Короткий разговор поможет определить направление, стартовый уровень и формат практики, который тебе подходит.</p>
          <Button asChild className="mt-7" size="lg">
            <Link href="/onboarding">Начать знакомство <ArrowRight aria-hidden="true" data-icon="inline-end" size={17} /></Link>
          </Button>
        </article>
        <article className="rounded-lg border border-border bg-secondary/55 p-6 sm:p-8">
          <Brain aria-hidden="true" className="text-primary" size={28} weight="duotone" />
          <p className="mt-7 text-sm font-medium">Без иллюзии прогресса</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Освоение навыка будет подтверждаться практикой, а не только прочитанными уроками.</p>
        </article>
      </section>

      <section className="border-t border-border pt-8">
        <p className="text-sm font-medium">Что появится после знакомства</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Карта навыков", "Маршрут к цели с понятной логикой."],
            ["Сегодня", "Одна следующая задача, на которой стоит сфокусироваться."],
            ["Доказательства", "Практика и проекты вместо формального прогресса."],
          ].map(([title, text]) => (
            <article className="border-l border-border pl-4" key={title}>
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
