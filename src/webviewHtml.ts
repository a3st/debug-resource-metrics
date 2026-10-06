import { randomBytes } from 'node:crypto';
import { Uri, type Webview } from 'vscode';

/** Labels are sent separately and inserted as text by the webview. */
export function webviewHtml(webview: Webview, extensionUri: Uri, language: string): string {
  const nonce = randomBytes(16).toString('hex');
  const style = webview.asWebviewUri(Uri.joinPath(extensionUri, 'media', 'view.css'));
  const script = webview.asWebviewUri(Uri.joinPath(extensionUri, 'out', 'webview', 'view.js'));
  const locale = language.toLowerCase().startsWith('ru') ? 'ru-RU' : 'en-US';

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'">
  <link rel="stylesheet" href="${style}">
</head>
<body>
  <select id="sessions"></select>
  <p id="status" role="status"></p>
  <div class="cards">
    <div><span id="cpuLabel"></span><strong id="cpu">—</strong></div>
    <div><span id="memoryLabel"></span><strong id="memory">—</strong></div>
    <div><span id="runtimeLabel"></span><strong id="runtime">—</strong></div>
  </div>
  <p id="cpuCaption" class="caption"></p>
  <canvas id="cpuChart" role="img"></canvas>
  <p id="memoryCaption" class="caption"></p>
  <canvas id="memoryChart" role="img"></canvas>
  <p id="range" class="caption"></p>
  <button id="select"></button>
  <p id="hint" class="hint"></p>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
