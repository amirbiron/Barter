/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    env: {
        es2021: true,
        node: true,
    },
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
    },
    extends: [
        'eslint:recommended',
        // Disables stylistic rules that may conflict with Prettier
        'prettier',
    ],
    rules: {
        // Warnings-only baseline
        'no-unused-vars': 'warn',
        'no-undef': 'warn',
        'prefer-const': 'warn',
        eqeqeq: 'warn',
        curly: 'warn',
        'no-empty': 'warn',
        'no-useless-escape': 'warn',
        'no-prototype-builtins': 'warn',
        'no-case-declarations': 'warn',
        'no-async-promise-executor': 'warn',
        // Allow console in Node app
        'no-console': 'off',
    },
    ignorePatterns: [
        'node_modules/',
        'barter_bot.db',
    ],
};

