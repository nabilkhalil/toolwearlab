import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/85',
        destructive: 'bg-destructive text-white hover:bg-destructive/85',
        outline: 'border border-border bg-transparent hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75',
        ghost: 'hover:bg-muted',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'size-9',
        iconSm: 'size-8',
      },
      active: { true: 'ring-2 ring-primary ring-offset-1 ring-offset-background', false: '' },
    },
    defaultVariants: { variant: 'default', size: 'default', active: false },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, active, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, active, className }))} {...props} />;
});
Button.displayName = 'Button';
