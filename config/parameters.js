const lodash = require('lodash');

const environment = process.env.NODE_ENV || 'dev';
const configPath = `${__dirname}/../config`;
const rootPath = `${configPath}/..`;
const testsPath = `${rootPath}/tests`;
const distPath = `${rootPath}/dist`;
const packagesPath = process.env.PACKAGES_PATH || `${rootPath}/packages`;
const packageConfig = require('../package.json');

const { version } = packageConfig;
const { name } = packageConfig;

try {
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const localEnv = require(`./env.${environment}.json`);
    process.env = lodash.assign(process.env, localEnv);
} catch (e) {
    console.info(`Do not use override env.${environment}.json file`);
}

module.exports = {
    environment,
    paths: {
        configPath,
        rootPath,
        testsPath,
        distPath,
        packagesPath,
    },
    app: {
        name,
        version,
    },
};
