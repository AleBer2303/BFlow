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
