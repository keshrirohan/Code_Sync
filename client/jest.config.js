// jest.config.js — Jest configuration for the CodeSync React frontend.
//
// ESM export is required because package.json has "type":"module".
// Babel-jest transpiles JSX + ESM imports into CommonJS so Jest/jsdom can load them.

export default {
  // Simulate a browser environment for React component rendering
  testEnvironment: 'jest-environment-jsdom',

  // Discover test files inside src/
  testMatch: [
    '**/src/**/__tests__/**/*.{js,jsx}',
    '**/src/**/*.test.{js,jsx}',
  ],

  // Transpile JS/JSX through Babel (see babel.config.js)
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },

  // CSS module imports return an identity proxy (class names resolve as strings)
  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
  },

  // Run after the test framework is installed — injects jest-dom matchers
  // (toBeInTheDocument, toHaveTextContent, etc.) into every test file
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
};
