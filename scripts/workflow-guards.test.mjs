/**
 * scripts/workflow-guards.test.mjs
 *
 * Guardias de la tubería de E2E, release y optimización CI/CD (ADR 0023 y ADR 0029).
 * Comprobaciones estáticas sobre los workflows y los flujos de Maestro:
 *
 *   1. EXPO_PUBLIC_BFLOW_DEMO (modo vitrina) solo aparece en e2e.yml, y ese workflow no
 *      publica nada (AGENTS.md §7.6).
 *   2. release.yml reutiliza los workflows de build en vez de duplicarlos.
 *   3. Todo `id:` que usan los flujos de Maestro existe como `testID` en `src/`.
 *   4. Invariantes de caché, concurrencia, paths-ignore y deduplicación de quality-gate (ADR 0029).
 *
 *   node --test scripts/workflow-guards.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const rootDir = process.cwd();
const workflowsDir = path.resolve(rootDir, '.github/workflows');
const e2eDir = path.resolve(rootDir, 'e2e');
const srcDir = path.resolve(rootDir, 'src');

const DEMO_FLAG = 'EXPO_PUBLIC_BFLOW_DEMO';
const E2E_WORKFLOW = 'e2e.yml';

function readWorkflow(name) {
  return fs.readFileSync(path.join(workflowsDir, name), 'utf8');
}

/** Líneas con contenido ejecutable: sin comentarios YAML. */
function withoutComments(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

function listFiles(dir, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      found.push(fullPath);
    }
  }
  return found;
}

test('El modo vitrina solo se activa en el workflow de E2E', () => {
  const workflows = fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(workflows.includes(E2E_WORKFLOW), 'e2e.yml debe existir');

  const offenders = workflows.filter(
    (name) => name !== E2E_WORKFLOW && withoutComments(readWorkflow(name)).includes(DEMO_FLAG)
  );
  assert.deepEqual(
    offenders,
    [],
    `${DEMO_FLAG} no puede definirse en workflows de build o publicación`
  );
  assert.ok(
    withoutComments(readWorkflow(E2E_WORKFLOW)).includes(`${DEMO_FLAG}: '1'`),
    'e2e.yml debe compilar su APK en modo vitrina'
  );
});

test('El workflow de E2E no publica ni adjunta el APK de vitrina', () => {
  const e2e = withoutComments(readWorkflow(E2E_WORKFLOW));

  assert.match(e2e, /permissions:\s*\n\s+contents: read/, 'solo lectura sobre el repositorio');
  assert.doesNotMatch(e2e, /contents:\s*write/);
  assert.doesNotMatch(e2e, /action-gh-release/);
  assert.doesNotMatch(e2e, /gh release/);
  assert.doesNotMatch(e2e, /workflow_call/, 'no debe poder reutilizarse desde un release');

  // Ningún paso de subida de artefactos incluye el APK ni la salida de Gradle.
  const uploadBlocks = e2e.split(/\n\s+- name: /).filter((block) => block.includes('upload-artifact'));
  assert.ok(uploadBlocks.length > 0, 'debe subir los artefactos de Maestro cuando falla');
  for (const block of uploadBlocks) {
    assert.doesNotMatch(block, /\.apk|\.aab|android\/app\/build/);
  }
});

test('release.yml reutiliza los workflows de build existentes', () => {
  const release = withoutComments(readWorkflow('release.yml'));

  for (const build of ['build-ios.yml', 'build-android.yml']) {
    assert.ok(
      release.includes(`uses: ./.github/workflows/${build}`),
      `release.yml debe llamar a ${build}`
    );
    assert.match(
      withoutComments(readWorkflow(build)),
      /\n {2}workflow_call:/,
      `${build} debe declarar workflow_call`
    );
  }

  assert.doesNotMatch(release, /xcodebuild|gradlew/, 'la lógica de build no se duplica');
  assert.match(release, /node scripts\/release\.mjs "\$BUMP" --push/);
  assert.match(release, /gh release create/);
});

/** Convierte un testID del código (`workspace-tab-${tab.id}`) en una expresión regular. */
function testIdToPattern(testId) {
  const escaped = testId
    .split(/\$\{[^}]*\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${escaped}$`);
}

function collectSourceTestIds() {
  const files = listFiles(
    srcDir,
    (file) => /\.tsx?$/.test(file) && !file.includes(`${path.sep}__tests__${path.sep}`)
  );
  const patterns = [];
  // testID="x", testID={`x-${y}`}, testID = 'x' (valor por defecto) y TEST_ID = 'x'.
  const literal = /(?:testID|TEST_ID)\??\s*[=:]\s*\{?\s*(["'`])((?:(?!\1).)+)\1/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(literal)) {
      // `${testID}-legend` y similares derivan de otro testID: aceptarían cualquier id.
      if (!match[2].startsWith('${')) {
        patterns.push(testIdToPattern(match[2]));
      }
    }
  }
  return patterns;
}

