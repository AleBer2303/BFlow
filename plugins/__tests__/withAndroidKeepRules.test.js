/**
 * plugins/__tests__/withAndroidKeepRules.test.js
 *
 * El release de Android se compila con R8. Estas pruebas fijan que el prebuild conserva las
 * clases de expo-gl a las que su capa C++ llega por nombre (ADR 0013): sin esa regla el
 * `.apk` se cierra al montar la curva del Resumen, justo despues de iniciar sesion.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const withAndroidKeepRules = require('../withAndroidKeepRules');

const { mergeKeepRules, applyKeepRules, KEEP_RULES, BLOCK_START, BLOCK_END } = withAndroidKeepRules;

const repoRoot = path.resolve(__dirname, '..', '..');
const EXPO_GL_KEEP_RULE = '-keep class expo.modules.gl.** { *; }';
const TEMPLATE_RULES = [
  '# react-native-reanimated',
  '-keep class com.swmansion.reanimated.** { *; }',
  '-keep class com.facebook.react.turbomodule.** { *; }',
  '',
  '# Add any project specific keep options here:',
  '',
].join('\n');

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

describe('mergeKeepRules', () => {
  it('conserva las reglas de la plantilla y añade el bloque de BFlow al final', () => {
    const merged = mergeKeepRules(TEMPLATE_RULES);

    expect(merged.startsWith(TEMPLATE_RULES.trimEnd())).toBe(true);
    expect(merged).toContain(EXPO_GL_KEEP_RULE);
    expect(merged.indexOf(BLOCK_START)).toBeLessThan(merged.indexOf(EXPO_GL_KEEP_RULE));
    expect(merged.indexOf(EXPO_GL_KEEP_RULE)).toBeLessThan(merged.indexOf(BLOCK_END));
    expect(merged.endsWith(`${BLOCK_END}\n`)).toBe(true);
  });

  it('es idempotente: aplicar el plugin dos veces no duplica el bloque', () => {
    const once = mergeKeepRules(TEMPLATE_RULES);
    const twice = mergeKeepRules(once);

    expect(twice).toBe(once);
    expect(countOccurrences(twice, BLOCK_START)).toBe(1);
    expect(countOccurrences(twice, EXPO_GL_KEEP_RULE)).toBe(1);
  });

  it('sustituye un bloque de una version anterior en lugar de acumularlo', () => {
    const outdated = [
      TEMPLATE_RULES.trimEnd(),
      '',
      BLOCK_START,
      '-keep class some.removed.library.** { *; }',
      BLOCK_END,
      '',
    ].join('\n');

    const merged = mergeKeepRules(outdated);

    expect(merged).not.toContain('some.removed.library');
    expect(merged).toBe(mergeKeepRules(TEMPLATE_RULES));
  });

  it('acepta un archivo vacio, ausente o con saltos de linea de Windows', () => {
    const fromEmpty = mergeKeepRules('');

    expect(fromEmpty.startsWith(BLOCK_START)).toBe(true);
    expect(mergeKeepRules(undefined)).toBe(fromEmpty);
    expect(mergeKeepRules(TEMPLATE_RULES.replace(/\n/g, '\r\n'))).toBe(
      mergeKeepRules(TEMPLATE_RULES)
    );
  });

  it('solo escribe comentarios y reglas -keep', () => {
    for (const line of KEEP_RULES) {
      expect(line.startsWith('#') || line.startsWith('-keep')).toBe(true);
    }
  });
});

describe('applyKeepRules', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bflow-keep-rules-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('escribe el bloque en app/proguard-rules.pro del proyecto nativo generado', () => {
    const rulesPath = path.join(projectRoot, 'app', 'proguard-rules.pro');
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, TEMPLATE_RULES, 'utf8');

    expect(applyKeepRules(projectRoot)).toBe(rulesPath);
    expect(fs.readFileSync(rulesPath, 'utf8')).toBe(mergeKeepRules(TEMPLATE_RULES));
  });

  it('crea el archivo si la plantilla no lo trae', () => {
    const rulesPath = applyKeepRules(projectRoot);

    expect(fs.readFileSync(rulesPath, 'utf8')).toContain(EXPO_GL_KEEP_RULE);
  });
});

describe('withAndroidKeepRules', () => {
  it('registra un mod de Android que aplica las reglas al proyecto generado', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bflow-keep-rules-mod-'));
    try {
      const config = withAndroidKeepRules({ name: 'BFlow', slug: 'bflow' });
      const dangerousMod = config.mods.android.dangerous;

      expect(typeof dangerousMod).toBe('function');

      await dangerousMod({
        ...config,
        modRequest: {
          projectRoot,
          platformProjectRoot: projectRoot,
          modName: 'dangerous',
          platform: 'android',
          introspect: false,
        },
        modResults: null,
      });

      const written = fs.readFileSync(path.join(projectRoot, 'app', 'proguard-rules.pro'), 'utf8');
      expect(written).toContain(EXPO_GL_KEEP_RULE);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('esta declarado en app.json, asi que cada prebuild lo ejecuta', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf8'));

    expect(appConfig.expo.plugins).toContain('./plugins/withAndroidKeepRules');
  });
});

describe('contrato con expo-gl (motivo de la regla)', () => {
  const expoGlRoot = path.join(repoRoot, 'node_modules', 'expo-gl');

  it('la capa C++ sigue buscando GLContext.flush() por nombre', () => {
    const jniSource = fs.readFileSync(
      path.join(expoGlRoot, 'android', 'src', 'main', 'cpp', 'EXGLJniApi.cpp'),
      'utf8'
    );
    const glContextSource = fs.readFileSync(
      path.join(expoGlRoot, 'android', 'src', 'main', 'java', 'expo', 'modules', 'gl', 'GLContext.java'),
      'utf8'
    );

    // Si esto deja de cumplirse, expo-gl cambio su puente JNI y la regla debe revisarse.
    expect(jniSource).toMatch(/GetMethodID\(\s*GLContextClass,\s*"flush",\s*"\(\)V"\s*\)/);
    expect(glContextSource).toContain('package expo.modules.gl;');
    expect(glContextSource).toMatch(/public void flush\(\)/);
  });
});
