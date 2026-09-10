import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // The inset highlight on the primary button is what stops a flat fill
  // looking like a coloured rectangle.
  primary:
    'bg-brand-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(20,19,17,0.16)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-ink-300 disabled:shadow-none',
  secondary:
    'bg-white text-ink-800 border border-ink-200 shadow-[0_1px_2px_rgba(20,19,17,0.04)] hover:border-ink-300 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-150 disabled:text-ink-300',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8125rem] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-[0.625rem]',
  lg: 'h-12 px-6 text-[0.9375rem] gap-2 rounded-xl',
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
      className={`inline-flex items-center justify-center font-medium tracking-[-0.005em] transition-[background-color,border-color,box-shadow] duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
