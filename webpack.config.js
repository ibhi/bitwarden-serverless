/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const slsw = require('serverless-webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const isLocal = slsw.lib.webpack.isLocal;

module.exports = {
  mode: isLocal ? 'development' : 'production',
  entry: slsw.lib.entries,
  externals: [nodeExternals()],
  devtool: 'source-map',
  resolve: {
    extensions: [ '.js', '.jsx', '.json', '.ts', '.tsx' ]
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js'
  },
  target: 'node',
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      {
        test: /\.(tsx?)$/,
        // loader: 'ts-loader',
        exclude: [
          [
            path.resolve(__dirname, 'node_modules'),
            path.resolve(__dirname, '.serverless'),
            path.resolve(__dirname, '.webpack'),
          ],
        ],
        use: [{
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            experimentalWatchApi: true,
          },
        }, {
              loader: 'cache-loader',
              options: {
                cacheDirectory: path.resolve('.webpackCache')
              }
          },
        ],
        
      },
      {
        test: /test\.ts$/,
        use: ['ts-loader', 'mocha-loader'],
        exclude: /node_modules/,
      },
    ]
  },
  plugins: [new ForkTsCheckerWebpackPlugin()]
};