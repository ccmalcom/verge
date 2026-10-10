import { aiSdkGenerator } from '../src/generate.js';
import { createHandler } from '../src/handler.js';

// Vercel Functions entry (Web-standard fetch export). Not deployed in sub-project 1.
const handler = createHandler({
  generatorFor: (vendor) => aiSdkGenerator(vendor),
  env: process.env,
  log: (entry) => console.log(JSON.stringify(entry)),
});

export default { fetch: handler };
