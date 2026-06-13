# AsciiDoc Zero-Network Preview

[![Version](https://vsmarketplacebadges.dev/version-short/YoshihideShirai.asciidoc-local-preview.png)](https://marketplace.visualstudio.com/items?itemName=YoshihideShirai.asciidoc-local-preview)
[![Installs](https://vsmarketplacebadges.dev/installs-short/YoshihideShirai.asciidoc-local-preview.png)](https://marketplace.visualstudio.com/items?itemName=YoshihideShirai.asciidoc-local-preview)
[![Ratings](https://vsmarketplacebadges.dev/rating-short/YoshihideShirai.asciidoc-local-preview.png)](https://marketplace.visualstudio.com/items?itemName=YoshihideShirai.asciidoc-local-preview)

[English](README.md) | 日本語

Visual Studio Code で AsciiDoc をローカルプレビューするための拡張機能です。編集中の `.adoc` / `.ad` / `.asciidoc` / `.asc` ファイルを VS Code 内の Webview に表示し、MathJax、Mermaid、PlantUML、Kroki 互換の図表も外部サービスなしで確認できます。

次のような環境に向いています:

- 企業内のドキュメント環境
- インターネット接続を制限したネットワーク
- セキュリティ要件の高い文書作成
- 外部サービスの利用を禁止している組織

![AsciiDoc Zero-Network Preview demo](media/preview.gif)

## Highlights

- 編集中の未保存バッファをそのままプレビューに反映します。
- Asciidoctor.js による AsciiDoc プレビューを VS Code 内で実行します。
- MathJax による `stem` / `latexmath` の数式表示に対応しています。
- 図、表、式のキャプションを章番号付きで採番します。
- `emoji:name[]` 形式の絵文字インラインマクロをローカルの Unicode 文字として表示します。
- Mermaid、PlantUML、Nomnoml、Vega、Vega-Lite、WaveDrom、Bytefield の図表をローカルアセットで描画します。
- 太字、斜体、等幅、リンク、見出し、箇条書きなど、よく使う AsciiDoc 編集コマンドを追加します。
- AsciiDoc の言語サポート、文法、スニペット、ファイルアイコンは `asciidoctor/asciidoctor-vscode` に任せることで共存しやすくしています。
- CDN、Kroki サーバー、外部画像読み込みに依存しないプレビュー経路を重視しています。


## 差別化ポイント

AsciiDoc Zero-Network Preview は、`asciidoctor/asciidoctor-vscode` よりも「ローカルで安全にプレビューすること」に絞った拡張です。

| 観点 | AsciiDoc Zero-Network Preview | `asciidoctor/asciidoctor-vscode` |
| --- | --- | --- |
| 目的 | ローカルプレビュー特化 | AsciiDoc 総合支援 |
| 図表 | 主要図表を同梱アセットで描画 | Kroki 連携で幅広く対応 |
| 外部送信 | 既定で送らない設計 | Kroki 利用時は送信あり |
| PlantUML | Java / Graphviz 不要 | Kroki 連携で描画 |
| 数式・絵文字 | MathJax / emoji を同梱対応 | 拡張で追加可能 |
| 出力 | なし | PDF / HTML / DocBook |
| 向く用途 | 機密文書・オフライン確認 | 変換や出力まで行う制作環境 |

AsciiDoc Zero-Network Preview は独自の `asciidoc` 言語定義や TextMate grammar を登録しません。シンタックスハイライト、スニペット、ファイル関連付け、PDF 出力などの制作支援が必要な場合は、`asciidoctor/asciidoctor-vscode` と併用してください。

## 組み込み Asciidoctor.js 拡張

プレビューでは、各ドキュメントの変換前に次の Asciidoctor.js 拡張を登録します。

| 拡張 | 構文 / 対象 | 役割 |
| --- | --- | --- |
| 図表ブロックプロセッサ | `[mermaid]`、`[plantuml]`、`[nomnoml]`、`[vega]`、`[vegalite]`、`[wavedrom]`、`[bytefield]` | 図表ブロックをローカル Webview の描画対象へ変換します。 |
| 図表ブロックマクロプロセッサ | `mermaid::path[]`、`plantuml::path[]` などの図表マクロ | ドキュメントディレクトリからの相対パスでローカル図表ソースを読み込みます。 |
| 図表リテラル用プリプロセッサ | `[mermaid] ....` などのリテラル図表ブロック | リテラル図表ブロックも同じローカル描画パイプラインで扱えるように正規化します。 |
| 絵文字インラインマクロプロセッサ | `emoji:name[]` | `asciidoctor-emoji` 互換のインラインマクロをローカル Unicode 絵文字として表示します。 |
| 番号付きキャプションツリープロセッサ | image、table、stem ブロック | `asciidoctor-numbered-captions` による章番号付きキャプション採番を適用します。 |

## Getting Started

1. VS Code で AsciiDoc ファイルを開きます。
2. コマンドパレットから **AsciiDoc: Open Zero-Network Preview** を実行します。
3. エディタータイトルまたはコンテキストメニューからもプレビューを開けます。

プレビューは編集中の内容に追従します。必要な場合は **AsciiDoc: Refresh Preview** で Webview を再描画できます。

## Supported Diagrams

Kroki 互換のブロック記法で、次の図表をローカルに描画できます。

```asciidoc
[mermaid]
----
graph TD
  A[AsciiDoc] --> B[Local Preview]
----

[plantuml]
....
Alice -> Bob : Hello
....

[nomnoml]
----
[User] -> [VS Code]
----
```

対応している図表:

- Mermaid
- PlantUML
- Nomnoml
- Vega
- Vega-Lite
- WaveDrom
- Bytefield

`mermaid::diagrams/system.mmd[]` や `plantuml::diagrams/sequence.puml[]` のようなローカルファイルマクロも利用できます。マクロの参照先は、ドキュメントと同じディレクトリ配下の相対パスに制限されます。

## Math and Emoji

AsciiDoc の `stem` ブロックや `latexmath` インライン記法を MathJax で表示します。

```asciidoc
latexmath:[E = mc^2]

[stem]
++++
\frac{1}{2}
++++
```

絵文字は `asciidoctor-emoji` 互換のインラインマクロで書けます。

```asciidoc
I emoji:heart[1x] Asciidoctor.js emoji:tada[2x]
```

`1x`、`lg`、`2x`、`3x`、`4x`、`5x`、`42px` のようなサイズ指定に対応しています。絵文字は CDN から SVG を読み込まず、ローカルで Unicode 文字として表示します。

## Numbered Captions

図、表、式のキャプションは `asciidoctor-numbered-captions` により、`Figure 1-1`、`Table 2-3`、`Equation 4-2` のように章番号を含めて採番されます。

文書ごとに Asciidoctor 標準のキャプション採番へ戻したい場合は、ヘッダー属性を追加してください。

```asciidoc
:numbered-captions-numbering: standard
```

## Local Preview Boundary

AsciiDoc Zero-Network Preview は、ドキュメント内容を外部サービスへ送らずにプレビューすることを目指しています。

- Asciidoctor.js は拡張ホスト内で実行されます。
- `allow-uri-read` は明示的に無効化されています。
- Webview CSP は `default-src 'none'` を使用します。
- リモート画像 URL はプレビュー前に空のローカル data image に置き換えられます。
- CSS、MathJax、Mermaid、PlantUML、Nomnoml、Vega、Vega-Lite、WaveDrom、Bytefield は同梱された `media` 配下のファイルから読み込まれます。
- PlantUML の描画に Java、Graphviz、Kroki サーバーは不要です。

公開前や生成コードを取り込む前には、ネットワーク利用を検査するスクリプトを実行できます。

```sh
npm run verify:no-network
```

このチェックは `npm test` の前にも自動実行されます。

## Commands

- **AsciiDoc: Open Zero-Network Preview**
- **AsciiDoc: Refresh Preview**
- **AsciiDoc: Bold**
- **AsciiDoc: Italic**
- **AsciiDoc: Monospace**
- **AsciiDoc: Insert Link**
- **AsciiDoc: Insert Section Heading**
- **AsciiDoc: Insert Unordered List**

## Development

```sh
npm install
npm run compile
npm run lint
npm run verify:no-network
npm test
```

## Bundled Licenses

The bundled preview stylesheet is adapted from the Antora Default UI project and keeps its MPL-2.0 license notice in `media/antora-default-preview.css`.

Bundled MathJax assets keep Apache-2.0 license copies in `media/mathjax/LICENSE` and `media/mathjax-newcm/LICENSE`.

The emoji name map is generated from `asciidoctor-emoji` and keeps its MIT license copy in `licenses/asciidoctor-emoji-LICENSE`.

The AsciiDoc file and extension icons are adapted from the `vscode-icons` project and keep its MIT license copy in `licenses/vscode-icons-LICENSE`.
