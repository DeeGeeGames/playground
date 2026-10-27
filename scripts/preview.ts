import { join } from 'node:path';
import { loadDist, serveFiles, serverPort } from './server';
import { projectRoot } from './workspace';

const files = await loadDist(join(projectRoot, 'dist'));
const server = Bun.serve({
	port: serverPort(),
	fetch(request) { return serveFiles(request, files); },
});
console.log(`Serving dist at ${server.url}`);