function collectFlowIds() {
  const flows = listFiles(e2eDir, (file) => /\.ya?ml$/.test(file));
  const ids = [];
  for (const file of flows) {
    const text = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const match of text.matchAll(/^\s*id:\s*["']?([^"'\n]+?)["']?\s*$/gm)) {
      ids.push({ id: match[1], file: path.relative(rootDir, file) });
    }
  }
  return ids;
}

test('Los flujos de Maestro solo usan testID que existen en src/', () => {
  const sourcePatterns = collectSourceTestIds();
  const flowIds = collectFlowIds();

  assert.ok(sourcePatterns.length > 100, 'debe encontrar los testID de la app');
  assert.ok(flowIds.length > 0, 'los flujos deben seleccionar elementos por id');

  const unknown = flowIds.filter(({ id }) => !sourcePatterns.some((pattern) => pattern.test(id)));
  assert.deepEqual(
    unknown,
    [],
    'cada id de e2e/ debe existir como testID en src/ (¿se renombró un testID?)'
  );
});

test('Cada flujo de Maestro declara la app y arranca desde el estado limpio', () => {
  const flows = listFiles(path.join(e2eDir, 'flows'), (file) => /\.ya?ml$/.test(file));
  assert.ok(flows.length >= 5, 'arranque, navegación, checklist, movimiento y tema');

  const config = fs.readFileSync(path.join(e2eDir, 'config.yaml'), 'utf8');
  for (const file of flows) {
    const text = fs.readFileSync(file, 'utf8');
    const name = path.basename(file).replace(/\.ya?ml$/, '');
    assert.match(text, /^appId: com\.bflow\.app$/m, `${name}: appId`);
    assert.match(text, new RegExp(`^name: ${name}$`, 'm'), `${name}: name igual al archivo`);
    assert.ok(text.includes('- runFlow: ../subflows/launch-demo.yaml'), `${name}: arranque común`);
    assert.ok(config.includes(`- ${name}`), `${name}: listado en config.yaml`);
  }

  const appJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'app.json'), 'utf8'));
  assert.equal(appJson.expo.android.package, 'com.bflow.app');
});

// ---------------------------------------------------------------------------
// Configuración de Firebase en los builds (ADR 0027)
// ---------------------------------------------------------------------------

const BUILD_WORKFLOWS = ['build-android.yml', 'build-ios.yml'];
const FIREBASE_BUILD_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

test('Los builds reciben la configuración de Firebase de las variables del repositorio', () => {
  for (const name of BUILD_WORKFLOWS) {
    const workflow = withoutComments(readWorkflow(name));
    for (const variable of FIREBASE_BUILD_ENV) {
      assert.ok(
        workflow.includes(`${variable}: \${{ vars.${variable} }}`),
        `${name} debe tomar ${variable} de vars.${variable}`
      );
    }
    assert.ok(
      workflow.includes('node scripts/check-build-env.mjs'),
      `${name} debe comprobar la configuración antes de compilar`
    );
  }
});

test('Ningún workflow lleva escritas credenciales de Firebase', () => {
  const workflows = fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
  const offenders = workflows.filter((name) => /AIza[0-9A-Za-z_-]{20,}/.test(readWorkflow(name)));
  assert.deepEqual(offenders, []);
});

test('check-build-env detecta las variables obligatorias ausentes o vacías', async () => {
  const { findMissingBuildEnv, REQUIRED_BUILD_ENV } = await import('./check-build-env.mjs');
  const complete = Object.fromEntries(REQUIRED_BUILD_ENV.map((name) => [name, 'value']));

  assert.deepEqual(findMissingBuildEnv(complete), []);
  assert.deepEqual(findMissingBuildEnv({}), REQUIRED_BUILD_ENV);
  assert.deepEqual(findMissingBuildEnv({ ...complete, EXPO_PUBLIC_FIREBASE_APP_ID: '  ' }), [
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ]);
});

// ---------------------------------------------------------------------------
// Optimización de tubería CI/CD (Fase 6 / ADR 0029)
// ---------------------------------------------------------------------------

