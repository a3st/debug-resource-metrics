'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sampler, validPid, cpuPercent, parseLinuxStat, parseCpuTime } = require('../out/sampler');

test('PID validation rejects command injection and invalid identifiers', () => {
  for (const value of ['1; exit', '${pid}', '-1', '', 0, -1, NaN, 1.5, 2147483648, undefined]) assert.equal(validPid(value), undefined);
  assert.equal(validPid('1234'), 1234);
});
test('CPU uses interval deltas, supports multiple cores and ignores reused PIDs', () => {
  const previous = { identity: 'a', time: 1000, cpuMs: 200 };
  const current = { identity: 'a', time: 2000, cpuMs: 1700 };
  assert.equal(cpuPercent(previous, current), 150);
  assert.equal(cpuPercent(previous, current, true, 4), 37.5);
  assert.equal(cpuPercent(undefined, current), null);
  assert.equal(cpuPercent(previous, { ...current, identity: 'b' }), null);
  assert.equal(cpuPercent(previous, { ...current, time: 1000 }), null);
});
test('Linux stat handles spaces and parentheses in process names', () => {
  const fields = Array(22).fill('0'); fields[0] = 'S'; fields[11] = '150'; fields[12] = '50'; fields[19] = '888'; fields[21] = '1024';
  assert.deepEqual(parseLinuxStat(`42 (worker (test)) ${fields.join(' ')}`, 100, 4096), { cpuMs: 2000, memory: 4194304, identity: '888' });
});
test('macOS cumulative CPU time accepts minute, hour and day formats', () => {
  assert.equal(parseCpuTime('02:03.50'), 123500);
  assert.equal(parseCpuTime('01:02:03'), 3723000);
  assert.equal(parseCpuTime('2-01:02:03'), 176523000);
});
test('native sampler reads a running process and rejects a missing one', async () => {
  const sampler = new Sampler();
  const first = await sampler.read(process.pid);
  const second = await sampler.read(process.pid);
  assert.ok(first.memory > 0);
  assert.ok(second.cpuMs >= first.cpuMs);
  assert.equal(first.identity, second.identity);
  assert.ok(second.time > first.time);
  await assert.rejects(sampler.read(2147483647));
});
