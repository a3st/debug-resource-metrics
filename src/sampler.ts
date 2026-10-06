import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

export interface ProcessCounters {
  cpuMs: number;
  memory: number;
  identity: string;
}

export interface Reading extends ProcessCounters {
  time: number;
}
const exec = promisify(execFile);

export function validPid(value: unknown): number | undefined {
  const pid = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0 && pid <= 2147483647 ? pid : undefined;
}
export function parseLinuxStat(stat: string, hz: number, pageSize: number): ProcessCounters {
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  return { cpuMs: (Number(fields[11]) + Number(fields[12])) * 1000 / hz,
    memory: Number(fields[21]) * pageSize, identity: fields[19] };
}
export function parseCpuTime(time: string): number {
  const [days, clock] = time.includes('-') ? time.split('-') : ['0', time];
  const parts = clock.split(':').map(Number);
  return (Number(days) * 86400 + parts.reduce((sum, part) => sum * 60 + part, 0)) * 1000;
}
export function cpuPercent(previous: Reading | undefined, current: Reading, normalize = false, cores = os.cpus().length): number | null {
  if (!previous || previous.identity !== current.identity || current.time <= previous.time) return null;
  return Math.max(0, (current.cpuMs - previous.cpuMs) / (current.time - previous.time) * 100 / (normalize ? cores : 1));
}
export class Sampler {
  private linuxUnits?: Promise<number[]>;

  async read(pid: number): Promise<Reading> {
    if (!validPid(pid)) throw new Error('Invalid PID');
    let value: ProcessCounters;
    if (process.platform === 'win32') {
      const script = `$ErrorActionPreference='Stop'; $p=Get-Process -Id ${pid}; @{cpuMs=$p.TotalProcessorTime.TotalMilliseconds;memory=$p.WorkingSet64;identity=$p.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress`;
      const { stdout } = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 });
      value = JSON.parse(stdout.trim());
    } else if (process.platform === 'linux') {
      if (!this.linuxUnits) this.linuxUnits = Promise.all(['CLK_TCK', 'PAGESIZE'].map(async key => Number((await exec('getconf', [key], { timeout: 5000 })).stdout.trim())));
      const [hz, pageSize] = await this.linuxUnits;
      value = parseLinuxStat(await fs.readFile(`/proc/${pid}/stat`, 'utf8'), hz, pageSize);
    } else if (process.platform === 'darwin') {
      const { stdout } = await exec('ps', ['-p', String(pid), '-o', 'time=', '-o', 'rss=', '-o', 'lstart='], { timeout: 5000 });
      const match = stdout.trim().match(/^(\S+)\s+(\d+)\s+(.+)$/);
      if (!match) throw new Error('Process unavailable');
      value = { cpuMs: parseCpuTime(match[1]), memory: Number(match[2]) * 1024, identity: match[3] };
    } else throw new Error(`Unsupported platform: ${process.platform}`);
    if (!Number.isFinite(value.cpuMs) || !Number.isFinite(value.memory)) throw new Error('Metrics unavailable');
    return { ...value, time: performance.now() };
  }
}
