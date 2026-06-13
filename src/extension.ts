import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { emojiMap } from './emoji-map';

const previewPanels = new Map<string, AsciiDocPreviewPanel>();
let outputChannel: vscode.OutputChannel | undefined;
let asciidoctor: AsciiDoctorProcessor | undefined;
const diagramBlockNames = ['mermaid', 'plantuml', 'nomnoml', 'vega', 'vegalite', 'wavedrom', 'bytefield'];
const livePreviewUpdateDelayMs = 150;

type AsciiDoctorProcessor = {
	convert(input: string | Buffer, options?: Record<string, unknown>): string | object;
	Extensions: {
		create(): AsciiDoctorExtensionRegistry;
	};
};

type AsciiDoctorFactory = () => AsciiDoctorProcessor;
type AsciiDoctorExtensionRegistry = {
	preprocessor(callback: (this: any) => void): void;
	block(name: string, callback: (this: any) => void): void;
	blockMacro(name: string, callback: (this: any) => void): void;
	inlineMacro(name: string, callback: (this: any) => void): void;
};

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('AsciiDoc Zero-Network Preview');
	trace('activate');

	context.subscriptions.push(
		outputChannel,
		vscode.commands.registerCommand('asciidoc-local-preview.openPreview', () => openPreview(context.extensionUri)),
		vscode.commands.registerCommand('asciidoc-local-preview.refreshPreview', () => refreshVisiblePreviews()),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.toggleBold', (editor) => wrapSelection(editor, '*', '*', 'strong text')),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.toggleItalic', (editor) => wrapSelection(editor, '_', '_', 'emphasized text')),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.toggleMonospace', (editor) => wrapSelection(editor, '`', '`', 'monospace text')),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.insertLink', (editor) => wrapSelection(editor, 'link:./path/to/document.adoc[', ']', 'link text')),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.insertHeading', (editor) => prefixSelectionLines(editor, '== ')),
		vscode.commands.registerTextEditorCommand('asciidoc-local-preview.insertUnorderedList', (editor) => prefixSelectionLines(editor, '* ')),
		vscode.workspace.onDidChangeTextDocument((event) => {
			const panel = previewPanels.get(event.document.uri.toString());
			if (panel) {
				trace('document changed', getTraceDocumentDetails(event.document));
			}
			panel?.scheduleUpdate(event.document);
		}),
	);
}

function createAsciiDocExtensions() {
	const registry = getAsciiDoctor().Extensions.create();

	registry.preprocessor(function (this: any) {
		this.process(function (_document: any, reader: any) {
			return reader.pushInclude(rewriteLiteralDiagramBlockStyles(reader.readLines()));
		});
	});

	for (const diagramType of diagramBlockNames) {
		registerDiagramBlock(registry, diagramType, 'listing');
		registerDiagramBlock(registry, `${diagramType}literal`, 'literal', diagramType);
		registerDiagramMacro(registry, diagramType);
	}

	registerEmojiMacro(registry);

	return registry;
}

function registerDiagramBlock(registry: AsciiDoctorExtensionRegistry, blockName: string, context: string, diagramType = blockName) {
	registry.block(blockName, function (this: any) {
		this.onContext(context);
		this.process(function (this: any, parent: any, reader: any) {
			const source = reader.getLines().join('\n');

			return this.createBlock(parent, 'pass', renderDiagramBlock(diagramType, source));
		});
	});
}

function registerDiagramMacro(registry: AsciiDoctorExtensionRegistry, diagramType: string) {
	registry.blockMacro(diagramType, function (this: any) {
		this.process(function (this: any, parent: any, target: string) {
			const source = readLocalDiagramSource(diagramType, parent.getDocument().getBaseDir(), target);

			return this.createBlock(parent, 'pass', source.ok
				? renderDiagramBlock(diagramType, source.value)
				: renderDiagramError(diagramType, source.value));
		});
	});
}

function registerEmojiMacro(registry: AsciiDoctorExtensionRegistry) {
	registry.inlineMacro('emoji', function (this: any) {
		this.positionalAttributes('size');
		this.process(function (this: any, parent: any, target: string, attrs: { size?: string }) {
			const emoji = renderEmoji(target, attrs.size);

			return this.createInlinePass(parent, emoji);
		});
	});
}

