const path = require('path');

module.exports = {
    root: true,
    env: {
        node: true
    },
    parser: '@typescript-eslint/parser',
    plugins: [
        '@typescript-eslint',
    ],
    extends: [
        'airbnb-typescript/base',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/errors',
        'plugin:import/warnings',
        'plugin:import/typescript' //this line does the trick 
    ],
    rules: {
        'no-console': ['off'],
        'class-methods-use-this': ['off'],
        'import/prefer-default-export': ['off'],
        'import/no-unresolved': ['off']
        // '@typescript-eslint/no-explicit-any': ['off'],
        // 'no-use-before-define': ['off'],
        // 'prefer-template': ['off'],
        // 'no-loop-func': ['off']
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: [ '.ts', '.tsx' ],
                paths: ['node_modules/@types']
            },
        }
    },
};