var nodeExternals = require('webpack-node-externals');
const path = require('path');
// Reference https://zinserjan.github.io/mocha-webpack/docs/guides/code-coverage.html
module.exports = {
    // entry: './test/unit/crypto.ts',
    mode: 'production',
    target: 'node', // webpack should compile node compatible code
    externals: [nodeExternals()], // in order to ignore all modules in node_modules folder,
    resolve: {
        extensions: [ '.js', '.jsx', '.json', '.ts', '.tsx' ]
    },
    devtool: 'inline-cheap-module-source-map',
    module: {
        rules: [
            {
                test: /\.(ts?)$/,
                include: path.resolve(__dirname, 'src'), // instrument only testing sources with Istanbul, after ts-loader runs
                loader: 'istanbul-instrumenter-loader',
                enforce: 'post'
            },
            {
                test: /\.(ts?)$/,
                exclude: [
                    [
                      path.resolve(__dirname, 'node_modules'),
                      path.resolve(__dirname, '.serverless'),
                      path.resolve(__dirname, '.webpack'),
                    ],
                ],
                loader: ['ts-loader'],
            }
        ]
    },
    output: {
        // use absolute paths in sourcemaps (important for debugging via IDE)
        devtoolModuleFilenameTemplate: '[absolute-resource-path]',
        devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]?[hash]'
    },
};