function rewriteLiteralDiagramBlockStyles(lines: string[]): string[] {
	const rewritten = [...lines];

	for (let index = 0; index < rewritten.length - 1; index += 1) {
		for (const diagramType of diagramBlockNames) {
			const stylePattern = new RegExp(`^\\[${diagramType}(?=[,\\]])`);
			if (stylePattern.test(rewritten[index].trim()) && rewritten[index + 1].trim() === '....') {
				rewritten[index] = rewritten[index].replace(`[${diagramType}`, `[${diagramType}literal`);
			}
		}
	}

	return rewritten;
}

export function deactivate() {
	trace('deactivate');
	for (const panel of previewPanels.values()) {
		panel.dispose();
	}
	previewPanels.clear();
}

function getAsciiDoctor(): AsciiDoctorProcessor {
	if (asciidoctor) {
		return asciidoctor;
	}

	const asciidoctorFactory = require('@asciidoctor/core') as AsciiDoctorFactory;
	asciidoctor = asciidoctorFactory();

	return asciidoctor;
}

function openPreview(extensionUri: vscode.Uri) {
	const document = getActiveAsciiDocDocument();
	if (!document) {
		trace('openPreview skipped: no active AsciiDoc document');
		vscode.window.showWarningMessage('Open an AsciiDoc file before starting the preview.');
		return;
	}

	trace('openPreview requested', getTraceDocumentDetails(document));
	const key = document.uri.toString();
	const existing = previewPanels.get(key);
	if (existing) {
		trace('openPreview revealing existing panel', getTraceDocumentDetails(document));
		existing.reveal();
		existing.update(document);
		return;
	}

	const panel = new AsciiDocPreviewPanel(extensionUri, document);
	previewPanels.set(key, panel);
}

function refreshVisiblePreviews() {
	trace('refreshVisiblePreviews', { panels: previewPanels.size });
	for (const panel of previewPanels.values()) {
		panel.refresh();
	}
}

function getActiveAsciiDocDocument(): vscode.TextDocument | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}

	if (editor.document.languageId === 'asciidoc' || /\.(adoc|asciidoc|asc)$/i.test(editor.document.fileName)) {
		return editor.document;
	}

	return undefined;
}

type WebviewTraceMessage = {
	type?: string;
	renderId?: string;
	event?: string;
	data?: Record<string, unknown>;
};

function trace(event: string, data?: Record<string, unknown>) {
	const suffix = data ? ` ${JSON.stringify(data)}` : '';
	outputChannel?.appendLine(`[${new Date().toISOString()}] ${event}${suffix}`);
}

function getTraceDocumentDetails(document: vscode.TextDocument): Record<string, unknown> {
	return {
		uri: document.uri.toString(),
		version: document.version,
		languageId: document.languageId,
		lineCount: document.lineCount,
		isDirty: document.isDirty,
	};
}

function countPreviewBlocks(html: string): Record<string, number> {
	return {
		mermaid: countOccurrences(html, 'class="mermaid"'),
		plantuml: countOccurrences(html, 'plantuml-diagram'),
		mathStem: countOccurrences(html, 'class="stem"') + countOccurrences(html, 'class="inline-stem"'),
		nomnoml: countOccurrences(html, 'nomnoml-diagram'),
		vega: countOccurrences(html, 'vega-diagram'),
		vegalite: countOccurrences(html, 'vegalite-diagram'),
		wavedrom: countOccurrences(html, 'wavedrom-diagram'),
		bytefield: countOccurrences(html, 'bytefield-diagram'),
	};
}

function countOccurrences(value: string, needle: string): number {
	return value.split(needle).length - 1;
}

class AsciiDocPreviewPanel {
	private readonly panel: vscode.WebviewPanel;
	private readonly documentUri: vscode.Uri;
	private readonly disposables: vscode.Disposable[] = [];
	private document: vscode.TextDocument;
	private pendingUpdate: ReturnType<typeof setTimeout> | undefined;
	private renderSequence = 0;
	private disposed = false;

