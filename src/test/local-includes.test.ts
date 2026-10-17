import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { convertAsciiDocInWorker } from '../extension';

suite('Local include directory setting', () => {
	let root: string;
	let baseDir: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'asciidoc-includes-'));
		baseDir = path.join(root, 'docs', 'pages');
		await fs.mkdir(baseDir, { recursive: true });
		await fs.mkdir(path.join(root, 'proto'));
		await fs.writeFile(path.join(root, 'proto', 'service.proto'), 'first\nmessage Service {}\nlast\n');
		await fs.writeFile(path.join(baseDir, 'local.adoc'), 'LOCAL_INCLUDE\n');
	});

	teardown(async () => { await fs.rm(root, { recursive: true, force: true }); });

	function convert(source: string, restrictLocalIncludes?: boolean) {
		return convertAsciiDocInWorker({
			source, base_dir: baseDir, restrictLocalIncludes,
			attributes: { 'allow-uri-read': false },
		});
	}

	test('Defaults to unrestricted local includes in settings and the worker', async () => {
		assert.strictEqual(vscode.workspace.getConfiguration('asciidoc-local-preview').get('restrictLocalIncludes'), false);
		const html = await convert('[source,protobuf]\n----\ninclude::../../proto/service.proto[lines=2]\n----');
		assert.ok(html.includes('message Service {}'), html);
		assert.ok(!html.includes('first'), html);
		assert.ok(!html.includes('last'), html);
	});

	test('Resolves nested includes relative to the included file and preserves tags', async () => {
		await fs.writeFile(path.join(root, 'proto', 'outer.adoc'), 'include::tagged.adoc[tag=selected]\n');
		await fs.writeFile(path.join(root, 'proto', 'tagged.adoc'), '// tag::selected[]\nSELECTED_INCLUDE\n// end::selected[]\nOMITTED_INCLUDE\n');
		const html = await convert('include::../../proto/outer.adoc[]');
		assert.ok(html.includes('SELECTED_INCLUDE'), html);
		assert.ok(!html.includes('OMITTED_INCLUDE'), html);
	});

	test('Allows absolute local paths when relaxed', async () => {
		const html = await convert(`include::${path.join(root, 'proto', 'service.proto')}[]`, false);
		assert.ok(html.includes('message Service {}'), html);
	});

	test('Restricted mode blocks parent paths and still allows files in the document directory', async () => {
		const html = await convert('include::../../proto/service.proto[]\n\ninclude::local.adoc[]', true);
		assert.ok(!html.includes('message Service {}'), html);
		assert.ok(html.includes('LOCAL_INCLUDE'), html);
	});

	test('Remote includes stay blocked even if the document enables URI reads', async () => {
		const target = ['https:', '', '127.0.0.1:1', 'remote.adoc'].join('/');
		for (const restricted of [false, true]) {
			const html = await convert(`:allow-uri-read:\n\ninclude::${target}[]`, restricted);
			assert.ok(html.includes('class="bare include"'), html);
			assert.ok(!html.includes('Unresolved directive'), html);
		}
	});
});
