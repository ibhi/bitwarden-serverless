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
    ],
    rules: {
        'no-console': ['off'],
        'class-methods-use-this': ['off'],
        'import/prefer-default-export': ['off'],
        '@typescript-eslint/no-explicit-any': ['off'],
        // 'no-use-before-define': ['off'],
        // 'prefer-template': ['off'],
        // 'no-loop-func': ['off']
    },
};