	constructor(private readonly extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this.document = document;
		this.documentUri = document.uri;
		this.panel = vscode.window.createWebviewPanel(
			'asciidocLocalPreview',
			`Preview: ${getDocumentTitle(document)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: getLocalResourceRoots(this.extensionUri, document),
			},
		);

		trace('preview panel created', getTraceDocumentDetails(document));
		this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
		this.panel.webview.onDidReceiveMessage((message: WebviewTraceMessage) => {
			if (message.type !== 'trace') {
				trace('webview message ignored', { messageType: message.type });
				return;
			}

			trace(`webview:${message.event}`, {
				renderId: message.renderId,
				...message.data,
			});
		}, undefined, this.disposables);
		this.update(document);
	}

	reveal() {
		trace('preview panel reveal', { document: this.documentUri.toString() });
		this.panel.reveal(vscode.ViewColumn.Beside);
	}

	update(document: vscode.TextDocument) {
		if (document.uri.toString() !== this.documentUri.toString()) {
			return;
		}

		this.cancelPendingUpdate();
		this.document = document;
		this.panel.title = `Preview: ${getDocumentTitle(document)}`;
		this.renderSequence += 1;
		const renderId = `${Date.now()}-${this.renderSequence}`;
		trace('preview update start', {
			renderId,
			...getTraceDocumentDetails(document),
		});
		const body = this.renderBody(document);
		trace('preview body rendered', {
			renderId,
			bodyLength: body.length,
			...countPreviewBlocks(body),
		});
		this.panel.webview.html = this.render(document, body, renderId);
		trace('preview html assigned', { renderId });
	}

	scheduleUpdate(document: vscode.TextDocument) {
		if (document.uri.toString() !== this.documentUri.toString()) {
			return;
		}

		this.document = document;
		this.cancelPendingUpdate();
		trace('preview update scheduled', {
			delayMs: livePreviewUpdateDelayMs,
			...getTraceDocumentDetails(document),
		});
		this.pendingUpdate = setTimeout(() => {
			this.pendingUpdate = undefined;
			trace('preview scheduled update fired', getTraceDocumentDetails(this.document));
			this.update(this.document);
		}, livePreviewUpdateDelayMs);
	}

	refresh() {
		trace('preview refresh requested', { document: this.documentUri.toString() });
		this.update(this.document);
	}

	dispose() {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		trace('preview panel disposed', { document: this.documentUri.toString() });
		previewPanels.delete(this.documentUri.toString());
		this.cancelPendingUpdate();
		this.panel.dispose();

		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	private renderBody(document: vscode.TextDocument): string {
		return convertAsciiDoc(document, this.panel.webview);
	}

	private render(document: vscode.TextDocument, body: string, renderId: string): string {
		const nonce = getNonce();
		const cspSource = this.panel.webview.cspSource;
		const antoraPreviewStyleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'antora-default-preview.css'));
		const mermaidScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js'));
		const mathJaxBaseUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mathjax'));
		const mathJaxScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mathjax', 'tex-chtml.js'));
		const mathJaxFontBaseUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mathjax-newcm'));
		const plantUmlScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'plantuml.js'));
		const plantUmlVizScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'viz-global.js'));
		const graphreScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'graphre.js'));
		const nomnomlScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'nomnoml.js'));
		const vegaScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vega.min.js'));
		const vegaLiteScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vega-lite.min.js'));
		const vegaInterpreterScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vega-interpreter.js'));
		const json5ScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'json5.min.js'));
		const waveDromSkinScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'wavedrom-skin-default.js'));
		const waveDromScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'wavedrom.min.js'));
		const bitfieldScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'bitfield.js'));

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(getDocumentTitle(document))}</title>
	<link rel="stylesheet" href="${antoraPreviewStyleUri}">
	<style>
		:root {
			--border: var(--vscode-panel-border);
			--vscode-error-color: var(--vscode-errorForeground);
		}

		.diagram-frame,
		.mermaid-diagram {
			overflow: auto;
			margin: 0 0 1rem;
			padding: 16px;
			border: 1px solid var(--border);
			border-radius: 6px;
			background: var(--pre-background);
		}

		.diagram-frame svg,
		.mermaid-diagram svg {
			display: block;
			max-width: 100%;
			height: auto;
			margin: 0 auto;
		}

		.diagram-source {
			display: none;
		}

		.diagram-error,
		.mermaid-error {
			white-space: pre-wrap;
			color: var(--vscode-error-color);
		}

		.mathjax-error {
			white-space: pre-wrap;
			color: var(--vscode-error-color);
		}

		.emoji {
			display: inline-block;
			line-height: 1;
			vertical-align: -0.125em;
		}
	</style>
</head>
<body>
	<main>
	<article class="doc asciidoc-preview">
		${body}
	</article>
	</main>
	<script nonce="${nonce}">
		const vscodeApi = acquireVsCodeApi();
		const previewRenderId = '${escapeJavaScriptString(renderId)}';
		const tracePreview = (event, data = {}) => {
			vscodeApi.postMessage({
				type: 'trace',
				renderId: previewRenderId,
				event,
				data
			});
		};

		window.addEventListener('error', (event) => {
			tracePreview('window.error', {
				message: String(event.message || ''),
				filename: String(event.filename || ''),
				line: event.lineno,
				column: event.colno
			});
		});

		window.addEventListener('unhandledrejection', (event) => {
			const reason = event.reason;
			tracePreview('window.unhandledrejection', {
				message: String(reason && reason.message ? reason.message : reason)
			});
		});

		tracePreview('webview.loaded', {
			htmlLength: document.documentElement.outerHTML.length,
			mermaid: document.querySelectorAll('.mermaid').length,
			plantuml: document.querySelectorAll('.plantuml-diagram').length,
			math: document.querySelectorAll('mjx-container, .stem, .inline-stem').length,
			nomnoml: document.querySelectorAll('.nomnoml-diagram').length,
			vega: document.querySelectorAll('.vega-diagram').length,
			vegalite: document.querySelectorAll('.vegalite-diagram').length,
			wavedrom: document.querySelectorAll('.wavedrom-diagram').length,
			bytefield: document.querySelectorAll('.bytefield-diagram').length
		});
	</script>
	<script nonce="${nonce}">
		(() => {
			const block = (name) => () => {
				throw new Error(name + ' is disabled in the AsciiDoc preview.');
			};
			const setBlockedGlobal = (name) => {
				try {
					Object.defineProperty(window, name, {
						value: block(name),
						configurable: false,
						writable: false
					});
				} catch {
					window[name] = block(name);
				}
			};

			setBlockedGlobal('fetch');
			setBlockedGlobal('XMLHttpRequest');
			setBlockedGlobal('WebSocket');
			setBlockedGlobal('EventSource');

			try {
				Object.defineProperty(navigator, 'sendBeacon', {
					value: block('sendBeacon'),
					configurable: false,
					writable: false
				});
			} catch {
				// Some Webview runtimes expose navigator methods as read-only.
			}
		})();
	</script>
	<script nonce="${nonce}" src="${mermaidScriptUri}"></script>
	<script nonce="${nonce}" src="${graphreScriptUri}"></script>
	<script nonce="${nonce}" src="${nomnomlScriptUri}"></script>
	<script nonce="${nonce}" src="${vegaScriptUri}"></script>
	<script nonce="${nonce}" src="${vegaLiteScriptUri}"></script>
	<script nonce="${nonce}" src="${vegaInterpreterScriptUri}"></script>
	<script nonce="${nonce}" src="${json5ScriptUri}"></script>
	<script nonce="${nonce}" src="${waveDromSkinScriptUri}"></script>
	<script nonce="${nonce}" src="${waveDromScriptUri}"></script>
	<script nonce="${nonce}" src="${bitfieldScriptUri}"></script>
	<script nonce="${nonce}">
		window.MathJax = {
			tex: {
				inlineMath: [['\\\\(', '\\\\)']],
				displayMath: [['\\\\[', '\\\\]']],
				processEscapes: true
			},
			loader: {
				paths: {
					mathjax: '${mathJaxBaseUri}',
					'mathjax-newcm': '${mathJaxFontBaseUri}'
				}
			},
			startup: {
				typeset: false
			}
		};
	</script>
	<script nonce="${nonce}" id="MathJax-script" src="${mathJaxScriptUri}"></script>
	<script nonce="${nonce}">
		tracePreview('mathjax.start', {
			targets: document.querySelectorAll('.asciidoc-preview .stem, .asciidoc-preview .inline-stem, .asciidoc-preview script[type^="math/tex"]').length,
			hasMathJax: Boolean(window.MathJax)
		});
		MathJax.startup.promise
			.then(() => MathJax.typesetPromise([document.querySelector('.asciidoc-preview')]))
			.then(() => {
				tracePreview('mathjax.done', {
					rendered: document.querySelectorAll('.asciidoc-preview mjx-container').length
				});
			})
			.catch((error) => {
				const message = String(error && error.message ? error.message : error);
				tracePreview('mathjax.error', { message });
				const container = document.createElement('pre');
				container.className = 'mathjax-error';
				container.textContent = message;
				document.querySelector('.asciidoc-preview')?.prepend(container);
			});
	</script>
	<script nonce="${nonce}" src="${plantUmlVizScriptUri}"></script>
	<script nonce="${nonce}">
		(async () => {
			const api = window.mermaid;
			tracePreview('mermaid.start', {
				nodes: document.querySelectorAll('.mermaid').length,
				hasMermaid: Boolean(api)
			});
			if (!api) {
				return;
			}

			api.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: 'default'
			});

			await api.run({
				querySelector: '.mermaid'
			});
			tracePreview('mermaid.done', {
				nodes: document.querySelectorAll('.mermaid').length,
				svgs: document.querySelectorAll('.mermaid svg').length
			});
		})().catch((error) => {
			const message = String(error && error.message ? error.message : error);
			tracePreview('mermaid.error', { message });
			for (const diagram of document.querySelectorAll('.mermaid')) {
				diagram.classList.add('mermaid-error');
				diagram.textContent = message;
			}
		});
	</script>
	<script nonce="${nonce}" type="module">
		import { renderToString } from '${plantUmlScriptUri}';

		tracePreview('plantuml.start', {
			nodes: document.querySelectorAll('.plantuml-diagram').length,
			hasRenderToString: typeof renderToString === 'function'
		});
		let plantUmlRendered = 0;
		let plantUmlFailed = 0;
		const renderPlantUmlDiagram = (diagram) => new Promise((resolve) => {
			const source = diagram.querySelector('.plantuml-source');
			const output = diagram.querySelector('.plantuml-output');
			if (!source || !output) {
				tracePreview('plantuml.skip', {
					hasSource: Boolean(source),
					hasOutput: Boolean(output)
				});
				resolve();
				return;
			}

			try {
				renderToString(
					(source.textContent || '').split(/\\r\\n|\\r|\\n/),
					(svg) => {
						plantUmlRendered += 1;
						output.innerHTML = svg;
						tracePreview('plantuml.rendered', {
							rendered: plantUmlRendered,
							failed: plantUmlFailed,
							svgLength: svg.length
						});
						resolve();
					},
					(message) => {
						plantUmlFailed += 1;
						tracePreview('plantuml.error', {
							rendered: plantUmlRendered,
							failed: plantUmlFailed,
							message: String(message || 'PlantUML rendering failed')
						});
						output.classList.add('plantuml-error');
						output.textContent = String(message || 'PlantUML rendering failed');
						resolve();
					},
				);
			} catch (error) {
				plantUmlFailed += 1;
				const message = String(error && error.message ? error.message : error);
				tracePreview('plantuml.error', {
					rendered: plantUmlRendered,
					failed: plantUmlFailed,
					message
				});
				output.classList.add('plantuml-error');
				output.textContent = message;
				resolve();
			}
		});

		for (const diagram of document.querySelectorAll('.plantuml-diagram')) {
			await renderPlantUmlDiagram(diagram);
		}
		tracePreview('plantuml.done', {
			nodes: document.querySelectorAll('.plantuml-diagram').length,
			rendered: plantUmlRendered,
			failed: plantUmlFailed
		});
	</script>
	<script nonce="${nonce}">
		(() => {
			const showDiagramError = (output, message) => {
				output.classList.add('diagram-error');
				output.textContent = String(message || 'Diagram rendering failed');
			};

			tracePreview('nomnoml.start', {
				nodes: document.querySelectorAll('.nomnoml-diagram').length,
				hasNomnoml: Boolean(window.nomnoml)
			});
			let rendered = 0;
			let failed = 0;
			for (const diagram of document.querySelectorAll('.nomnoml-diagram')) {
				const source = diagram.querySelector('.nomnoml-source');
				const output = diagram.querySelector('.nomnoml-output');
				if (!source || !output || !window.nomnoml) {
					continue;
				}

				try {
					output.innerHTML = window.nomnoml.renderSvg(source.textContent);
					rendered += 1;
				} catch (error) {
					failed += 1;
					showDiagramError(output, error && error.message ? error.message : error);
				}
			}
			tracePreview('nomnoml.done', { rendered, failed });
		})();
	</script>
	<script nonce="${nonce}">
		(async () => {
			tracePreview('vega.start', {
				vega: document.querySelectorAll('.vega-diagram').length,
				vegalite: document.querySelectorAll('.vegalite-diagram').length,
				hasVega: Boolean(window.vega),
				hasVegaLite: Boolean(window.vegaLite),
				hasInterpreter: Boolean(window.vegaInterpreter)
			});
			let rendered = 0;
			let failed = 0;
			const renderVega = async (diagram, diagramType) => {
				const source = diagram.querySelector('.' + diagramType + '-source');
				const output = diagram.querySelector('.' + diagramType + '-output');
				if (!source || !output || !window.vega || !window.vegaInterpreter) {
					return;
				}

				try {
					const spec = JSON.parse(source.textContent);
					const vegaSpec = diagramType === 'vegalite'
						? window.vegaLite.compile(spec).spec
						: spec;
					const runtime = window.vega.parse(vegaSpec, null, { ast: true });
					const view = new window.vega.View(runtime, {
						expr: window.vegaInterpreter.expressionInterpreter,
						renderer: 'svg'
					})
						.initialize(output)
						.hover();

					await view.runAsync();
					rendered += 1;
				} catch (error) {
					failed += 1;
					output.classList.add('diagram-error');
					output.textContent = String(error && error.message ? error.message : error);
				}
			};

			for (const diagramType of ['vega', 'vegalite']) {
				for (const diagram of document.querySelectorAll('.' + diagramType + '-diagram')) {
					await renderVega(diagram, diagramType);
				}
			}
			tracePreview('vega.done', { rendered, failed });
		})();
	</script>
	<script nonce="${nonce}">
		(() => {
			tracePreview('wavedrom.start', {
				nodes: document.querySelectorAll('.wavedrom-diagram').length,
				hasWaveDrom: Boolean(window.WaveDrom),
				hasJson5: Boolean(window.JSON5)
			});
			let rendered = 0;
			let failed = 0;
			for (const [index, diagram] of [...document.querySelectorAll('.wavedrom-diagram')].entries()) {
				const source = diagram.querySelector('.wavedrom-source');
				const output = diagram.querySelector('.wavedrom-output');
				if (!source || !output || !window.WaveDrom || !window.JSON5) {
					continue;
				}

				try {
					const spec = window.JSON5.parse(source.textContent);
					const displayPrefix = 'WaveDrom_Display_';
					output.id = displayPrefix + index;
					window.WaveDrom.RenderWaveForm(index, spec, displayPrefix, false);
					rendered += 1;
				} catch (error) {
					failed += 1;
					output.classList.add('diagram-error');
					output.textContent = String(error && error.message ? error.message : error);
				}
			}
			tracePreview('wavedrom.done', { rendered, failed });
		})();
	</script>
	<script nonce="${nonce}">
		(() => {
			tracePreview('bytefield.start', {
				nodes: document.querySelectorAll('.bytefield-diagram').length,
				hasBitfield: Boolean(window.bitfield),
				hasJson5: Boolean(window.JSON5)
			});
			const svgNamespace = 'http' + '://www.w3.org/2000/svg';
			const isAttributes = (value) => value && typeof value === 'object' && !Array.isArray(value);
			const createSvgNode = (jsonMl) => {
				if (typeof jsonMl === 'string' || typeof jsonMl === 'number' || typeof jsonMl === 'boolean') {
					return document.createTextNode(String(jsonMl));
				}

				const [tagName, maybeAttributes, ...rest] = jsonMl;
				const attributes = isAttributes(maybeAttributes) ? maybeAttributes : {};
				const children = isAttributes(maybeAttributes) ? rest : [maybeAttributes, ...rest];
				const element = document.createElementNS(svgNamespace, tagName);

				for (const [name, value] of Object.entries(attributes)) {
					if (value !== undefined && value !== null) {
						element.setAttribute(name, String(value));
					}
				}

				for (const child of children) {
					if (child !== undefined && child !== null) {
						element.appendChild(createSvgNode(child));
					}
				}

				return element;
			};

			let rendered = 0;
			let failed = 0;
			for (const diagram of document.querySelectorAll('.bytefield-diagram')) {
				const source = diagram.querySelector('.bytefield-source');
				const output = diagram.querySelector('.bytefield-output');
				if (!source || !output || !window.bitfield || !window.JSON5) {
					continue;
				}

				try {
					const spec = window.JSON5.parse(source.textContent);
					const fields = Array.isArray(spec) ? spec : spec.reg || spec.fields;
					const options = Array.isArray(spec) ? {} : spec.options || {};
					if (!Array.isArray(fields)) {
						throw new Error('Bytefield source must be an array, or an object with a reg or fields array.');
					}

					output.replaceChildren(createSvgNode(window.bitfield.render(fields, options)));
					rendered += 1;
				} catch (error) {
					failed += 1;
					output.classList.add('diagram-error');
					output.textContent = String(error && error.message ? error.message : error);
				}
			}
			tracePreview('bytefield.done', { rendered, failed });
		})();
	</script>
</body>
</html>`;
	}

	private cancelPendingUpdate() {
		if (this.pendingUpdate === undefined) {
			return;
		}

		clearTimeout(this.pendingUpdate);
		this.pendingUpdate = undefined;
	}

}

function convertAsciiDoc(document: vscode.TextDocument, webview: vscode.Webview): string {
	try {
		const processor = getAsciiDoctor();
		const extensionRegistry = createAsciiDocExtensions();
		const converted = processor.convert(document.getText(), {
			safe: 'safe',
			backend: 'html5',
			standalone: false,
			base_dir: getBaseDir(document),
			attributes: {
				showtitle: true,
				sectanchors: true,
				icons: 'font',
				stem: 'latexmath',
				'allow-uri-read': false,
			},
			extension_registry: extensionRegistry,
		});

		return rewriteSourceDiagramBlocks(rewriteLocalImageUris(String(converted), document, webview));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		trace('preview conversion failed', {
			message,
			stack: error instanceof Error ? error.stack : undefined,
		});

		return `<h1>Preview failed</h1><pre><code>${escapeHtml(message)}</code></pre>`;
	}
}

function getBaseDir(document: vscode.TextDocument): string | undefined {
	if (document.uri.scheme !== 'file') {
		return undefined;
	}

	return path.dirname(document.uri.fsPath);
}

function getLocalResourceRoots(extensionUri: vscode.Uri, document: vscode.TextDocument): vscode.Uri[] {
	if (document.uri.scheme === 'file') {
		return [extensionUri, vscode.Uri.file(path.dirname(document.uri.fsPath))];
	}

	return [extensionUri, ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [])];
}

