import { createDevHandler, serverPort } from './server';
import { projectRoot } from './workspace';

const server = Bun.serve({
	port: serverPort(),
	fetch: await createDevHandler(projectRoot),
});
console.log(`Serving workspace at ${server.url} (refresh to rebuild)`);
