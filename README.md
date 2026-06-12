# AsciiDoc All in One

AsciiDoc editing and preview support for Visual Studio Code, powered by Asciidoctor.js.

## Features

- Live AsciiDoc preview rendered locally with Asciidoctor.js.
- Preview updates from the unsaved editor buffer.
- Local Mermaid diagram rendering for Kroki-compatible `[mermaid]` blocks.
- Basic editing commands for bold, italic, monospace, links, section headings, and unordered lists.
- Snippets for document headers, source blocks, admonitions, and tables.

## Privacy Boundary

This extension is intended to preview and edit local documentation without sending document contents to the internet.

The preview path is designed to avoid external network access:

- Asciidoctor.js runs inside the extension host.
- `allow-uri-read` is explicitly disabled.
- The Webview CSP uses `default-src 'none'`.
- Remote image URLs are replaced with an empty local data image before rendering.
- Webview scripts are limited to extension-local resources and nonce-protected inline bootstrap code.
- Mermaid is loaded from the bundled `media/mermaid.min.js` file, not a CDN or Kroki server.

## Mermaid

Use a Kroki-compatible Mermaid block:

```asciidoc
[mermaid]
----
graph TD
  A[AsciiDoc] --> B[Local Mermaid]
  B --> C[VS Code Webview]
----
```

Both listing (`----`) and literal (`....`) block delimiters are supported.

You can also reference a local Mermaid source file:

```asciidoc
mermaid::diagrams/system.mmd[]
```

Macro targets must be relative local paths inside the document directory. Remote URLs, absolute paths, and paths outside the document directory are rejected in the preview.

`[source,mermaid]` blocks are also rendered for compatibility with the first implementation.

Run the no-network verification phase before publishing or accepting AI-generated changes:

```sh
npm run verify:no-network
```

This check scans extension-controlled code for browser network APIs, Node network modules, process execution APIs, remote URL literals, remote-loading Webview CSP rules, unsafe Asciidoctor mode, and unapproved runtime dependencies. It also runs automatically before `npm test`.

## Development

```sh
npm install
npm run compile
npm run lint
npm run verify:no-network
npm test
```
