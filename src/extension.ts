import * as vscode from 'vscode';
import { webviewHtml } from './webviewHtml';
import { Sampler, validPid, cpuPercent, type Reading } from './sampler';
import type { MetricsMessage, Sample, ViewMessage, ViewStrings } from './protocol';

interface SessionState {
  session: vscode.DebugSession;
  started: number;
  ended?: number;
  samples: Sample[];
  status: string;
  pid?: number;
  previous?: Reading;
  identity?: string;
  discovering?: boolean;
}

export function activate(context: vscode.ExtensionContext): void {
  const states = new Map<string, SessionState>();
  const sampler = new Sampler();
  let view: vscode.WebviewView | undefined;
  let selected: string | undefined;
  let disposed = false;
  const settings = () => vscode.workspace.getConfiguration('debugResourceMetrics');
  const strings: ViewStrings = {
    session: vscode.l10n.t("Debug session"),
    idle: vscode.l10n.t("Start debugging to see process metrics."),
    cpu: vscode.l10n.t("CPU"),
    memory: vscode.l10n.t("Memory (RSS)"),
    runtime: vscode.l10n.t("Runtime"),
    cpuCaption: vscode.l10n.t("CPU · % of one core"),
    cpuChart: vscode.l10n.t("CPU usage over runtime"),
    memoryCaption: vscode.l10n.t("Memory · MiB"),
    memoryChart: vscode.l10n.t("Resident memory over runtime"),
    selectProcess: vscode.l10n.t("Select process PID"),
    hint: vscode.l10n.t("100% CPU = one fully used core. Runtime includes debugger pauses."),
    waiting: vscode.l10n.t("Waiting for samples"),
    ended: vscode.l10n.t("ended"),
    range: vscode.l10n.t("Runtime axis · last {0} seconds"),
    emptyChart: vscode.l10n.t("Charts will appear when the process PID is available."),
    seconds: vscode.l10n.t("s"),
    memoryUnit: vscode.l10n.t("MiB"),
  };
  function update(): void {
    const state = selected ? states.get(selected) : undefined;
    const message: MetricsMessage = { type: 'metrics', strings, sessions: [...states.values()].map(s => ({ id: s.session.id, name: s.session.name, ended: !!s.ended })), selected,
      state: state && { pid: state.pid, status: state.status, ended: !!state.ended, runtime: ((state.ended || Date.now()) - state.started) / 1000, samples: state.samples } };
    void view?.webview.postMessage(message);
  }
  function ensure(session: vscode.DebugSession): SessionState {
    let state = states.get(session.id);
    if (!state) {
      // Keep active sessions plus the five most recent completed sessions.
      const ended = [...states.values()].filter(s => s.ended);
      while (ended.length >= 5) states.delete(ended.shift()!.session.id);
      state = { session, started: Date.now(), samples: [], status: vscode.l10n.t("Waiting for process PID…") };
      states.set(session.id, state);
      selected = session.id;
    }
    return state;
  }
  function setPid(state: SessionState, value: unknown): void {
    const pid = validPid(value);
    if (!pid || state.ended || disposed || !states.has(state.session.id)) return;
    if (state.pid !== pid) { state.previous = undefined; state.samples = []; state.identity = undefined; }
    state.pid = pid;
    state.status = vscode.l10n.t("Monitoring");
    update();
  }
  async function discover(state: SessionState, threadId?: number): Promise<void> {
    if (state.pid || state.discovering || state.ended) return;
    const type = state.session.type;
    const expression = /^(pwa-)?(node|chrome|msedge)/.test(type) && !/chrome|msedge/.test(type) ? 'process.pid'
      : /python|debugpy/.test(type) ? '__import__("os").getpid()' : undefined;
    if (!expression) return;
    state.discovering = true;
    try {
      let frameId: number | undefined;
      if (threadId !== undefined) {
        const trace: { stackFrames?: { id: number }[] } = await state.session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 1 });
        frameId = trace.stackFrames?.[0]?.id;
      }
      const result: { result?: string } = await state.session.customRequest('evaluate', { expression, context: 'watch', ...(frameId !== undefined ? { frameId } : {}) });
      if (!state.pid) setPid(state, result.result?.trim());
    } catch { /* DAP process event or manual selection remains available. */ }
    finally { state.discovering = false; }
  }
  async function selectProcess(): Promise<void> {
    const active = [...states.values()].filter(s => !s.ended);
    let state = selected ? states.get(selected) : undefined;
    if (!state || state.ended) state = active[0];
    if (!state) { vscode.window.showInformationMessage(vscode.l10n.t("Start a debug session first.")); return; }
    if (active.length > 1) {
      const choice = await vscode.window.showQuickPick(active.map(s => ({ label: s.session.name, description: s.session.type, state: s })), { placeHolder: vscode.l10n.t("Select debug session") });
      if (!choice) return;
      state = choice.state;
    }
    const value = await vscode.window.showInputBox({ prompt: vscode.l10n.t("PID of the debugged process (on the extension host machine)"), value: state.pid ? String(state.pid) : '', validateInput: input => validPid(input) ? undefined : vscode.l10n.t("Enter a positive process ID") });
    if (!value) return;
    try { await sampler.read(validPid(value)!); selected = state.session.id; setPid(state, value); }
    catch { vscode.window.showErrorMessage(vscode.l10n.t("Cannot read this process. Check the PID and process access permissions.")); }
  }
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('debugResourceMetrics', {
      resolveWebviewView(newView) {
        view = newView;
        newView.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media'), vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')] };
        newView.webview.html = webviewHtml(newView.webview, context.extensionUri, vscode.env.language);
        context.subscriptions.push(newView.webview.onDidReceiveMessage((message: ViewMessage) => {
          if (message?.type === 'ready') update();
          if (message?.type === 'select') void selectProcess();
          if (message?.type === 'session' && states.has(message.id)) { selected = message.id; update(); }
        }), newView.onDidDispose(() => { if (view === newView) view = undefined; }));
      }
    }),
    vscode.commands.registerCommand('debugResourceMetrics.selectProcess', selectProcess),
    vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker(session) {
        const state = ensure(session);
        return { onDidSendMessage(message) {
          if (message.type === 'event' && message.event === 'process') setPid(state, message.body?.systemProcessId);
          if (message.type === 'event' && message.event === 'stopped') void discover(state, message.body?.threadId);
          // runInTerminal returns a shell PID, which is not necessarily the debuggee.
        } };
      }
    }),
    vscode.debug.onDidStartDebugSession(session => {
      const state = ensure(session);
      selected = session.id;
      setPid(state, session.configuration.processId);
      void discover(state);
      update();
      if (settings().get('autoReveal', true)) void vscode.commands.executeCommand('debugResourceMetrics.focus').then(undefined, () => {});
    }),
    vscode.debug.onDidTerminateDebugSession(session => {
      const state = states.get(session.id);
      if (state) { state.ended = Date.now(); state.status = vscode.l10n.t("Debug session ended"); }
      update();
    })
  );
  async function tick(): Promise<void> {
    if (disposed) return;
    await Promise.all([...states.values()].filter(s => !s.ended && s.pid).map(async state => {
      const pid = state.pid;
      if (pid === undefined) return;
      try {
        const reading = await sampler.read(pid);
        if (disposed || state.ended || state.pid !== pid) return;
        if (state.identity && state.identity !== reading.identity) {
          state.pid = undefined; state.previous = undefined; state.status = vscode.l10n.t("Process ID was reused. Select the debuggee PID."); return;
        }
        state.identity = reading.identity;
        const cpu = cpuPercent(state.previous, reading);
        state.previous = reading;
        state.samples.push({ time: (Date.now() - state.started) / 1000, cpu, memory: reading.memory / 1048576 });
        const limit = Math.max(30, Math.min(3600, settings().get('historySize', 180)));
        if (state.samples.length > limit) state.samples.splice(0, state.samples.length - limit);
        state.status = vscode.l10n.t("Monitoring");
      } catch {
        if (!state.ended && state.pid === pid) { state.previous = undefined; state.status = vscode.l10n.t("Process exited or metrics unavailable. Select PID to retry."); state.pid = undefined; }
      }
    }));
    update();
    if (!disposed) timer = setTimeout(tick, Math.max(500, Math.min(10000, settings().get('sampleInterval', 1000))));
  }
  let timer = setTimeout(tick, 0);
  context.subscriptions.push({ dispose() { disposed = true; clearTimeout(timer); } });
  for (const session of vscode.debug.activeDebugSession ? [vscode.debug.activeDebugSession] : []) {
    const state = ensure(session); setPid(state, session.configuration.processId); void discover(state);
  }
}
