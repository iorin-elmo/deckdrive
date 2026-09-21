import { createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const packageName = '@deck-drive/ui' as const;

export function classNames(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: 'primary' | 'quiet' | 'danger';
  readonly children: ReactNode;
}

/** A small, accessible command button shared by Phase 5 screens. */
export function ActionButton({
  className,
  tone = 'primary',
  type = 'button',
  children,
  ...props
}: ActionButtonProps) {
  const toneClass =
    tone === 'primary'
      ? 'bg-cyan-300 text-zinc-950 hover:bg-cyan-200'
      : tone === 'danger'
        ? 'bg-rose-500 text-white hover:bg-rose-400'
        : 'border border-stone-600 bg-zinc-900/80 text-stone-100 hover:border-cyan-300 hover:text-cyan-100';
  return createElement(
    'button',
    {
      ...props,
      type,
      className: classNames(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50',
        toneClass,
        className,
      ),
    },
    children,
  );
}

export function AsyncNotice({
  kind,
  title,
  children,
}: {
  readonly kind: 'loading' | 'error' | 'empty';
  readonly title: string;
  readonly children?: ReactNode;
}) {
  const role = kind === 'error' ? 'alert' : 'status';
  const color =
    kind === 'error' ? 'border-rose-500/60 text-rose-100' : 'border-stone-700 text-stone-300';
  return createElement(
    'section',
    { role, className: `rounded-md border ${color} bg-zinc-950/60 p-5` },
    createElement('h2', { className: 'font-semibold text-stone-100' }, title),
    children === undefined ? null : createElement('div', { className: 'mt-2 text-sm' }, children),
  );
}
