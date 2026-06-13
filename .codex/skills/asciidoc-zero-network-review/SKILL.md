---
name: asciidoc-zero-network-review
description: Review pull requests and code changes for the AsciiDoc Zero-Network Preview VS Code extension. Use when checking security, privacy, zero-network guarantees, VS Code Webview/CSP design, Asciidoctor conversion safety, remote image allowlisting, local file boundaries, bundled renderer behavior, release readiness, or README-aligned design regressions in the asciidoc-local-preview/asciidoc-all-in-one repository.
---

# AsciiDoc Zero-Network Review

Use this skill to review changes against the extension's core product promise: render AsciiDoc previews locally without sending document contents to CDNs, Kroki servers, remote hosts, subprocesses, or other external services unless a remote image host is explicitly allowlisted.

## Review Workflow

1. Read the diff first, then inspect nearby code in `src/extension.ts`, `scripts/verify-no-network.js`, `package.json`, and any touched tests or media-loading code.
2. Lead with concrete findings. For each issue, name the violated boundary, the reachable scenario, and the file/line reference.
3. Treat security and privacy regressions as highest severity even when the change looks like a convenience or compatibility improvement.
4. Ask whether README claims, tests, and the no-network audit still agree. Flag mismatches as review findings, not documentation nits, when they can mislead users about safety.
5. Recommend focused tests or audit updates whenever behavior changes. Do not accept security-sensitive code based only on intent.

## Design Invariants

- Preview conversion must use Asciidoctor.js in the extension host with `safe: 'safe'` and `'allow-uri-read': false`.
- Document contents and unsaved editor buffers must not be sent to external services, including CDNs, Kroki, telemetry endpoints, image probes, or diagram render APIs.
- Diagram rendering must use bundled local assets for MathJax, Mermaid, PlantUML, Nomnoml, Vega, Vega-Lite, WaveDrom, and Bytefield.
- PlantUML support must not introduce Java, Graphviz, Kroki, `child_process`, `spawn`, `exec`, or shell execution.
- Remote images must be blocked by default and replaced before rendering unless their exact host and allowed scheme are configured through `asciidoc-local-preview.allowedPreviewHosts`.
- Webview `localResourceRoots` must stay limited to the extension directory, workspace folders, and the current document directory.
- The Webview CSP must start from `default-src 'none'`. Do not add broad `connect-src`, wildcard, `http:`, `https:`, or `wss:` sources.
- Runtime code must not introduce browser network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`) or Node network modules (`http`, `https`, `net`, `tls`, `dns`, `dgram`, `http2`) outside deliberately audited tooling.
- Vendored renderer libraries may contain network-capable code only if Webview guards block the relevant globals before those libraries run.
- The extension should coexist with `asciidoctor/asciidoctor-vscode` and should not claim ownership of AsciiDoc language grammar, snippets, file icons, or broad export workflows.

## High-Risk Change Areas

Review these areas especially closely:

- HTML rewriting, URI normalization, image handling, and `src`/`href` sanitation.
- Webview HTML generation, nonces, CSP sources, script order, and resource URI construction.
- `allowedPreviewHosts` parsing, including schemes, credentials, paths, wildcards, protocol-relative URLs, punycode/IDN, casing, ports, and malformed URLs.
- Diagram block processors and local file macros such as `mermaid::path[]` and `plantuml::path[]`; targets must remain relative paths inside the document directory.
- Dependency additions or upgrades, especially renderer packages that can fetch remote resources or lazy-load assets.
- Bundling, minified media, test fixtures, and audit allowlists, where remote URL strings can be easy to normalize away by accident.
- Any change to `scripts/verify-no-network.js`, `npm test`, or `pretest`; these guardrails are part of the product contract.

## Security Review Prompts

Use these questions while reading the diff:

- Can malicious AsciiDoc cause network access, file disclosure outside the intended roots, script execution without a nonce, or subprocess execution?
- Can an allowlisted host entry become broader than the user intended, for example through wildcards, path stripping, protocol-relative URLs, credentials, redirects, or defaulting to both `http` and `https` unexpectedly?
- Does any renderer, extension, or helper resolve document-controlled paths before checking containment?
- Does the Webview guard code run before all bundled libraries and user-derived preview content?
- Are new dependencies necessary for local preview, and are their runtime behaviors compatible with no-network use?
- Are remote URLs in docs, package metadata, lockfiles, or tests being confused with runtime network behavior? Keep the distinction explicit.

## Verification

For most review tasks, expect at least:

```sh
npm run compile
npm run lint
npm run verify:no-network
npm test
```

If a change affects only documentation, explain why runtime verification is unnecessary. If any command is skipped, state the residual risk.

When a PR intentionally relaxes a boundary, require explicit user-facing documentation, narrow tests, and an update to the no-network audit. Do not let broad exceptions hide inside allowlists or comments.

## Review Output

Use normal code-review format:

- Findings first, ordered by severity, with file/line references.
- Open questions or assumptions next.
- Brief summary last.

When there are no findings, say so directly and mention any remaining test gap or unverified command.
