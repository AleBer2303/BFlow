#!/usr/bin/env node
/**
 * scripts/start-demo.mjs
 *
 * Arranca Expo en modo vitrina (EXPO_PUBLIC_BFLOW_DEMO=1): sesión demo local con el seed de
 * octubre 2026 y sin Firebase. Sirve para revisar las tres pieles (iOS, Android, Web) desde el
 * navegador con `?skin=ios|android|web` y `?theme=dark|light`.
 *
 *   npm run web:demo                 # http://localhost:8081
 *   npm run web:demo -- --port 8090  # cualquier argumento extra pasa a `expo start`
 *
 * Es un script propio (y no `cross-env`) para no añadir dependencias y funcionar igual en
 * PowerShell, cmd y bash.
 */

import { spawn } from 'node:child_process';

const extraArgs = process.argv.slice(2);
const expoArgs = ['expo', 'start', '--web', ...extraArgs];

const child = spawn('npx', expoArgs, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_BFLOW_DEMO: '1' },
});

child.on('exit', (code) => process.exit(code ?? 0));
