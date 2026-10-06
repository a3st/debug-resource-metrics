/** Messages shared by the extension host and the browser webview. */
export interface Sample {
  time: number;
  cpu: number | null;
  memory: number;
}

export interface ViewStrings {
  session: string;
  idle: string;
  cpu: string;
  memory: string;
  runtime: string;
  cpuCaption: string;
  cpuChart: string;
  memoryCaption: string;
  memoryChart: string;
  selectProcess: string;
  hint: string;
  waiting: string;
  ended: string;
  range: string;
  emptyChart: string;
  seconds: string;
  memoryUnit: string;
}

export interface MetricsMessage {
  type: 'metrics';
  strings: ViewStrings;
  sessions: { id: string; name: string; ended: boolean }[];
  selected?: string;
  state?: {
    pid?: number;
    status: string;
    ended: boolean;
    runtime: number;
    samples: Sample[];
  };
}

export type ViewMessage =
  | { type: 'ready' }
  | { type: 'select' }
  | { type: 'session'; id: string };
