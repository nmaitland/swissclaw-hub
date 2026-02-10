module.exports = [
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.min.js',
      '**/*.ts',
      '**/*.tsx',
      'server/**/*.ts',
      'server/**/*.tsx',
      'client/src/**/*.ts',
      'client/src/**/*.tsx',
      'client/src/**/*.js',
      'client/src/**/*.jsx',
    ],
  },
];