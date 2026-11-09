/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  testTimeout: 15000,
  moduleNameMapper: {
    '^@firebase/util$': '<rootDir>/node_modules/@firebase/util/dist/index.cjs.js',
    '^expo-gl$': '<rootDir>/__mocks__/expo-gl.tsx',
    '^three$': '<rootDir>/node_modules/three/build/three.module.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|firebase|@firebase|three)',
  ],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    '!src/domain/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
