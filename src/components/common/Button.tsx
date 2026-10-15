import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'cta' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_6px_16px_-8px_rgba(11,94,215,0.6)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-ink-300 disabled:shadow-none',
  // Peppi Labs coral: the one call to action on a page, like "Start a project" on peppilabs.net.
  cta: 'bg-coral-500 text-white shadow-[0_8px_20px_-8px_rgba(255,107,92,0.75)] hover:bg-coral-600 active:bg-coral-600 disabled:bg-ink-300 disabled:shadow-none',
  secondary:
    'bg-white text-brand-700 border border-brand-200 hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-150 disabled:text-ink-300',
};

// Pills, as on peppilabs.net.
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[0.8125rem] gap-1.5 rounded-full',
  md: 'h-10 px-5 text-sm gap-2 rounded-full',
  lg: 'h-12 px-7 text-[0.9375rem] gap-2 rounded-full',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold tracking-[-0.005em] transition-[background-color,border-color,box-shadow] duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
