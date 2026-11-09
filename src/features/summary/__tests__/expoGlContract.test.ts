/**
 * Mode B contract: drives the real three.js renderer against a GL context that only
 * exposes what expo-gl implements natively, parsed from its own C++ sources. Node has
 * no iOS GL, so this catches r-version incompatibilities without a device.
 */

import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { palettes } from '../../../design-system/tokens';
import { createCurveRenderer, MonthlyCurveScene } from '../scene/monthlyCurveScene';
import { toScenePalette } from '../scene/scenePalette';
import { buildTestCurve } from './curveFixture';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: (moduleName: string) => any;
const fs = require('fs');
const path = require('path');

const SOURCES_DIR = path.join(process.cwd(), 'node_modules', 'expo-gl', 'common');

function readSource(fileName: string): string {
  return fs.readFileSync(path.join(SOURCES_DIR, fileName), 'utf8');
}

const METHOD_SOURCES = ['EXWebGLMethods.cpp', 'EXWebGLMethodsDraw.cpp', 'EXWebGLMethodsTextures.cpp']
  .map(readSource)
  .join('\n');
const GET_PARAMETER_SOURCE = readSource('EXWebGLMethods.cpp');

const implementedMethods = new Set(
  [...readSource('EXWebGLMethods.def').matchAll(/^\s*NATIVE_(?:WEBGL2_)?METHOD\((\w+)/gm)].map(
    (match) => match[1]
  )
);
const throwingMethods = new Set(
  [...METHOD_SOURCES.matchAll(/UNIMPL_NATIVE_METHOD\((\w+)\)/g)].map((match) => match[1])
);
const constants = new Map(
  [...readSource('EXWebGLConstants.def').matchAll(/^GL_CONSTANT\((\w+)\)\s*\/\*\s*(\d+)\s*\*\//gm)].map(
    (match) => [match[1] as string, Number(match[2])] as const
  )
);
const constantNames = new Map([...constants].map(([name, value]) => [value, name] as const));

const unsupportedBlock =
  GET_PARAMETER_SOURCE.split('// Unimplemented...')[1]?.split('throw std::runtime_error')[0] ?? '';
const unsupportedParameters = new Set(
  [...unsupportedBlock.matchAll(/case GL_(\w+):/g)].map((match) => match[1])
);

function createNativeLikeContext(extensionResult: object | null, supportsWebGL2 = true) {
  const calledMethods = new Set<string>();
  const missingConstants = new Set<string>();

  const getParameter = (parameter: number): unknown => {
    const name = constantNames.get(parameter) ?? '';
    if (unsupportedParameters.has(name)) {
      throw new Error(`EXGL: getParameter() doesn't support gl.${name} yet!`);
    }
    switch (name) {
      case 'VERSION':
        return 'OpenGL ES 3.0 Metal';
      case 'SHADING_LANGUAGE_VERSION':
        return 'OpenGL ES GLSL ES 3.00';
      case 'VENDOR':
      case 'RENDERER':
        return 'Apple';
      case 'SCISSOR_BOX':
      case 'VIEWPORT':
        return new Int32Array([0, 0, 600, 400]);
      default:
        return 16;
    }
  };

  const getProgramParameter = (_program: unknown, parameter: number): unknown => {
    const name = constantNames.get(parameter);
    return name === 'ACTIVE_UNIFORMS' || name === 'ACTIVE_ATTRIBUTES' ? 0 : true;
  };

  const handlers: Record<string, (...args: never[]) => unknown> = {
    getContextAttributes: () => ({
      alpha: true,
      depth: true,
      stencil: true,
      antialias: false,
      premultipliedAlpha: false,
    }),
    isContextLost: () => false,
    getExtension: () => extensionResult,
    getSupportedExtensions: () => [],
    getError: () => 0,
    getParameter: getParameter as (...args: never[]) => unknown,
    getProgramParameter: getProgramParameter as (...args: never[]) => unknown,
    getShaderParameter: () => true,
    getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getShaderSource: () => '',
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    createVertexArray: () => ({}),
  };

  const gl = new Proxy(Object.create(null) as Record<string, unknown>, {
    get(target, property) {
      if (typeof property !== 'string') {
        return undefined;
      }
      if (property in target) {
        return target[property];
      }
      if (property === 'supportsWebGL2') {
        return supportsWebGL2;
      }
      if (property === 'drawingBufferWidth') {
        return 600;
      }
      if (property === 'drawingBufferHeight') {
        return 400;
      }
      if (/^[A-Z][A-Z0-9_]*$/.test(property)) {
        if (!constants.has(property)) {
          missingConstants.add(property);
        }
        return constants.get(property);
      }
      if (throwingMethods.has(property)) {
        return () => {
          throw new Error(`EXGL: gl.${property}() is not implemented natively`);
        };
      }
      // Anything else (`gl.canvas`, unsupported methods) does not exist natively either.
      if (!implementedMethods.has(property)) {
        return undefined;
      }
      return (...args: never[]) => {
        calledMethods.add(property);
        return handlers[property]?.(...args);
      };
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  }) as unknown as ExpoWebGLRenderingContext;

  return { gl, calledMethods, missingConstants };
}

describe('Expo Go running expo-gl older than 58.0.4', () => {
  // Those binaries make every WebGL 2 context `instanceof WebGLRenderingContext`.
  class LegacyWebGLRenderingContext {
    static [Symbol.hasInstance](): boolean {
      return true;
    }
  }

  const scope = globalThis as unknown as { WebGLRenderingContext?: unknown };
  let previousConstructor: unknown;

  beforeEach(() => {
    previousConstructor = scope.WebGLRenderingContext;
    scope.WebGLRenderingContext = LegacyWebGLRenderingContext;
  });

  afterEach(() => {
    scope.WebGLRenderingContext = previousConstructor;
  });

  it('accepts a WebGL 2 context and restores the global afterwards', () => {
    const { gl } = createNativeLikeContext(null);

    const renderer = createCurveRenderer(gl);

    expect(scope.WebGLRenderingContext).toBe(LegacyWebGLRenderingContext);
    renderer.dispose();
  });

  it('still rejects a device that only offers WebGL 1', () => {
    const { gl } = createNativeLikeContext(null, false);

    expect(() => createCurveRenderer(gl)).toThrow(/WebGL 1/);
    expect(scope.WebGLRenderingContext).toBe(LegacyWebGLRenderingContext);
  });
});

describe('three.js against the native expo-gl surface', () => {
  it('finds the native method and parameter lists in the expo-gl sources', () => {
    expect(implementedMethods.has('drawElements')).toBe(true);
    expect(implementedMethods.has('endFrameEXP')).toBe(true);
    expect(throwingMethods.has('renderbufferStorageMultisample')).toBe(true);
    expect(unsupportedParameters.has('TEXTURE_BINDING_2D')).toBe(true);
    expect(constants.get('TRIANGLES')).toBe(4);
  });

  // Natively, getExtension returns null when unsupported and an empty object when supported.
  it.each([
    ['no extensions', null],
    ['every extension as an empty object', {}],
  ])('initializes, draws, updates and disposes natively with %s', (_label, extensionResult) => {
    const { gl, calledMethods, missingConstants } = createNativeLikeContext(extensionResult);
    const frames: ((timestamp: number) => void)[] = [];
    let now = 0;
    const flushFrames = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        now += 16;
        frames.shift()?.(now);
      }
    };

    const onRenderError = jest.fn();
    const scene = new MonthlyCurveScene({
      gl,
      bufferWidth: 600,
      bufferHeight: 400,
      pixelRatio: 2,
      palette: toScenePalette(palettes.dark, 'dark'),
      curve: buildTestCurve(),
      metricId: 'flow',
      reducedMotion: false,
      onRenderError,
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: () => undefined,
    });

    flushFrames(4);
    scene.setPalette(toScenePalette(palettes.light, 'light'));
    scene.setMetric('debt');
    scene.setStop(10);
    scene.resize(900, 600);
    flushFrames(4);
    scene.dispose();

    expect(onRenderError).not.toHaveBeenCalled();
    expect(calledMethods.has('drawElements')).toBe(true);
    expect(calledMethods.has('endFrameEXP')).toBe(true);
    expect([...missingConstants]).toEqual([]);
  });
});
