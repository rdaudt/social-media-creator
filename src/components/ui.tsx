import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "google";

function variantClass(variant: ButtonVariant): string {
  if (variant === "secondary") return "btn-secondary";
  if (variant === "ghost") return "btn-ghost";
  if (variant === "danger") return "btn-danger";
  if (variant === "google") return "btn-google";
  return "";
}

export function Button(
  { className = "", variant = "primary", type = "button", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  return <button type={type} className={`${variantClass(variant)} ${className}`.trim()} {...props} />;
}

export function Panel({ className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return <section className={`card ${className}`.trim()} {...props} />;
}

export function Alert(
  { className = "", variant = "info", ...props }:
  PropsWithChildren<HTMLAttributes<HTMLParagraphElement>> & { variant?: "info" | "error" }
) {
  const variantClassName = variant === "error" ? "alert error" : "alert";
  return <p className={`${variantClassName} ${className}`.trim()} {...props} />;
}