function rewriteLocalImageUris(html: string, document: vscode.TextDocument, webview: vscode.Webview): string {
	if (document.uri.scheme !== 'file') {
		return html;
	}

	const baseDir = getBaseDir(document);
	if (!baseDir) {
		return html;
	}

	return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (_match: string, before: string, src: string, after: string) => {
		if (/^(?:https?:|ftp:|\/\/)/i.test(src)) {
			return `${before}${blockedImageUri()}${after}`;
		}

		if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(src)) {
			return `${before}${src}${after}`;
		}

		const parsed = splitUriSuffix(src);
		const imagePath = path.resolve(baseDir, decodeURIComponent(parsed.path));
		const webviewUri = webview.asWebviewUri(vscode.Uri.file(imagePath));

		return `${before}${webviewUri.toString()}${parsed.suffix}${after}`;
	});
}

function blockedImageUri(): string {
	return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
}

function rewriteSourceDiagramBlocks(html: string): string {
	let rewritten = html;

	for (const diagramType of diagramBlockNames) {
		const pattern = new RegExp(`<div class="listingblock">\\s*<div class="content">\\s*<pre class="highlight"><code class="language-${diagramType}" data-lang="${diagramType}">([\\s\\S]*?)<\\/code><\\/pre>\\s*<\\/div>\\s*<\\/div>`, 'gi');
		rewritten = rewritten.replace(pattern, (_match: string, source: string) => renderDiagramBlock(diagramType, unescapeHtml(source)));
	}

	return rewritten;
}

