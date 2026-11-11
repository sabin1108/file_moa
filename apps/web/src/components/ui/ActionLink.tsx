import Link from "next/link";
import type { ReactNode } from "react";
import { actionClasses, type ActionVariant } from "./action-classes";
import { NavigationProgress } from "./feedback/NavigationProgress";

export function ActionLink({ href, children, variant = "ghost", className }: {
  href: string;
  children: ReactNode;
  variant?: ActionVariant;
  className?: string;
}) {
  return <Link href={href} className={actionClasses(variant, className)}>
    {children}
    <NavigationProgress />
  </Link>;
}
