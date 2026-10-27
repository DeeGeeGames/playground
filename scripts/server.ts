import { realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { collectFiles, discoverEntries, type Files } from './workspace';

export const requestPath = function(url: string): string | undefined {
	try {
		const path = decodeURIComponent(new URL(url).pathname);
		if (path.includes('\\') || path.includes('\0') || path.split('/').some(function(segment) {
			return segment.startsWith('.') || segment === 'node_modules';
		})) return undefined;
		return path;
	} catch {
		return undefined;
	}
};

export const serveFiles = function(request: Request, files: Files): Response {
	const path = requestPath(request.url);
	if (!path) return new Response('Not found', { status: 404 });
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
	}
	const index = `${path.endsWith('/') ? path : `${path}/`}index.html`;
	if (!path.endsWith('/') && files.has(index)) {
		const target = new URL(request.url);
		target.pathname = `${target.pathname}/`;
		return Response.redirect(target.href, 308);
	}
	const file = files.get(path.endsWith('/') ? index : path);
	if (!file) return new Response('Not found', { status: 404 });
	return new Response(request.method === 'HEAD' ? null : file, {
		headers: { 'Content-Type': file.type || 'application/octet-stream' },
	});
};

export const loadDist = async function(root: string): Promise<Files> {
	const canonicalRoot = await realpath(root);
	const files = new Map<string, Blob>();
	for await (const path of new Bun.Glob('**/*').scan({ cwd: root, onlyFiles: true, dot: false, followSymlinks: false })) {
		if (path.split('/').some(function(segment) { return segment.startsWith('.') || segment === 'node_modules'; })) continue;
		const file = join(root, path);
		const offset = relative(canonicalRoot, await realpath(file));
		if (offset === '..' || offset.startsWith('../')) continue;
		files.set(`/${path}`, Bun.file(file));
	}
	if (!files.has('/index.html')) throw new Error('Run bun run build before previewing.');
	return files;
};

export const createDevHandler = async function(root: string): Promise<(request: Request) => Promise<Response>> {
	let files = await collectFiles(await discoverEntries(root), false);
	return async function(request: Request): Promise<Response> {
		const path = requestPath(request.url);
		// Re-discover on page navigation, including folders added after startup.
		if (path && (path.endsWith('/') || path.endsWith('.html') || !path.split('/').at(-1)?.includes('.'))) {
			files = await collectFiles(await discoverEntries(root), false);
		}
		return serveFiles(request, files);
	};
};

export const serverPort = function(): number {
	const port = Number(Bun.env['PORT'] ?? '3000');
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
	return port;
};
