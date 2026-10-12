import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

suite('Diagram SVG export', () => {
	test('Adds export only after rendering and serializes a standalone clone', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../src/extension.ts'), 'utf8');
		const start = source.indexOf('const addDiagramSaveButtons =');
		const end = source.indexOf("window.addEventListener('error'", start);
		let rendered = false;
		let button: { title?: string; innerHTML?: string; className?: string; setAttribute: () => void; addEventListener: (type: string, fn: () => void) => void } | undefined;
		let click: (() => void) | undefined;
		let observe: (() => void) | undefined;
		const messages: unknown[] = [];
		const attributes: Record<string, string> = {};
		const clone = { setAttribute: (name: string, value: string) => { attributes[name] = value; } };
		const svg = { namespaceURI: 'urn:test:svg', cloneNode: () => clone };
		const output = { querySelector: () => rendered ? svg : null };
		const diagram = {
			querySelector: (selector: string) => selector === '.save-diagram' ? button : output,
			appendChild: (value: typeof button) => { button = value; },
		};
		vm.runInNewContext(source.slice(start, end), {
			document: {
				body: {}, querySelectorAll: () => [diagram],
				createElement: () => ({ setAttribute() {}, addEventListener: (_type: string, fn: () => void) => { click = fn; } }),
			},
			MutationObserver: class {
				constructor(callback: () => void) { observe = callback; }
				observe() {}
			},
			XMLSerializer: class { serializeToString(value: unknown) { assert.strictEqual(value, clone); return '<svg></svg>'; } },
			vscodeApi: { postMessage: (message: unknown) => messages.push(message) },
			previewRenderId: 'current-render',
		});
		assert.strictEqual(button, undefined);
		rendered = true;
		observe!();
		assert.strictEqual(button!.title, 'Save SVG');
		assert.ok(button!.innerHTML!.includes('aria-hidden="true"'));
		const firstButton = button;
		observe!();
		assert.strictEqual(button, firstButton);
		click!();
		assert.strictEqual(attributes.xmlns, svg.namespaceURI);
		assert.strictEqual(JSON.stringify(messages), JSON.stringify([
			{ type: 'saveDiagram', renderId: 'current-render', index: 1, svg: '<svg></svg>' },
		]));
	});
});
