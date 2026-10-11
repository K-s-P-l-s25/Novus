import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Composes Tailwind classes; later classes win on conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
