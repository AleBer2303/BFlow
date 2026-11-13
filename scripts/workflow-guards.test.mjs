/**
 * scripts/workflow-guards.test.mjs
 *
 * Guardias de la tubería de E2E y release (ADR 0023). Son comprobaciones de texto, sin
 * dependencias, sobre los workflows y los flujos de Maestro:
 *
 *   1. EXPO_PUBLIC_BFLOW_DEMO (modo vitrina) solo aparece en e2e.yml, y ese workflow no
 *      publica nada (AGENTS.md §7.6).
 *   2. release.yml reutiliza los workflows de build en vez de duplicarlos.
 *   3. Todo `id:` que usan los flujos de Maestro existe como `testID` en `src/`.
 *
 *   node --test scripts/workflow-guards.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
