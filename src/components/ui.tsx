"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ApiError } from "@/types/api";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const variants = {
  primary:
    "bg-accent text-accent-foreground hover:opacity-90",
  secondary:
    "border border-line bg-surface text-foreground hover:bg-surface-muted",
  danger:
    "border border-line bg-danger-soft text-danger hover:bg-surface",
  ghost: "text-accent hover:bg-accent-soft",
} as const;

const controlClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50";

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

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-5 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
    </header>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <p className="text-sm text-muted">{label}</p>
      <div className="h-28 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
    </div>
  );
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-4 py-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{body}</p>
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
    <div role="alert" className="rounded-2xl border border-line bg-danger-soft px-4 py-5">
      <h2 className="text-lg font-semibold text-danger">{title}</h2>
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
    <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <ul className="grid gap-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-foreground";

export const fieldClass = "grid gap-2 text-sm font-medium";
