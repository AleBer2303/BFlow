/**
 * src/platform/media/profilePhotoValidation.ts
 *
 * Validation and sanitization for user profile photos persisted in Cloud Firestore (`users/{uid}`).
 * Mirrors `isValidPhotoUrl` in `firestore.rules` (ADR 0033):
 * - Empty string `""` represents an explicitly cleared photo.
 * - Compact raster Data URI (`jpeg`, `jpg`, `png`, `webp`) up to 120,000 chars (~88 KB binary).
 * - HTTPS URL up to 2,048 chars (for example, initial Google Sign-In avatar).
 * - Rejects SVG, HTML, JavaScript, local `file://`, and HTTP URLs.
 */

export const PROFILE_PHOTO_DATA_URI_MAX_LENGTH = 120_000;
export const PROFILE_PHOTO_HTTPS_MAX_LENGTH = 2_048;
export const PROFILE_PHOTO_TARGET_SIZE_PX = 256;

const DATA_URI_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const HTTPS_URL_PATTERN = /^https:\/\/[^\s]+$/;

export function isValidProfilePhotoUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length <= PROFILE_PHOTO_HTTPS_MAX_LENGTH && HTTPS_URL_PATTERN.test(value)) {
    return true;
  }
  if (value.length <= PROFILE_PHOTO_DATA_URI_MAX_LENGTH && DATA_URI_PATTERN.test(value)) {
    return true;
  }
  return false;
}

/**
 * Returns a safe photo URI for storage/display, `""` when explicitly cleared,
 * or `undefined` when absent or invalid.
 */
export function sanitizeProfilePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return isValidProfilePhotoUri(trimmed) ? trimmed : undefined;
}
