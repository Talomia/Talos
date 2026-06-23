import { atom } from 'nanostores';
import { deduplicateErrors, type DetectedError } from '~/lib/runtime/error-detector';

export type { DetectedError } from '~/lib/runtime/error-detector';

export const MAX_AUTO_FIX_ATTEMPTS = 3;

const MAX_STORED_ERRORS = 20;

export const detectedErrors = atom<DetectedError[]>([]);
export const autoFixEnabled = atom<boolean>(false);
export const autoFixInProgress = atom<boolean>(false);
export const autoFixAttempts = atom<number>(0);

export function addError(error: DetectedError): void {
  const current = detectedErrors.get();
  const merged = deduplicateErrors([...current, error]);
  detectedErrors.set(merged.slice(-MAX_STORED_ERRORS));
}

export function addErrors(errors: DetectedError[]): void {
  const current = detectedErrors.get();
  const merged = deduplicateErrors([...current, ...errors]);
  detectedErrors.set(merged.slice(-MAX_STORED_ERRORS));
}

export function clearErrors(): void {
  detectedErrors.set([]);
  autoFixAttempts.set(0);
}

export function dismissError(id: string): void {
  detectedErrors.set(detectedErrors.get().filter((e) => e.id !== id));
}

export function resetAutoFix(): void {
  autoFixAttempts.set(0);
  autoFixInProgress.set(false);
}

export function canAutoFix(): boolean {
  return autoFixEnabled.get() && !autoFixInProgress.get() && autoFixAttempts.get() < MAX_AUTO_FIX_ATTEMPTS;
}