function renderDiagramBlock(diagramType: string, source: string): string {
	if (diagramType === 'mermaid') {
		return `<div class="mermaid-diagram"><pre class="mermaid">${escapeHtml(source)}</pre></div>`;
	}

	if (diagramType === 'plantuml') {
		return renderClientSideDiagramBlock(diagramType, normalizePlantUmlSource(source));
	}

	if (['nomnoml', 'vega', 'vegalite', 'wavedrom', 'bytefield'].includes(diagramType)) {
		return renderClientSideDiagramBlock(diagramType, source);
	}

	return renderDiagramError(diagramType, `Unsupported diagram type: ${diagramType}`);
}

function renderClientSideDiagramBlock(diagramType: string, source: string): string {
	return `<div class="${escapeHtml(diagramType)}-diagram diagram-frame"><pre class="${escapeHtml(diagramType)}-source diagram-source">${escapeHtml(source)}</pre><div class="${escapeHtml(diagramType)}-output"></div></div>`;
}

function renderDiagramError(diagramType: string, message: string): string {
	return `<div class="${escapeHtml(diagramType)}-diagram ${escapeHtml(diagramType)}-error diagram-error">${escapeHtml(message)}</div>`;
}

function renderEmoji(target: string, sizeAttr: string | undefined): string {
	const unicode = emojiMap[target];
	if (!unicode) {
		return `<span class="emoji emoji-missing">[emoji ${escapeHtml(target)} not found]</span>`;
	}

	const label = escapeHtml(target);
	const size = resolveEmojiSize(sizeAttr);
	const emoji = escapeHtml(unicodeCodepointsToText(unicode));

	return `<span class="emoji" role="img" aria-label="${label}" title="${label}" style="font-size: ${size};">${emoji}</span>`;
}

