import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonStyles = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        solid: "bg-brand text-brand-ink hover:bg-brand/90",
        ink: "bg-ink text-bg hover:bg-ink/90",
        soft: "bg-sunk text-ink hover:bg-line",
        outline: "border border-line bg-transparent text-ink hover:bg-sunk",
        ghost: "text-ink hover:bg-sunk",
        danger: "bg-danger text-white hover:bg-danger/90",
        dangerSoft: "bg-danger/10 text-danger hover:bg-danger/15",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px]",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-[15px]",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, type = "button", ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
