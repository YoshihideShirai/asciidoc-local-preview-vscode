import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Asciidoctor 4 compatibility', () => {
	test('Converts chapter captions and embedded diagram sources', async () => {
		const asciidoctor = await import('@asciidoctor/core');
		const registry = asciidoctor.Extensions.create();
		const captions = require('asciidoctor-numbered-captions');
		const kroki = await import('asciidoctor-kroki-embedded');
		captions.register(registry, { defaultNumbering: 'chaptered' });
		kroki.register(registry, { diagramNames: ['mermaid'], defaultFormat: 'svg' });
		const source = fs.readFileSync(path.resolve(__dirname, '../../examples/numbered-captions-test.adoc'), 'utf8');
		const html = String(await asciidoctor.convert(source, { safe: 'safe', extension_registry: registry }));
		for (const label of ['Figure 1-1', 'Figure 1-2', 'Figure 2-1', 'Figure 2-2', 'Table 1-1', 'Table 2-1', 'Equation 1-1', 'Equation 2-1']) {
			assert.ok(html.includes(label), label);
		}
		const diagram = String(await asciidoctor.convert('[mermaid]\n....\ngraph TD; A-->B;\n....', { safe: 'safe', extension_registry: registry }));
		assert.ok(diagram.includes('kroki-embedded-source'));
		assert.ok(diagram.includes('A--&gt;B') || diagram.includes('A-->B'));
		assert.ok(!diagram.includes('[object Promise]'));
	});
});
