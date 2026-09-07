// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-markdown$': '<rootDir>/__tests__/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/__tests__/__mocks__/remark-plugin.ts',
    '^remark-breaks$': '<rootDir>/__tests__/__mocks__/remark-plugin.ts',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/tests/e2e/', '<rootDir>/e2e/', '<rootDir>/__tests__/__mocks__/'],
  modulePathIgnorePatterns: ['<rootDir>/.next/']
};

module.exports = createJestConfig(customJestConfig);
