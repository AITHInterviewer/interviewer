import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const buttonVariants = cva("button", {
  variants: {
    variant: {
      default: "button--primary",
      primary: "button--primary",
      secondary: "button--secondary",
      outline: "button--secondary",
      ghost: "button--ghost",
      text: "text-button",
    },
    size: {
      default: "",
      large: "button--large",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Показывает спиннер, ставит aria-busy и запрещает повторное нажатие. */
  loading?: boolean;
  /** Текст на время процесса: «Сохраняю…». */
  loadingLabel?: string;
  /** Иконка слева, 16px. */
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading, loadingLabel, icon, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Spinner /> : icon}
        {loading && loadingLabel ? loadingLabel : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
