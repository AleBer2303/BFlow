/**
 * scripts/check-build-env.mjs
 *
 * Corta un build de publicación que no trae la configuración de Firebase (ADR 0027).
 * El código ya no lleva un proyecto por defecto: sin estas variables el binario arrancaría sin
 * poder iniciar sesión, y es mejor que falle el workflow.
 *
 *   node scripts/check-build-env.mjs
 */

import { pathToFileURL } from 'node:url';

export const REQUIRED_BUILD_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

export const OPTIONAL_BUILD_ENV = [
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_OWNER_SEED_EMAIL',
];

export function findMissingBuildEnv(env = process.env) {
  return REQUIRED_BUILD_ENV.filter((name) => !env[name] || env[name].trim().length === 0);
}

function main() {
  const missing = findMissingBuildEnv();
  if (missing.length > 0) {
    console.error(
      `Faltan variables de Firebase para compilar: ${missing.join(', ')}.\n` +
        'Defínelas en GitHub → Settings → Secrets and variables → Actions → Variables.'
    );
    process.exit(1);
  }
  console.log('Configuración de Firebase presente para el build.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
