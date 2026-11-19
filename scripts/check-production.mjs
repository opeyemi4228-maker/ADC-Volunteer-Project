import { productionConfig } from '../lib/production-config.js';
const { errors, warnings } = productionConfig();
for (const message of errors) console.error(`ERROR: ${message}`);
for (const message of warnings) console.warn(`WARNING: ${message}`);
console.log(errors.length ? `${errors.length} configuration requirements remain.` : 'Configuration checks passed. Run live service and browser smoke tests before launch.');
process.exitCode = errors.length ? 1 : 0;
