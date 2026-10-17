import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex gap-2 rounded-md border px-2.5 py-2 text-xs leading-relaxed [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0', {
  variants: {
    variant: {
      info: 'border-primary/30 bg-primary/8 text-foreground',
      warning: 'border-warning/35 bg-warning/8 text-foreground',
      error: 'border-destructive/40 bg-destructive/10 text-foreground',
      success: 'border-success/35 bg-success/8 text-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

export function Alert({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role={variant === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props} />;
}
