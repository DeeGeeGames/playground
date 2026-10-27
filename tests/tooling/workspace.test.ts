import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildWorkspace } from '../../scripts/build';
import { createDevHandler, loadDist, requestPath, serveFiles } from '../../scripts/server';
import { discoverEntries } from '../../scripts/workspace';

const roots: string[] = [];
const write = async function(root: string, path: string, contents: string): Promise<void> {
	await mkdir(dirname(join(root, path)), { recursive: true });
	await Bun.write(join(root, path), contents);
};
const addEntry = async function(root: string, directory: string): Promise<void> {
	await write(root, `${directory}index.html`, '<!doctype html><link rel="stylesheet" href="./styles.css"><script type="module" src="./src/main.ts"></script><img src="./images/icon.svg">');
	await write(root, `${directory}src/main.ts`, 'import { value } from "../../../shared/value"; console.log(value);');
	if (!directory) await write(root, 'src/main.ts', 'console.log("launcher");');
	await write(root, `${directory}styles.css`, 'body { background: red; }');
	await write(root, `${directory}images/icon.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
};
const fixture = async function(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'playground-tooling-'));
	roots.push(root);
	await write(root, 'CNAME', 'experiments.deegeegames.com\n');
	await write(root, 'shared/value.ts', 'export const value = 42;');
	await addEntry(root, '');
	await addEntry(root, 'games/first/');
	await addEntry(root, 'templates/basic/');
	await write(root, 'games/first/public/audio/nested/tone.txt', 'audio fixture');
	return root;
};
const request = function(path: string): Request { return new Request(`https://example.test${path}`); };

afterEach(async function() {
	await Promise.all(roots.splice(0).map(function(root) { return rm(root, { recursive: true, force: true }); }));
});

test('discovers root and direct game entries, excluding templates and symlinked games', async function() {
	const root = await fixture();
	await symlink(join(root, 'templates/basic'), join(root, 'games/link'));
	expect((await discoverEntries(root)).map(function(entry) { return entry.directory; })).toEqual(['', 'games/first']);
	await addEntry(root, 'games/second/');
	expect((await discoverEntries(root)).map(function(entry) { return entry.directory; })).toEqual(['', 'games/first', 'games/second']);
});

test('bundles directory entries and resolves emitted assets at custom-domain and project prefixes', async function() {
	const root = await fixture();
	await buildWorkspace(root);
	const files = await loadDist(join(root, 'dist'));
	expect(await files.get('/CNAME')?.text()).toBe('experiments.deegeegames.com\n');
	for (const prefix of ['', '/playground']) {
		for (const directory of ['/', '/games/first/']) {
			const url = `https://example.test${prefix}${directory}`;
			const response = serveFiles(request(directory), files);
			expect(response.status).toBe(200);
			const references: string[] = [];
			const html = await new HTMLRewriter().on('[src], [href]', {
				element(element) {
					const reference = element.getAttribute('src') ?? element.getAttribute('href');
					if (reference) references.push(reference);
				},
			}).transform(response).text();
			expect(html.toLowerCase()).toContain('<!doctype html>');
			expect(references.length).toBeGreaterThanOrEqual(3);
			for (const reference of references) {
				const resolved = new URL(reference, url);
				expect(resolved.pathname.startsWith(`${prefix}${directory}`)).toBe(true);
				const path = resolved.pathname.slice(prefix.length);
				expect(serveFiles(request(path), files).status).toBe(200);
			}
		}
	}
	expect(await serveFiles(request('/games/first/audio/nested/tone.txt'), files).text()).toBe('audio fixture');
	expect(serveFiles(request('/games/first/index.html'), files).status).toBe(200);
	const redirect = serveFiles(request('/games/first?debug=1'), files);
	expect(redirect.status).toBe(308);
	expect(redirect.headers.get('location')).toBe('https://example.test/games/first/?debug=1');
});

test('preview and development reject missing, private, malformed, and traversal paths', async function() {
	const root = await fixture();
	await write(root, 'secret.txt', 'secret');
	await write(root, 'private/hidden.txt', 'secret');
	await symlink(join(root, 'private'), join(root, 'public'));
	await write(root, 'games/first/public/.env', 'secret');
	await write(root, 'games/first/public/node_modules/private.txt', 'secret');
	await symlink(join(root, 'secret.txt'), join(root, 'games/first/public/leak.txt'));
	await buildWorkspace(root);
	const files = await loadDist(join(root, 'dist'));
	const dev = await createDevHandler(root);
	for (const path of ['/missing', '/games/first/missing', '/templates/basic/', '/src/main.ts', '/package.json', '/hidden.txt', '/node_modules/pixi.js/package.json', '/games/first/leak.txt', '/games/first/.env', '/games/first/node_modules/private.txt', '/%ZZ', '/games%2ffirst%2f..%2f..%2fsecret.txt', '/games%5cfirst%5cindex.html', '/%00']) {
		expect(serveFiles(request(path), files).status).toBe(404);
		expect((await dev(request(path))).status).toBe(404);
	}
	expect(requestPath('https://example.test/%2eenv')).toBeUndefined();
	expect(serveFiles(new Request('https://example.test/', { method: 'POST' }), files).status).toBe(405);
	expect(await serveFiles(new Request('https://example.test/', { method: 'HEAD' }), files).text()).toBe('');
});

test('development discovers new games after startup and rebuilds on refresh', async function() {
	const root = await fixture();
	const dev = await createDevHandler(root);
	await addEntry(root, 'games/another/');
	expect((await dev(request('/games/another'))).status).toBe(308);
	expect((await dev(request('/games/another/'))).status).toBe(200);
	await write(root, 'games/another/index.html', '<!doctype html><title>updated</title>');
	expect(await (await dev(request('/games/another/index.html'))).text()).toContain('updated');
});


test('preview excludes symlinks outside dist and public files cannot replace generated HTML', async function() {
	const root = await fixture();
	await write(root, 'secret.txt', 'secret');
	await buildWorkspace(root);
	await symlink(join(root, 'secret.txt'), join(root, 'dist/leak.txt'));
	const files = await loadDist(join(root, 'dist'));
	expect(serveFiles(request('/leak.txt'), files).status).toBe(404);
	await write(root, 'games/first/public/index.html', 'replace bundle');
	await expect(buildWorkspace(root)).rejects.toThrow('Output collision');
});
