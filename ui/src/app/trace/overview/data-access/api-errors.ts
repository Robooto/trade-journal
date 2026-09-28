import { HttpErrorResponse } from '@angular/common/http';

export function toSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    return typeof detail === 'string' && detail ? detail : fallback;
  }
  return fallback;
}
