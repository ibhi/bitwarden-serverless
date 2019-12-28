/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const slsw = require('serverless-webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const isLocal = slsw.lib.webpack.isLocal;

const config= require('../../webpack.common.config');

module.exports = config(path, nodeExternals, slsw, ForkTsCheckerWebpackPlugin, isLocal)