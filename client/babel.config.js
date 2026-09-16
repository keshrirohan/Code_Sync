// babel.config.js — Babel configuration used by babel-jest during testing.
//
// This is only used by Jest. Vite has its own JSX transform and does not
// read this file. We use CommonJS-compatible presets so Jest can require
// them without any ESM interop issues.

export default {
  presets: [
    // Transpile modern JS (ES2020+) down to what the current Node supports
    ['@babel/preset-env', { targets: { node: 'current' } }],
    // Transpile JSX — automatic runtime means no need to import React in every file
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
