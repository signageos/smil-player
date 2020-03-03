const { CheckerPlugin } = require('awesome-typescript-loader')

exports = module.exports = {
	entry: './src/index.ts',
	output: {
		filename: 'index.js',
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx']
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: 'awesome-typescript-loader'
			}
		]
	},
	plugins: [
		new CheckerPlugin()
	]
};
