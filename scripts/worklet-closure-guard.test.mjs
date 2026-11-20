/**
 * Guard for a Worklets Babel plugin pitfall (ADR 0030 §5).
 *
 * The plugin rebuilds each worklet for the UI runtime as
 *   (function name(PARAMS){ const [A, B] = this.__closure; ...body })
 * so a default parameter that reads a captured variable (`tabCount = DOCK_TABS.length`) is
 * evaluated BEFORE `this.__closure` is unpacked. On the UI runtime that variable does not exist:
 * the call throws a ReferenceError, and a release build such as Expo Go aborts on the first frame.
 * Jest and the web run worklets as plain functions, so only a device shows it.
 *
 * This test compiles every source file that declares a worklet with the app's Babel preset and
 * fails if any worklet parameter list mentions one of its captured variables.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const srcDir = path.join(rootDir, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

// One worklet at a time: its code string has no unescaped quote, so [^"] stops at its end.
const WORKLET_PATTERN = /code:"\(function ([\w$]*)\(([^"]*?)\)\{const\[([^\]"]*)\]=this\.__closure/g;

function capturedInParameters(file) {
  const code = fs.readFileSync(file, 'utf8');
  const output = babel.transformSync(code, {
    filename: file,
    presets: ['babel-preset-expo'],
    caller: { name: 'metro', platform: 'ios', isDev: false },
    babelrc: false,
    configFile: path.join(rootDir, 'babel.config.js'),
  }).code;
  const problems = [];
  for (const match of output.matchAll(WORKLET_PATTERN)) {
    const [, name, params, closure] = match;
    for (const captured of closure.split(',').map((id) => id.trim()).filter(Boolean)) {
      if (new RegExp(`(^|[^\\w$.])${captured.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(params)) {
        problems.push(`${path.relative(rootDir, file)}: worklet ${name} reads "${captured}" in its parameters`);
      }
    }
  }
  return problems;
}

test('no worklet reads a captured variable in its parameter list', () => {
  const files = walk(srcDir).filter((file) => fs.readFileSync(file, 'utf8').includes("'worklet'"));
  assert.ok(files.length > 0, 'expected at least one source file with worklets');
  const problems = files.flatMap(capturedInParameters);
  assert.deepEqual(problems, []);
});

test('the guard catches the pattern that aborted Expo Go', () => {
  const sample = path.join(rootDir, 'src', '__worklet_guard_sample__.ts');
  const source = `const TABS = [1, 2];\nexport function bad(x: number, count = TABS.length) {\n  'worklet';\n  return x + count;\n}\n`;
  fs.writeFileSync(sample, source);
  try {
    const problems = capturedInParameters(sample);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /reads "TABS" in its parameters/);
  } finally {
    fs.rmSync(sample, { force: true });
  }
});

/**
 * Reanimated 4 ignores the dependency array of its animated hooks on native and logs
 * "Dependencies should only be used on the web" once per hook in Expo Go. The Worklets plugin
 * already tracks what each worklet captures, so no hook passes one.
 */
const ANIMATED_HOOK = /\b(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedScrollHandler)\(/g;

function animatedHooksWithDependencies(file) {
  const source = fs.readFileSync(file, 'utf8');
  const problems = [];
  for (const match of source.matchAll(ANIMATED_HOOK)) {
    let index = match.index + match[0].length;
    let depth = 1;
    let lastTopComma = -1;
    while (depth > 0 && index < source.length) {
      const char = source[index];
      if ('([{'.includes(char)) depth += 1;
      else if (')]}'.includes(char)) depth -= 1;
      if (depth === 1 && char === ',') lastTopComma = index;
      index += 1;
    }
    const tail = lastTopComma >= 0 ? source.slice(lastTopComma + 1, index - 1).trim() : '';
    if (tail.startsWith('[')) {
      const line = source.slice(0, match.index).split('\n').length;
      problems.push(`${path.relative(rootDir, file)}:${line}: ${match[1]} has a dependency array`);
    }
  }
  return problems;
}

test('no Reanimated hook passes a dependency array (ignored and warned on native)', () => {
  const problems = walk(srcDir).flatMap(animatedHooksWithDependencies);
  assert.deepEqual(problems, []);
});

/**
 * Metro does not tree-shake, so importing values from the 'three' entry would bundle all of
 * three.js. The curve imports three's ES modules one by one ('three/src/...'), which cut its
 * Web chunk from 870 KB to 678 KB (ADR 0032 §6). Type-only imports cost nothing.
 */
test('no source file imports values from the whole three.js entry', () => {
  const offenders = walk(srcDir)
    .filter((file) => /^import\s+(?!type\b)[^;]*from\s+'three';/m.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(rootDir, file));
  assert.deepEqual(offenders, []);
});
