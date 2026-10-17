import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none', {
  variants: {
    variant: {
      default: 'bg-primary/15 text-primary',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning',
      destructive: 'bg-destructive/15 text-destructive',
      muted: 'bg-muted text-muted-foreground',
      accent: 'bg-accent/15 text-accent',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
