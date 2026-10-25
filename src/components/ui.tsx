"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ApiError } from "@/types/api";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const variants = {
  primary:
    "bg-accent-fill text-accent-ink shadow-[0_8px_24px_rgba(255,138,31,0.28)] hover:brightness-[0.98]",
  secondary: "bg-surface-muted text-foreground hover:brightness-[0.98]",
  danger: "border border-danger bg-transparent text-danger hover:bg-danger-soft",
  ghost: "text-accent hover:bg-accent-soft",
} as const;

const controlClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-sm font-bold transition-[filter,background-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button type={type} className={cx(controlClass, variants[variant], className)} {...props} />;
}

type AppHref = "/" | "/discover" | "/check-in" | "/requests" | "/profile";

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: AppHref;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(controlClass, variants[variant], className)}>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <header className={cx("max-w-3xl", className)}>
      <h1 className="font-display text-[1.75rem] leading-none font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-6 text-muted">{description}</p>
    </header>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <p className="text-sm text-muted sm:col-span-2 xl:col-span-3">{label}</p>
      <div className="h-36 animate-pulse rounded-[20px] bg-surface-muted motion-reduce:animate-none" />
      <div className="h-36 animate-pulse rounded-[20px] bg-surface-muted motion-reduce:animate-none" />
      <div className="hidden h-36 animate-pulse rounded-[20px] bg-surface-muted motion-reduce:animate-none xl:block" />
    </div>
  );
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-surface px-5 py-8 text-center">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function ErrorBlock({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-[20px] border border-line bg-danger-soft px-5 py-5">
      <h2 className="font-display text-xl font-bold text-danger">{title}</h2>
      <p className="mt-2 text-sm leading-6">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function errorLines(error: ApiError): string[] {
  const lines = [error.error.message];
  for (const value of Object.values(error.error.details)) {
    if (typeof value === "string") lines.push(value);
    else if (Array.isArray(value)) lines.push(value.map(String).join(", "));
  }
  return lines;
}

export function FieldError({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert" className="rounded-[14px] bg-danger-soft px-4 py-3 text-sm text-danger">
      <ul className="grid gap-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-[13px] border border-line bg-surface px-3.5 text-base text-foreground";

export const fieldClass = "grid gap-1.5 text-[13px] font-bold";

export const cardClass = "panel-shadow rounded-[20px] border border-line bg-surface p-4";
