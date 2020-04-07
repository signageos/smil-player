const webpack = require('webpack');
const { CheckerPlugin } = require('awesome-typescript-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const SignageOSPlugin = require('@signageos/cli/dist/Webpack/Plugin');

module.exports = (_env, argv) => {

    if (argv.mode === 'development' && argv.serveIndex) {
        // webpack-dev-server
        require('./tools/cors-anywhere');
    }

    return {
        target: 'web',
        entry: './src/index.ts',
        output: {
            filename: 'index.js',
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: 'awesome-typescript-loader',
                },
            ],
        },
        plugins: [
            new webpack.EnvironmentPlugin({
                ...argv.mode === 'development' ? {
                    CORS_ANYWHERE: 'http://localhost:8086/',
                } : {},
            }),
            new CheckerPlugin(),
            new HtmlWebpackPlugin({
                template: 'public/index.html',
                inlineSource: '.(js|css)$', // embed all javascript and css inline
            }),
            new SignageOSPlugin()
        ],
    };
};
