'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

for (const locale of ['en-US', 'ru-RU', 'ru']) {
test(`debug lifecycle and localization (${locale})`, async () => {
  const callbacks = {}, messages = [], commands = [], subscriptions = [];
  const disposable = { dispose() {} };
  const vscode = {
    env: { language: locale },
    l10n: { t: text => locale.startsWith('ru') ? require('../l10n/bundle.l10n.ru.json')[text] : text },
    Uri: { joinPath: (_, ...parts) => parts.join('/') },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'sampleInterval' ? 500 : fallback }) },
    commands: { registerCommand: (_, fn) => { callbacks.command = fn; return disposable; }, executeCommand: async name => { commands.push(name); } },
    window: {
      registerWebviewViewProvider: (_, provider) => { callbacks.provider = provider; return disposable; },
      showInputBox: async () => '456', showInformationMessage() {}, showErrorMessage() {},
      showQuickPick: async choices => choices[0]
    },
    debug: {
      registerDebugAdapterTrackerFactory: (_, factory) => { callbacks.factory = factory; return disposable; },
      onDidStartDebugSession: fn => { callbacks.start = fn; return disposable; },
      onDidTerminateDebugSession: fn => { callbacks.end = fn; return disposable; }
    }
  };
  const sampler = require('../out/sampler');
  const originalRead = sampler.Sampler.prototype.read;
  let clock = 0;
  sampler.Sampler.prototype.read = async () => ({ cpuMs: clock += 100, time: clock * 10, memory: 10485760, identity: 'original' });
  const originalLoad = Module._load;
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args); };
  try {
    delete require.cache[require.resolve('../out/extension')];
    delete require.cache[require.resolve('../out/webviewHtml')];
    require('../out/extension').activate({ subscriptions, extensionUri: '.' });
    const view = { webview: { cspSource: 'local:', asWebviewUri: path => path, postMessage: message => { messages.push(message); }, onDidReceiveMessage: fn => { callbacks.message = fn; return disposable; } }, onDidDispose: () => disposable };
    callbacks.provider.resolveWebviewView(view);
    assert.match(view.webview.html, /Content-Security-Policy/);
    assert.ok(view.webview.html.includes(`lang="${locale.startsWith('ru') ? 'ru-RU' : 'en-US'}"`));
    assert.match(view.webview.html, /out\/webview\/view\.js/);
    const session = { id: 'one', name: '<script>session</script>', type: 'cppdbg', configuration: {} };
    const tracker = callbacks.factory.createDebugAdapterTracker(session);
    callbacks.start(session);
    tracker.onDidSendMessage({ type: 'event', event: 'process', body: { systemProcessId: 123 } });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(messages.at(-1).state.pid, 123);
    assert.equal(messages.at(-1).state.samples[0].memory, 10);
    assert.equal(messages.at(-1).strings.selectProcess, locale.startsWith('ru') ? 'Выбрать PID процесса' : 'Select process PID');
    assert.equal(messages.at(-1).state.status, locale.startsWith('ru') ? 'Сбор метрик' : 'Monitoring');
    assert.ok(commands.includes('debugResourceMetrics.focus'));
    callbacks.end(session);
    const frozenRuntime = messages.at(-1).state.runtime;
    const frozenSamples = messages.at(-1).state.samples.length;
    tracker.onDidSendMessage({ type: 'event', event: 'process', body: { systemProcessId: 999 } });
    assert.equal(messages.at(-1).state.pid, 123);
    const second = { id: 'two', name: 'Second', type: 'debugpy', configuration: {}, customRequest: async command => command === 'stackTrace' ? { stackFrames: [{ id: 1 }] } : { result: '789' } };
    callbacks.factory.createDebugAdapterTracker(second);
    callbacks.start(second);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.at(-1).state.pid, 789);
    callbacks.message({ type: 'session', id: 'one' });
    assert.equal(messages.at(-1).state.runtime, frozenRuntime);
    assert.equal(messages.at(-1).state.samples.length, frozenSamples);
    callbacks.message({ type: 'session', id: 'two' });
    await callbacks.command();
    assert.equal(messages.at(-1).state.pid, 456);
    assert.equal(messages.at(-1).state.samples.length, 0);
  } finally {
    for (const subscription of subscriptions) subscription.dispose();
    Module._load = originalLoad;
    sampler.Sampler.prototype.read = originalRead;
  }
});
}