test('Todos los workflows YAML tienen sintaxis válida', () => {
  const workflows = fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(workflows.length >= 5, 'deben existir los 5 workflows del proyecto');

  for (const name of workflows) {
    const parsed = yaml.load(readWorkflow(name));
    assert.ok(parsed && typeof parsed === 'object', `${name} debe parsear como objeto YAML`);
    assert.ok(parsed.on, `${name} debe declarar disparadores (on)`);
    assert.ok(parsed.jobs && typeof parsed.jobs === 'object', `${name} debe declarar jobs`);
  }
});

test('ci.yml, build-ios.yml y build-android.yml cancelan ejecuciones obsoletas y cachean .jest-cache', () => {
  for (const name of ['ci.yml', 'build-ios.yml', 'build-android.yml']) {
    const parsed = yaml.load(readWorkflow(name));
    assert.equal(
      parsed.concurrency?.['cancel-in-progress'],
      true,
      `${name} debe configurar concurrency con cancel-in-progress: true`
    );

    const raw = withoutComments(readWorkflow(name));
    assert.ok(raw.includes('actions/cache@v4'), `${name} debe usar actions/cache@v4`);
    assert.ok(raw.includes('.jest-cache'), `${name} debe cachear .jest-cache`);
  }

  const releaseRaw = withoutComments(readWorkflow('release.yml'));
  assert.ok(releaseRaw.includes('actions/cache@v4'), 'release.yml debe usar actions/cache@v4');
  assert.ok(releaseRaw.includes('.jest-cache'), 'release.yml debe cachear .jest-cache');
});

test('Los builds omiten quality-gate en push a main y excluyen cambios de documentación', () => {
  for (const name of BUILD_WORKFLOWS) {
    const parsed = yaml.load(readWorkflow(name));
    const pathsIgnore = parsed.on?.push?.['paths-ignore'] ?? [];
    assert.ok(pathsIgnore.includes('docs/**'), `${name} debe ignorar docs/** en push`);
    assert.ok(pathsIgnore.includes('*.md'), `${name} debe ignorar *.md en push`);

    const gateIf = parsed.jobs?.['quality-gate']?.if ?? '';
    assert.match(
      gateIf,
      /github\.event_name\s*==\s*'push'\s*&&\s*github\.ref\s*==\s*'refs\/heads\/main'/,
      `${name} debe omitir quality-gate en push a main (ya corre en ci.yml)`
    );
  }
});

test('build-ios.yml corrige la caché de CocoaPods, activa ccache y desactiva el index store', () => {
  const raw = withoutComments(readWorkflow('build-ios.yml'));

  assert.doesNotMatch(
    raw,
    /hashFiles\([^)]*ios\/Podfile\.lock/,
    'build-ios.yml no debe depender de ios/Podfile.lock (no existe tras expo prebuild --no-install)'
  );
  assert.ok(
    raw.includes("key: ${{ runner.os }}-pods-${{ hashFiles('ios/Podfile', 'package-lock.json') }}"),
    'build-ios.yml debe cachear CocoaPods con hashFiles de ios/Podfile y package-lock.json'
  );
  assert.ok(raw.includes('~/Library/Caches/ccache'), 'build-ios.yml debe cachear ~/Library/Caches/ccache');
  assert.ok(raw.includes('USE_CCACHE'), 'build-ios.yml debe definir USE_CCACHE');
  assert.ok(raw.includes('CCACHE_DIR'), 'build-ios.yml debe definir CCACHE_DIR');
  assert.ok(
    raw.includes('COMPILER_INDEX_STORE_ENABLE=NO'),
    'build-ios.yml debe pasar COMPILER_INDEX_STORE_ENABLE=NO a xcodebuild'
  );
});

test('build-android.yml unifica assembleRelease y bundleRelease para ABIs ARM con caché y paralelismo', () => {
  const raw = withoutComments(readWorkflow('build-android.yml'));

  assert.match(
    raw,
    /\.\/gradlew assembleRelease bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a/,
    'build-android.yml debe ejecutar assembleRelease y bundleRelease en una sola invocación para arm64-v8a,armeabi-v7a'
  );
  assert.ok(raw.includes('org.gradle.caching=true'), 'build-android.yml debe activar org.gradle.caching=true');
  assert.ok(raw.includes('org.gradle.parallel=true'), 'build-android.yml debe activar org.gradle.parallel=true');
});
