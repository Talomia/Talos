import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '~/utils/classNames';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ui-borderColor disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-ui-background text-ui-textPrimary hover:bg-ui-background-depth-2',
        primary: 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        outline:
          'border border-ui-borderColor bg-transparent hover:bg-ui-background-depth-2 hover:text-ui-textPrimary text-ui-textPrimary',
        secondary: 'bg-ui-background-depth-1 text-ui-textPrimary hover:bg-ui-background-depth-2',
        ghost: 'hover:bg-ui-background-depth-1 hover:text-ui-textPrimary',
        link: 'text-ui-textPrimary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 rounded-lg px-8',
        icon: 'h-9 w-9',
        xs: 'h-7 rounded-lg px-2 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, ...props }, ref) => {
    return (
      <button type="button" className={classNames(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