function resolveEmojiSize(sizeAttr: string | undefined): string {
	const defaultSize = '24px';
	const sizeMap: Record<string, string> = {
		'1x': '17px',
		lg: defaultSize,
		'2x': '34px',
		'3x': '50px',
		'4x': '68px',
		'5x': '85px',
	};
	const trimmed = sizeAttr?.trim();

	if (!trimmed) {
		return defaultSize;
	}

	if (/^\d{1,3}px$/.test(trimmed)) {
		return trimmed;
	}

	return sizeMap[trimmed] ?? defaultSize;
}

function unicodeCodepointsToText(value: string): string {
	return value
		.split('-')
		.map((codepoint) => String.fromCodePoint(Number.parseInt(codepoint, 16)))
		.join('');
}

function normalizePlantUmlSource(source: string): string {
	const trimmed = source.trim();
	if (/^@start\w*/i.test(trimmed)) {
		return source;
	}

	return `@startuml\n${source}\n@enduml`;
}

function readLocalDiagramSource(diagramType: string, baseDir: string, target: string): { ok: true; value: string } | { ok: false; value: string } {
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
		return { ok: false, value: `Remote ${diagramType} macro targets are disabled: ${target}` };
	}

	if (path.isAbsolute(target)) {
		return { ok: false, value: `Absolute ${diagramType} macro targets are disabled: ${target}` };
	}

	const resolvedBaseDir = path.resolve(baseDir);
	const resolvedTarget = path.resolve(resolvedBaseDir, target);
	const relativeTarget = path.relative(resolvedBaseDir, resolvedTarget);

	if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
		return { ok: false, value: `${diagramType} macro target is outside the document directory: ${target}` };
	}

	try {
		return { ok: true, value: fs.readFileSync(resolvedTarget, 'utf8') };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { ok: false, value: `Unable to read ${diagramType} macro target ${target}: ${message}` };
	}
}

