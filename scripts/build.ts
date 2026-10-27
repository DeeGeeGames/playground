import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { collectFiles, discoverEntries, projectRoot } from './workspace';

export const buildWorkspace = async function(root: string): Promise<void> {
	const entries = await discoverEntries(root);
	if (!entries.some(function(entry) { return entry.directory === ''; })) throw new Error('Missing root index.html');
	const files = await collectFiles(entries, true);
	const dist = join(root, 'dist');
	await rm(dist, { recursive: true, force: true });
	for (const [path, blob] of files) {
		const destination = join(dist, path);
		await mkdir(dirname(destination), { recursive: true });
		await Bun.write(destination, blob);
	}
	await Bun.write(join(dist, 'CNAME'), Bun.file(join(root, 'CNAME')));
};

if (import.meta.main) {
	await buildWorkspace(projectRoot);
	console.log('Built workspace in dist/');
}
