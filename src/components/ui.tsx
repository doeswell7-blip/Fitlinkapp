import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 shadow-sm',
  secondary: 'surface text-primary hover:bg-secondary',
  ghost: 'text-secondary hover:text-primary hover:bg-secondary',
  danger: 'bg-error-subtle text-error border border-error/30 hover:opacity-80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`surface rounded-xl shadow-sm ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'accent';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-secondary text-secondary border-app',
  success: 'bg-success-subtle text-success border-success/20',
  warning: 'bg-warning-subtle text-warning border-warning/20',
  error: 'bg-error-subtle text-error border-error/20',
  accent: 'bg-accent-subtle text-accent border-accent/20',
};

export function Badge({ variant = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${badgeClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, className = '', id, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-secondary mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full px-3.5 py-2.5 bg-secondary border border-app rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors ${className}`}
        {...props}
      />
      {hint && <p className="text-tertiary text-xs mt-1.5">{hint}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className = '', id, children, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-secondary mb-1.5">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`w-full px-3.5 py-2.5 bg-secondary border border-app rounded-lg text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  const dims = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`${dims[size]} border-2 border-app border-t-accent rounded-full animate-spin`} role="status" />
      {label && <p className="text-secondary text-sm">{label}</p>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-tertiary mb-4">{icon}</div>}
      <h3 className="text-primary font-semibold text-base mb-1.5">{title}</h3>
      <p className="text-secondary text-sm max-w-sm mb-5">{description}</p>
      {action}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-tertiary">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
