"use client";
import type { ButtonHTMLAttributes } from "react";
import { actionClasses, type ActionVariant } from "../../components/ui/action-classes";

export function DemoButton({ variant = "secondary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionVariant }) {
  return <button {...props} type="button" className={actionClasses(variant, className)} />;
}
