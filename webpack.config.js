const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const SignageOSPlugin = require('@signageos/webpack-plugin');

module.exports = (_env, argv) => {
	if (argv.mode === 'development' && argv.serveIndex) {
		// webpack-dev-server
		require('./tools/cors-anywhere');
	}

	return {
		mode: !process.env.NODE_ENV ? 'development' : process.env.NODE_ENV,
		target: 'web',
		entry: './src/index.ts',
		output: {
			filename: 'index.js',
		},
		stats: {
			modules: true,
		},
		resolve: {
			extensions: ['.ts', '.tsx', '.js', '.jsx'],
		},
		module: {
			rules: [
				{
					test: /\.ts?$/,
					use: 'ts-loader',
					exclude: path.resolve(__dirname, 'node_modules'),
				},
				{
					test: /\.m?(t|j)sx?$/,
					include: [/.+/],
					exclude: [],
					//exclude: new RegExp(`node_modules(?!${path.delimiter}(lodash|debug|async|@signageos${path.delimiter}.+))`),
					use: [
						{
							loader: 'babel-loader',
							options: {
								presets: ['@babel/preset-env'],
							},
						},
					],
					enforce: 'post',
				},
				{
					test: /\.(png|jpe?g|gif)$/i,
					use: [
						{
							loader: 'file-loader',
						},
					],
				},
			],
		},
		plugins: [
			new webpack.EnvironmentPlugin({
				...(argv.mode === 'development'
					? {
							CORS_ANYWHERE: process.env.CORS_ANYWHERE || 'http://localhost:8086/',
					  }
					: {}),
			}),
			new HtmlWebpackPlugin({
				template: 'public/index.html',
				inlineSource: '.(js|css)$', // embed all javascript and css inline
			}),
			new SignageOSPlugin(),
			new NodePolyfillPlugin(),
		],
	};
};