function splitUriSuffix(value: string): { path: string; suffix: string } {
	const suffixIndex = value.search(/[?#]/);
	if (suffixIndex === -1) {
		return { path: value, suffix: '' };
	}

	return {
		path: value.slice(0, suffixIndex),
		suffix: value.slice(suffixIndex),
	};
}

async function wrapSelection(editor: vscode.TextEditor, prefix: string, suffix: string, placeholder: string) {
	await editor.edit((editBuilder) => {
		for (const selection of editor.selections) {
			const text = editor.document.getText(selection) || placeholder;
			editBuilder.replace(selection, `${prefix}${text}${suffix}`);
		}
	});
}

async function prefixSelectionLines(editor: vscode.TextEditor, prefix: string) {
	await editor.edit((editBuilder) => {
		for (const selection of editor.selections) {
			const startLine = selection.start.line;
			const endLine = selection.end.character === 0 && selection.end.line > startLine
				? selection.end.line - 1
				: selection.end.line;

			for (let line = startLine; line <= endLine; line += 1) {
				editBuilder.insert(new vscode.Position(line, 0), prefix);
			}
		}
	});
}

function getDocumentTitle(document: vscode.TextDocument): string {
	return document.isUntitled ? 'Untitled AsciiDoc' : vscode.workspace.asRelativePath(document.uri, false);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeJavaScriptString(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

function unescapeHtml(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function getNonce() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let value = '';

	for (let index = 0; index < 32; index += 1) {
		value += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return value;
}
