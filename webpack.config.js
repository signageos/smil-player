
const webpack = require('webpack');
const path = require('path');
const NpmPackPlugin = require('@signageos/lib/dist/Webpack/NpmPackPlugin').default;
const parameters = require('./config/parameters');

const packageConfigPath = `${parameters.paths.rootPath}/package.json`;

module.exports = {
    entry: ['@babel/polyfill', './src/index'],
    output: {
        path: parameters.paths.distPath,
        filename: 'bundle.js',
        publicPath: '/',
        libraryTarget: 'umd',
    },
    devtool: 'source-map',
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': `"${parameters.environment}"`,
        }),
        new webpack.WatchIgnorePlugin([path.resolve(packageConfigPath)]),
        new NpmPackPlugin({
            name: parameters.app.name,
            environment: parameters.environment,
            rootPath: parameters.paths.rootPath,
            packagesPath: parameters.paths.packagesPath,
        }),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    module: {
        rules: [
            { test: /\.tsx?$/, loader: 'awesome-typescript-loader' },
            {
                test: /\.(t|j)sx?$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
                options: { presets: [require.resolve('@babel/preset-env')] },
                enforce: 'post',
            },
        ],
    },
}
