import asciidoctorFactory from 'asciidoctor';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const asciidoctor = asciidoctorFactory();
const asciidoctorExtensions = asciidoctor.Extensions.create();
const previewPanels = new Map<string, AsciiDocPreviewPanel>();
let diagramProcessorsRegistered = false;

export function activate(context: vscode.ExtensionContext) {
	registerDiagramProcessors();

	context.subscriptions.push(
		vscode.commands.registerCommand('asciidoc-all-in-one.openPreview', () => openPreview(context.extensionUri)),
		vscode.commands.registerCommand('asciidoc-all-in-one.refreshPreview', () => refreshVisiblePreviews()),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.toggleBold', (editor) => wrapSelection(editor, '*', '*', 'strong text')),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.toggleItalic', (editor) => wrapSelection(editor, '_', '_', 'emphasized text')),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.toggleMonospace', (editor) => wrapSelection(editor, '`', '`', 'monospace text')),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.insertLink', (editor) => wrapSelection(editor, 'link:./path/to/document.adoc[', ']', 'link text')),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.insertHeading', (editor) => prefixSelectionLines(editor, '== ')),
		vscode.commands.registerTextEditorCommand('asciidoc-all-in-one.insertUnorderedList', (editor) => prefixSelectionLines(editor, '* ')),
		vscode.workspace.onDidChangeTextDocument((event) => {
			const panel = previewPanels.get(event.document.uri.toString());
			panel?.update(event.document);
		}),
	);
}

function registerDiagramProcessors() {
	if (diagramProcessorsRegistered) {
		return;
	}

	diagramProcessorsRegistered = true;

	asciidoctorExtensions.preprocessor(function () {
		this.process(function (_document, reader) {
			return reader.pushInclude(rewriteMermaidLiteralBlockStyles(reader.readLines()));
		});
	});

	asciidoctorExtensions.block('mermaid', function () {
		this.onContext('listing');
		this.process(function (parent, reader) {
			const source = reader.getLines().join('\n');

			return this.createBlock(parent, 'pass', renderMermaidBlock(source));
		});
	});

	asciidoctorExtensions.block('mermaidliteral', function () {
		this.onContext('literal');
		this.process(function (parent, reader) {
			const source = reader.getLines().join('\n');

			return this.createBlock(parent, 'pass', renderMermaidBlock(source));
		});
	});

	asciidoctorExtensions.blockMacro('mermaid', function () {
		this.process(function (parent, target) {
			const source = readLocalDiagramSource(parent.getDocument().getBaseDir(), target);

			return this.createBlock(parent, 'pass', source.ok
				? renderMermaidBlock(source.value)
				: renderDiagramError(source.value));
		});
	});
}

function rewriteMermaidLiteralBlockStyles(lines: string[]): string[] {
	const rewritten = [...lines];

	for (let index = 0; index < rewritten.length - 1; index += 1) {
		if (/^\[mermaid(?=[,\]])/.test(rewritten[index].trim()) && rewritten[index + 1].trim() === '....') {
			rewritten[index] = rewritten[index].replace('[mermaid', '[mermaidliteral');
		}
	}

	return rewritten;
}

export function deactivate() {
	for (const panel of previewPanels.values()) {
		panel.dispose();
	}
	previewPanels.clear();
}

function openPreview(extensionUri: vscode.Uri) {
	const document = getActiveAsciiDocDocument();
	if (!document) {
		vscode.window.showWarningMessage('Open an AsciiDoc file before starting the preview.');
		return;
	}

	const key = document.uri.toString();
	const existing = previewPanels.get(key);
	if (existing) {
		existing.reveal();
		existing.update(document);
		return;
	}

	const panel = new AsciiDocPreviewPanel(extensionUri, document);
	previewPanels.set(key, panel);
}

