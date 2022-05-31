#!/usr/bin/env node

const fs = require('fs');
const packageConfig = require('../package');

fs.writeFileSync(
	'./package.json',
	JSON.stringify(
		{
			...packageConfig,
			publishConfig: {
				registry: 'https://registry.npmjs.org/',
				access: 'public',
			},
			files: ['tools', 'package.json'],
		},
		undefined,
		2,
	) + '\n',
);
