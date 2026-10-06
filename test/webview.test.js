'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

test('compiled browser script renders localized text and sends typed actions without Node globals', () => {
  const elements = new Map(), events = {}, sent = [];
  const context = new Proxy({}, { get: () => () => {} });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', attributes: {}, children: [], clientWidth: 280, clientHeight: 115,
      setAttribute(key, value) { this.attributes[key] = value; },
      replaceChildren() { this.children = []; },
      append(child) { this.children.push(child); },
      addEventListener(type, fn) { events[`${id}:${type}`] = fn; },
      getContext: () => context
    });
    return elements.get(id);
  }
  runInNewContext(readFileSync(resolve(__dirname, '../out/webview/view.js'), 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage: message => sent.push(message) }),
    document: { getElementById: element, createElement: () => ({}), body: {} },
    window: { devicePixelRatio: 1, addEventListener: (type, fn) => { events[type] = fn; } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} }
  });
  assert.equal(sent[0].type, 'ready');
  const strings = {
    session: 'Сессия отладки', idle: 'Запустите отладку', cpu: 'CPU', memory: 'Память (RSS)', runtime: 'Время работы',
    cpuCaption: 'CPU · % одного ядра', cpuChart: 'График CPU', memoryCaption: 'Память · МиБ', memoryChart: 'График памяти',
    selectProcess: 'Выбрать PID процесса', hint: 'Подсказка', waiting: 'Ожидание измерений', ended: 'завершена',
    range: 'Время работы · последние {0} с', emptyChart: 'Ожидание PID', seconds: 'с', memoryUnit: 'МиБ'
  };
  events.message({ data: { type: 'metrics', strings, sessions: [] } });
  assert.equal(element('status').textContent, strings.idle);
  assert.equal(element('memoryLabel').textContent, strings.memory);
  assert.equal(element('select').textContent, strings.selectProcess);
  assert.equal(element('cpuChart').attributes['aria-label'], strings.cpuChart);
  events.message({ data: {
    type: 'metrics', strings, selected: 'one', sessions: [{ id: 'one', name: '<script>session</script>', ended: true }],
    state: { pid: 123, status: 'Завершена', runtime: 61, ended: true, samples: [{ time: 1, cpu: null, memory: 10 }, { time: 4, cpu: 150, memory: 12.5 }] }
  } });
  assert.equal(element('cpu').textContent, '150.0%');
  assert.equal(element('memory').textContent, '12.5 МиБ');
  assert.equal(element('runtime').textContent, '00:01:01');
  assert.equal(element('range').textContent, 'Время работы · последние 3 с');
  assert.equal(element('sessions').children[0].textContent, '<script>session</script> (завершена)');
  events['select:click']();
  assert.equal(sent.at(-1).type, 'select');
  events['sessions:change']({ target: { value: 'one' } });
  assert.equal(sent.at(-1).id, 'one');
});
