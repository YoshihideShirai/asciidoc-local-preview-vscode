# AsciiDoc Local Preview

AsciiDoc Local Preview is a Visual Studio Code extension for previewing AsciiDoc files locally.

It is built for documentation projects that should stay on your machine. The extension renders the active editor buffer in a VS Code Webview, supports common AsciiDoc authoring commands, and keeps math, emoji, and diagram rendering inside VS Code instead of calling external services.

## What This Extension Does

- Adds AsciiDoc language support for `.adoc`, `.asciidoc`, and `.asc` files in VS Code.
- Opens a local preview beside the active AsciiDoc editor.
- Provides editor commands and snippets for common AsciiDoc authoring tasks.
- Bundles its renderer assets so previewing does not depend on CDN or Kroki server access.

## Features

- Live AsciiDoc preview inside VS Code, rendered locally with Asciidoctor.js.
- Preview updates from the unsaved VS Code editor buffer.
- Preview styling adapted from the Antora Default UI and loaded from bundled extension assets.
- Local MathJax rendering for AsciiDoc stem and `latexmath` expressions.
- Local emoji inline macro rendering for `emoji:name[]` syntax.
- Local Mermaid diagram rendering for Kroki-compatible `[mermaid]` blocks.
- Local PlantUML diagram rendering for Kroki-compatible `[plantuml]` blocks.
- Local JavaScript-based Kroki-compatible rendering for `[nomnoml]`, `[vega]`, `[vegalite]`, `[wavedrom]`, and `[bytefield]` blocks.
- Local file macros for supported diagram types, restricted to paths inside the document directory.
- Basic editing commands for bold, italic, monospace, links, section headings, and unordered lists.
- Snippets for document headers, source blocks, admonitions, and tables.

## Usage

Install and enable the extension in Visual Studio Code. Open an `.adoc`, `.asciidoc`, or `.asc` file, then run **AsciiDoc: Open Local AsciiDoc Preview** from the Command Palette or the editor title menu.

The preview follows changes in the unsaved editor buffer. If a Webview needs to be redrawn manually, run **AsciiDoc: Refresh Preview**.

## Privacy Boundary

AsciiDoc Local Preview is intended to preview and edit local documentation without sending document contents to the internet.

The preview path is designed to avoid external network access:

- Asciidoctor.js runs inside the extension host.
- `allow-uri-read` is explicitly disabled.
- The Webview CSP uses `default-src 'none'`.
- Remote image URLs are replaced with an empty local data image before rendering.
- Preview CSS is loaded from the bundled `media/antora-default-preview.css` file, not from the Antora site, GitLab, or a CDN.
- Webview scripts are limited to extension-local resources and nonce-protected inline bootstrap code.
- Emoji macros render as local Unicode text, not remote Twemoji SVG images.
- MathJax is loaded from the bundled `media/mathjax/tex-chtml.js` file with bundled local fonts, not a CDN.
- Mermaid is loaded from the bundled `media/mermaid.min.js` file, not a CDN or Kroki server.
- PlantUML is loaded from the bundled `media/plantuml.js` and `media/viz-global.js` files, not a CDN, Java process, Graphviz binary, or Kroki server.
- Nomnoml, Vega, Vega-Lite, WaveDrom, and Bytefield are loaded from bundled `media` files, not a CDN or Kroki server.

Run the no-network verification phase before publishing or accepting generated changes:

```sh
npm run verify:no-network
```

This check scans extension-controlled code for browser network APIs, Node network modules, process execution APIs, remote URL literals, remote-loading Webview CSP rules, unsafe Asciidoctor mode, and unapproved runtime dependencies. It also runs automatically before `npm test`.

## MathJax

Use AsciiDoc stem or `latexmath` syntax:

```asciidoc
latexmath:[E = mc^2]

[stem]
++++
\frac{1}{2}
++++
```

The preview renders these locally with MathJax. The preview enables `stem=latexmath` during conversion, so a document-level `:stem:` attribute is optional for preview rendering.

## Emoji

Use the `asciidoctor-emoji` compatible inline macro syntax:

```asciidoc
I emoji:heart[1x] Asciidoctor.js emoji:tada[2x]
```

Supported sizes are `1x`, `lg`, `2x`, `3x`, `4x`, `5x`, and explicit pixel sizes such as `42px`. The preview uses the emoji name map from `asciidoctor-emoji`, but renders Unicode emoji locally instead of loading Twemoji SVG files from a CDN.

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

`[source,mermaid]` blocks are also rendered for compatibility with earlier documents.

## PlantUML

Use a Kroki-compatible PlantUML block:

```asciidoc
[plantuml]
....
Alice -> Bob : Hello
....
```

`@startuml` / `@enduml` wrappers are added automatically when omitted. You can also reference a local PlantUML source file:

```asciidoc
plantuml::diagrams/sequence.puml[]
```

Macro targets must be relative local paths inside the document directory. Remote URLs, absolute paths, and paths outside the document directory are rejected in the preview.

## JavaScript Kroki Diagrams

The preview also supports local JavaScript renderers for Kroki-compatible Nomnoml, Vega, Vega-Lite, WaveDrom, and Bytefield blocks:

```asciidoc
[nomnoml]
----
[User] -> [AsciiDoc Preview]
----

[vegalite]
----
{
  "data": {"values": [{"x": "A", "y": 5}, {"x": "B", "y": 3}]},
  "mark": "bar",
  "encoding": {
    "x": {"field": "x", "type": "nominal"},
    "y": {"field": "y", "type": "quantitative"}
  }
}
----

[wavedrom]
----
{signal: [{name: 'clk', wave: 'p.....'}, {name: 'data', wave: 'x.34.x'}]}
----

[bytefield]
----
[
  {"name": "data", "bits": 8, "attr": "RO"},
  {"bits": 4},
  {"name": "flags", "bits": 4, "attr": "RW"}
]
----
```

Both listing (`----`) and literal (`....`) block delimiters are supported. Local file macros such as `nomnoml::diagrams/model.nomnoml[]`, `vega::charts/spec.json[]`, `vegalite::charts/spec.vl.json[]`, `wavedrom::waves/timing.json5[]`, and `bytefield::registers/status.json[]` are also supported with the same local-path restrictions as Mermaid and PlantUML. `[source,nomnoml]`, `[source,vega]`, `[source,vegalite]`, `[source,wavedrom]`, and `[source,bytefield]` blocks are rendered as diagrams for compatibility.

## Bundled Licenses

The bundled preview stylesheet is adapted from the Antora Default UI project and keeps its MPL-2.0 license notice in `media/antora-default-preview.css`.

Bundled MathJax assets keep Apache-2.0 license copies in `media/mathjax/LICENSE` and `media/mathjax-newcm/LICENSE`.

The emoji name map is generated from `asciidoctor-emoji` and keeps its MIT license copy in `licenses/asciidoctor-emoji-LICENSE`.

## Development

```sh
npm install
npm run compile
npm run lint
npm run verify:no-network
npm test
```