function refreshVisiblePreviews() {
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

class AsciiDocPreviewPanel {
	private readonly panel: vscode.WebviewPanel;
	private readonly documentUri: vscode.Uri;
	private readonly disposables: vscode.Disposable[] = [];
	private document: vscode.TextDocument;
	private disposed = false;

	constructor(private readonly extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this.document = document;
		this.documentUri = document.uri;
		this.panel = vscode.window.createWebviewPanel(
			'asciidocAllInOnePreview',
			`Preview: ${getDocumentTitle(document)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: getLocalResourceRoots(this.extensionUri, document),
			},
		);

		this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
		this.update(document);
	}

	reveal() {
		this.panel.reveal(vscode.ViewColumn.Beside);
	}

	update(document: vscode.TextDocument) {
		if (document.uri.toString() !== this.documentUri.toString()) {
			return;
		}

		this.document = document;
		this.panel.title = `Preview: ${getDocumentTitle(document)}`;
		this.panel.webview.html = this.render(document);
	}

	refresh() {
		this.update(this.document);
	}

	dispose() {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		previewPanels.delete(this.documentUri.toString());
		this.panel.dispose();

		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	private render(document: vscode.TextDocument): string {
		const body = convertAsciiDoc(document, this.panel.webview);
		const nonce = getNonce();
		const cspSource = this.panel.webview.cspSource;
		const mermaidScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js'));

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(getDocumentTitle(document))}</title>
	<style>
		:root {
			color-scheme: light dark;
			--body-bg: var(--vscode-editor-background);
			--body-fg: var(--vscode-editor-foreground);
			--muted-fg: var(--vscode-descriptionForeground);
			--border: var(--vscode-panel-border);
			--accent: var(--vscode-textLink-foreground);
			--code-bg: var(--vscode-textCodeBlock-background);
		}

		body {
			margin: 0;
			background: var(--body-bg);
			color: var(--body-fg);
			font: 14px/1.65 var(--vscode-font-family);
		}

		main {
			box-sizing: border-box;
			width: min(960px, 100%);
			margin: 0 auto;
			padding: 28px 32px 56px;
		}

		h1, h2, h3, h4, h5, h6 {
			line-height: 1.25;
			margin: 1.55em 0 0.55em;
		}

		h1:first-child, h2:first-child {
			margin-top: 0;
		}

		a {
			color: var(--accent);
		}

		p, ul, ol, dl, table, pre, blockquote {
			margin: 0 0 1rem;
		}

		pre, code {
			font-family: var(--vscode-editor-font-family);
		}

		pre {
			overflow: auto;
			padding: 14px 16px;
			border: 1px solid var(--border);
			border-radius: 6px;
			background: var(--code-bg);
		}

		code {
			background: var(--code-bg);
			border-radius: 3px;
			padding: 0.1em 0.25em;
		}

		pre code {
			padding: 0;
			background: transparent;
		}

		.mermaid-diagram {
			overflow: auto;
			margin: 0 0 1rem;
			padding: 16px;
			border: 1px solid var(--border);
			border-radius: 6px;
			background: var(--vscode-editor-background);
		}

		.mermaid-diagram svg {
			display: block;
			max-width: 100%;
			height: auto;
			margin: 0 auto;
		}

		.mermaid-error {
			white-space: pre-wrap;
			color: var(--vscode-errorForeground);
		}

		blockquote {
			border-left: 3px solid var(--border);
			color: var(--muted-fg);
			padding-left: 1rem;
		}

		table {
			border-collapse: collapse;
			width: 100%;
		}

		th, td {
			border: 1px solid var(--border);
			padding: 6px 10px;
			vertical-align: top;
		}

		img {
			max-width: 100%;
			height: auto;
		}

		.admonitionblock td.icon {
			width: 1%;
			white-space: nowrap;
			color: var(--accent);
			font-weight: 600;
		}
	</style>
</head>
<body>
	<main class="asciidoc-preview">
		${body}
	</main>
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
	<script nonce="${nonce}">
		(async () => {
			const api = window.mermaid;
			if (!api) {
				return;
			}

			api.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: document.body.classList.contains('vscode-dark') ? 'dark' : 'default'
			});

			await api.run({
				querySelector: '.mermaid'
			});
		})().catch((error) => {
			for (const diagram of document.querySelectorAll('.mermaid')) {
				diagram.classList.add('mermaid-error');
				diagram.textContent = String(error && error.message ? error.message : error);
			}
		});
	</script>
</body>
</html>`;
	}
}

function convertAsciiDoc(document: vscode.TextDocument, webview: vscode.Webview): string {
	try {
		const converted = asciidoctor.convert(document.getText(), {
			safe: 'safe',
			backend: 'html5',
			standalone: false,
			base_dir: getBaseDir(document),
			attributes: {
				showtitle: true,
				sectanchors: true,
				icons: 'font',
				'allow-uri-read': false,
			},
			extension_registry: asciidoctorExtensions,
		});

		return rewriteMermaidBlocks(rewriteLocalImageUris(String(converted), document, webview));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

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

function rewriteMermaidBlocks(html: string): string {
	return html.replace(
		/<div class="listingblock">\s*<div class="content">\s*<pre class="highlight"><code class="language-mermaid" data-lang="mermaid">([\s\S]*?)<\/code><\/pre>\s*<\/div>\s*<\/div>/gi,
		(_match: string, source: string) => `<div class="mermaid-diagram"><pre class="mermaid">${source}</pre></div>`,
	);
}

function renderMermaidBlock(source: string): string {
	return `<div class="mermaid-diagram"><pre class="mermaid">${escapeHtml(source)}</pre></div>`;
}

function renderDiagramError(message: string): string {
	return `<div class="mermaid-diagram mermaid-error">${escapeHtml(message)}</div>`;
}

function readLocalDiagramSource(baseDir: string, target: string): { ok: true; value: string } | { ok: false; value: string } {
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
		return { ok: false, value: `Remote Mermaid macro targets are disabled: ${target}` };
	}

	if (path.isAbsolute(target)) {
		return { ok: false, value: `Absolute Mermaid macro targets are disabled: ${target}` };
	}

	const resolvedBaseDir = path.resolve(baseDir);
	const resolvedTarget = path.resolve(resolvedBaseDir, target);
	const relativeTarget = path.relative(resolvedBaseDir, resolvedTarget);

	if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
		return { ok: false, value: `Mermaid macro target is outside the document directory: ${target}` };
	}

	try {
		return { ok: true, value: fs.readFileSync(resolvedTarget, 'utf8') };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { ok: false, value: `Unable to read Mermaid macro target ${target}: ${message}` };
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

function getNonce() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let value = '';

	for (let index = 0; index < 32; index += 1) {
		value += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return value;
}
