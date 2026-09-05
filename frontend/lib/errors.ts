import { ApiError } from "@/lib/api";

export function normalizeError(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof ApiError) {
    return caughtError.message;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}
