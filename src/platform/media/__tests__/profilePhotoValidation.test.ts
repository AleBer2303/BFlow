import {
  PROFILE_PHOTO_DATA_URI_MAX_LENGTH,
  PROFILE_PHOTO_HTTPS_MAX_LENGTH,
  isValidProfilePhotoUri,
  sanitizeProfilePhotoUrl,
} from '../profilePhotoValidation';

describe('profilePhotoValidation (ADR 0033)', () => {
  it('accepts empty string, valid HTTPS URLs, and compressed raster Data URIs', () => {
    expect(isValidProfilePhotoUri('')).toBe(true);
    expect(isValidProfilePhotoUri('https://lh3.googleusercontent.com/a/photo=s96-c')).toBe(true);
    expect(isValidProfilePhotoUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(isValidProfilePhotoUri('data:image/jpg;base64,AAAA')).toBe(true);
    expect(isValidProfilePhotoUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isValidProfilePhotoUri('data:image/webp;base64,UklGRh4AAABXRUJQ')).toBe(true);
  });

  it('rejects insecure schemes, SVG/HTML data URIs, local paths, and oversized payloads', () => {
    expect(isValidProfilePhotoUri(null)).toBe(false);
    expect(isValidProfilePhotoUri(123)).toBe(false);
    expect(isValidProfilePhotoUri('http://example.com/avatar.jpg')).toBe(false);
    expect(isValidProfilePhotoUri('javascript:alert(1)')).toBe(false);
    expect(isValidProfilePhotoUri('file:///var/mobile/photo.jpg')).toBe(false);
    expect(isValidProfilePhotoUri('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isValidProfilePhotoUri('data:text/html;base64,PGh0bWw+')).toBe(false);
    expect(isValidProfilePhotoUri('https://example.com/has space.jpg')).toBe(false);

    const oversizedHttps = `https://example.com/${'a'.repeat(PROFILE_PHOTO_HTTPS_MAX_LENGTH)}`;
    expect(isValidProfilePhotoUri(oversizedHttps)).toBe(false);

    const oversizedDataUri = `data:image/jpeg;base64,${'A'.repeat(PROFILE_PHOTO_DATA_URI_MAX_LENGTH)}`;
    expect(isValidProfilePhotoUri(oversizedDataUri)).toBe(false);
  });

  it('sanitizes whitespace and returns undefined for invalid values', () => {
    expect(sanitizeProfilePhotoUrl('  https://example.com/p.jpg  ')).toBe(
      'https://example.com/p.jpg'
    );
    expect(sanitizeProfilePhotoUrl('   ')).toBe('');
    expect(sanitizeProfilePhotoUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined();
    expect(sanitizeProfilePhotoUrl(undefined)).toBeUndefined();
  });
});
