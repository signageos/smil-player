import fs from 'fs';
import { compile } from '@mdx-js/mdx';
import { sync as globSync } from 'glob';

const filePaths = globSync('./docs/**/*.md');

(async () => {
	const errors = [];
	let processed = 0;

	function tickProgress() {
		processed += 1;
		process.stderr.write(`Processed ${processed} of ${filePaths.length}\n`);
	}

	process.stderr.write(`Number of files: ${filePaths.length}\n`);
	for (const filePath of filePaths) {
		process.stderr.write(`- ${filePath}\n`);
	}

	await Promise.all(filePaths.map(async (filePath) => {
		const file = fs.readFileSync(filePath);
		try {
			await compile(file);
		} catch (error) {
			errors.push({ filePath, error });
		} finally {
			tickProgress();
		}
	}));

	if (errors.length > 0) {
		process.stderr.write(`Number of errors: ${errors.length}\n`);
	}

	for (const { filePath, error } of errors) {
		process.stderr.write(`- ${filePath}\n`);
		process.stderr.write(`\t${error}\n`);
	}

	if (errors.length > 0) {
		process.exit(1);
	} else {
		process.stderr.write('No errors found\n');
	}
})();
