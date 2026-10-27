import { lstat, readdir, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

export interface Entry {
	readonly file: string;
	readonly directory: string;
}

const inside = function(root: string, path: string): boolean {
	const offset = relative(root, path);
	return offset !== '..' && !offset.startsWith(`..${sep}`) && !offset.startsWith(sep);
};

export const discoverEntries = async function(root: string): Promise<readonly Entry[]> {
	const entries: Entry[] = [];
	const canonicalRoot = await realpath(root);
	const add = async function(directory: string): Promise<void> {
		const file = join(root, directory, 'index.html');
		if (await Bun.file(file).exists() && inside(canonicalRoot, await realpath(file))) {
			entries.push({ file, directory });
		}
	};
	await add('');
	const games = await readdir(join(root, 'games'), { withFileTypes: true }).catch(function(error: unknown) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
		throw error;
	});
	for (const game of games.sort(function(a, b) { return a.name.localeCompare(b.name); })) {
		if (game.isDirectory() && !game.name.startsWith('.')) await add(`games/${game.name}`);
	}
	return entries;
};

export type Files = ReadonlyMap<string, Blob>;

export const bundleEntry = async function(entry: Entry, minify: boolean): Promise<Files> {
	const result = await Bun.build({
		entrypoints: [entry.file],
		root: dirname(entry.file),
		target: 'browser',
		minify,
		publicPath: './',
	});
	if (!result.success) throw new AggregateError(result.logs, `Bundle failed: ${entry.file}`);
	const files = new Map<string, Blob>();
	for (const output of result.outputs) {
		const path = output.path.replace(/^\.\//, '').split(sep).join('/');
		if (path.startsWith('..')) throw new Error(`Bundle escaped entry directory: ${path}`);
		files.set(`/${entry.directory ? `${entry.directory}/` : ''}${path}`, output);
	}
	return files;
};

export const publicFiles = async function(entry: Entry): Promise<Files> {
	const root = join(dirname(entry.file), 'public');
	const files = new Map<string, Blob>();
	if (!(await lstat(root).catch(function(error: unknown) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
		throw error;
	}))?.isDirectory()) return files;
	const canonicalRoot = await realpath(root);
	for await (const path of new Bun.Glob('**/*').scan({ cwd: root, onlyFiles: true, dot: false, followSymlinks: false })) {
		const segments = path.split('/');
		if (segments.some(function(segment) { return segment.startsWith('.') || segment === 'node_modules'; })) continue;
		const file = join(root, path);
		if (!inside(canonicalRoot, await realpath(file))) continue;
		files.set(`/${entry.directory ? `${entry.directory}/` : ''}${path}`, Bun.file(file));
	}
	return files;
};

export const collectFiles = async function(entries: readonly Entry[], minify: boolean): Promise<Files> {
	const files = new Map<string, Blob>();
	for (const entry of entries) {
		for (const group of [await bundleEntry(entry, minify), await publicFiles(entry)]) {
			for (const [path, blob] of group) {
				if (files.has(path)) throw new Error(`Output collision: ${path}`);
				files.set(path, blob);
			}
		}
	}
	return files;
};

export const projectRoot = resolve(import.meta.dir, '..');
