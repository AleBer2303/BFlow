/**
 * plugins/__tests__/expoModulesRuntimeVersion.test.js
 *
 * Guardia del ADR 0019. En el `.apk` los modulos de Expo llegan como AAR precompilados
 * (`node_modules/<paquete>/local-maven-repo`) y se enlazan contra el runtime
 * `expo-modules-v2-react` que declara `expo-modules-core`. El AAR de `expo-sqlite` 58.0.15
 * se compilo contra la version 0.2.7, que anade un parametro `boolean` a
 * `SharedObjectRegistry.register`. Con `expo-modules-core` 58.0.28 (runtime 0.2.6) ese metodo
 * no existe: el modulo `ExpoSQLite` no se registra, el JavaScript lanza
 * "Cannot find native module 'ExpoSQLite'" al importar y la app se cierra antes de pintar
 * nada. Expo Go trae su propio runtime, por eso alli no ocurre.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

/** Primer runtime con `SharedObjectRegistry.register(String, Class, ModuleBuilder, boolean)`. */
const MIN_EXPO_MODULES_V2 = '0.2.7';
/** Primera version de expo-sqlite cuyo AAR exige ese runtime. */
const SQLITE_NEEDS_V2_027 = '58.0.15';

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function installedExpoModulesV2Version() {
  const gradle = fs.readFileSync(
    path.join(repoRoot, 'node_modules', 'expo-modules-core', 'android', 'build.gradle'),
    'utf8'
  );
  const match = gradle.match(/def\s+expoModulesV2Version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('expo-modules-core ya no declara expoModulesV2Version: revisar el ADR 0019');
  }
  return match[1];
}

describe('compareVersions', () => {
  it('ordena versiones numericas por componentes', () => {
    expect(compareVersions('0.2.7', '0.2.6')).toBe(1);
    expect(compareVersions('0.2.6', '0.2.7')).toBe(-1);
    expect(compareVersions('58.0.15', '58.0.15')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
  });
});

describe('runtime de expo-modules frente a los AAR precompilados', () => {
  const lock = readJson('package-lock.json');
  const lockedVersion = (name) => lock.packages[`node_modules/${name}`]?.version;

  it('package-lock fija versiones de expo-sqlite y expo-modules-core', () => {
    expect(lockedVersion('expo-sqlite')).toEqual(expect.any(String));
    expect(lockedVersion('expo-modules-core')).toEqual(expect.any(String));
  });

  it('expo-modules-core trae un runtime v2 compatible con el AAR de expo-sqlite', () => {
    const sqlite = lockedVersion('expo-sqlite');
    if (compareVersions(sqlite, SQLITE_NEEDS_V2_027) < 0) {
      return;
    }
    // expo-modules-core 58.0.29 es la primera que declara expo-modules-v2 0.2.7.
    expect(compareVersions(lockedVersion('expo-modules-core'), '58.0.29')).toBeGreaterThanOrEqual(0);
  });

  it('node_modules instalado declara expo-modules-v2 >= 0.2.7', () => {
    expect(compareVersions(installedExpoModulesV2Version(), MIN_EXPO_MODULES_V2)).toBeGreaterThanOrEqual(0);
  });
});
