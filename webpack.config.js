const { CheckerPlugin } = require('awesome-typescript-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');
const SignageOSPlugin = require('@signageos/cli/dist/Webpack/Plugin');

module.exports = {
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
        new CheckerPlugin(),
        new HtmlWebpackPlugin({
            template: 'public/index.html',
            inlineSource: '.(js|css)$', // embed all javascript and css inline
        }),
        new HtmlWebpackInlineSourcePlugin(),
        new SignageOSPlugin()
    ],
};
