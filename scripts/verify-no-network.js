#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanTargets = [
	'src',
	'scripts',
	'snippets',
	'language-configuration.json',
	'package.json',
];

const allowedRuntimeDependencies = new Set([
	'asciidoctor',
]);

const blockedPatterns = [
	{
		name: 'browser network API',
		pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
	},
	{
		name: 'Node network module import',
		pattern: /\b(?:import|from|require)\b[^;\n]*(?:node:)?(?:http|https|http2|net|tls|dgram|dns)\b/,
	},
	{
		name: 'process execution API',
		pattern: /\b(?:child_process|spawn|execFile|exec|fork)\b/,
	},
	{
		name: 'remote URL literal in extension-controlled code',
		pattern: /(?:https?:|ftp:|wss?:)\/\//,
	},
	{
		name: 'webview CSP allows remote network access',
		pattern: /(?:connect-src|img-src|media-src|font-src|script-src|style-src)[^;"']*(?:https?:|wss?:|\*)/,
	},
	{
		name: 'Asciidoctor remote URI reads enabled',
		pattern: /['"]allow-uri-read['"]\s*:\s*(?:true|['"]true['"])/,
	},
	{
		name: 'unsafe Asciidoctor mode',
		pattern: /\bsafe\s*:\s*['"]unsafe['"]/,
	},
];

const expectedText = [
	{
		file: 'src/extension.ts',
		text: "'allow-uri-read': false",
		message: 'Asciidoctor conversion must explicitly disable allow-uri-read.',
	},
	{
		file: 'src/extension.ts',
		text: "safe: 'safe'",
		message: 'Asciidoctor conversion must run in safe mode or stricter.',
	},
	{
		file: 'src/extension.ts',
		text: "default-src 'none'",
		message: 'Webview CSP must deny all loads by default.',
	},
];

const failures = [];

for (const file of listFiles(scanTargets)) {
	const rel = path.relative(root, file);
	const text = fs.readFileSync(file, 'utf8');
	const lines = text.split(/\r?\n/);

	for (const [index, line] of lines.entries()) {
		for (const blocked of blockedPatterns) {
			if (blocked.pattern.test(line)) {
				failures.push(`${rel}:${index + 1}: ${blocked.name}: ${line.trim()}`);
			}
		}
	}
}

for (const expected of expectedText) {
	const file = path.join(root, expected.file);
	const text = fs.readFileSync(file, 'utf8');
	if (!text.includes(expected.text)) {
		failures.push(`${expected.file}: ${expected.message}`);
	}
}

verifyRuntimeDependencies();

if (failures.length > 0) {
	console.error('No-network verification failed:');
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exitCode = 1;
} else {
	console.log('No-network verification passed.');
}

function listFiles(targets) {
	const files = [];

	for (const target of targets) {
		const absolute = path.join(root, target);
		if (!fs.existsSync(absolute)) {
			continue;
		}

		const stat = fs.statSync(absolute);
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(absolute)) {
				if (entry === 'node_modules' || entry === 'out' || entry === '.vscode-test') {
					continue;
				}

				files.push(...listFiles([path.join(target, entry)]));
			}
		} else if (/\.(?:js|ts|json|mjs|cjs)$/i.test(absolute)) {
			if (path.relative(root, absolute) !== 'scripts/verify-no-network.js') {
				files.push(absolute);
			}
		}
	}

	return files;
}

function verifyRuntimeDependencies() {
	const manifestPath = path.join(root, 'package.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const dependencies = Object.keys(manifest.dependencies ?? {});

	for (const dependency of dependencies) {
		if (!allowedRuntimeDependencies.has(dependency)) {
			failures.push(`package.json: runtime dependency "${dependency}" is not in the no-network allowlist.`);
		}
	}
}
