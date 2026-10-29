import { MarkLyraEditor } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import { defaultQuery, type GraphSnapshot, type IndexStatus } from '../model.js';
import { darkPalette, GraphRenderer, graphResources, lightPalette } from '../renderer.js';
import { GraphRenderer3D } from '../renderer3d.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const status = document.querySelector('#status') as HTMLElement;
const container = document.querySelector('#graph') as HTMLElement;
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ??
  0;
let diagnostics: Record<string, unknown> = {};
interface Memory {
  hostCpuMs: number;
  webCpuMs: number;
  webRssKiB: number;
}
const measureIdle = async () => {
  let before = await invoke<Memory>('fixture_memory');
  const first = before,
    start = performance.now(),
    windows = [];
  for (let i = 0; i < 3; i++) {
    const tick = performance.now();
    await sleep(3000);
    const after = await invoke<Memory>('fixture_memory'),
      elapsedMs = performance.now() - tick;
    windows.push({
      elapsedMs,
      hostPercent: ((after.hostCpuMs - before.hostCpuMs) / elapsedMs) * 100,
      webPercent: ((after.webCpuMs - before.webCpuMs) / elapsedMs) * 100,
    });
    before = after;
  }
  const elapsedMs = performance.now() - start;
  return {
    elapsedMs,
    hostPercent: ((before.hostCpuMs - first.hostCpuMs) / elapsedMs) * 100,
    webPercent: ((before.webCpuMs - first.webCpuMs) / elapsedMs) * 100,
    windows,
  };
};
try {
  status.textContent = '核对真实编辑器的基线与字节一致性…';
  const editorHost = document.createElement('div');
  editorHost.style.cssText = 'position:absolute;inset:0;z-index:0';
  document.body.append(editorHost);
  container.hidden = true;
  container.style.zIndex = '1';
  const source =
    '\ufeff# Native coexistence\r\n\r\n' +
    Array.from(
      { length: 420 },
      (_, i) =>
        `Alpha ${i} — 中文与 emoji 😀，保留原始换行与空白。 **Bold** and literal source.  ${'plain text '.repeat(9)}${i % 2 ? '\r\n\r\n' : '\n\n'}`,
    ).join('');
  const editorErrors: string[] = [];
  const editor = new MarkLyraEditor(editorHost, {
    runtimeUrl:
      location.protocol === 'http:'
        ? 'http://marklyra.localhost/index.html'
        : 'marklyra://localhost/index.html',
    markdown: source,
    configuration: {
      sourceBOM: 'text',
      platform: 'macos',
      locale: 'zh-Hans',
      theme: 'marklyra-light',
    },
    onError: (error) => editorErrors.push(error.message),
  });
  await editor.ready;
  assert((await editor.flush()) === source, 'native editor load must preserve exact BOM/newlines');
  const measureEditor = async () => {
    const commandMs: number[] = [],
      visualMs: number[] = [];
    await editor.focus();
    for (let i = 0; i < 12; i++) {
      await editor.execute({ type: 'sourcePosition', line: 3, column: 1 });
      const start = performance.now();
      await editor.execute({ type: 'insertText', text: 'x' });
      assert(
        (await editor.flush()) === source.replace('Alpha 0', 'xAlpha 0'),
        'native insertion changed untouched source',
      );
      const command = performance.now() - start;
      await frame();
      await frame();
      if (i >= 2) {
        commandMs.push(command);
        visualMs.push(performance.now() - start);
      }
      await editor.execute({ type: 'undo' });
      assert((await editor.flush()) === source, 'native undo must restore exact source');
      await editor.execute({ type: 'redo' });
      assert(
        (await editor.flush()) === source.replace('Alpha 0', 'xAlpha 0'),
        'native redo must preserve source',
      );
      await editor.execute({ type: 'undo' });
      assert((await editor.flush()) === source, 'native second undo must restore source');
    }
    return {
      commandMs,
      visualMs,
      commandMedian: percentile(commandMs, 0.5),
      visualMedian: percentile(visualMs, 0.5),
    };
  };
  const editorBefore = await measureEditor(),
    editorFrame = editor.element;
  status.textContent = '在首次索引 10,000 篇文档期间复验编辑器…';
  const preparation = invoke<{ workspaceId: string; requestId: string }>('fixture_prepare');
  const indexWait = performance.now();
  let duringStatus: IndexStatus | null = null;
  while (performance.now() - indexWait < 10_000) {
    duringStatus = await invoke<IndexStatus | null>('fixture_index_status');
    if (duringStatus?.working) break;
    await sleep(30);
  }
  assert(duringStatus?.working, 'cold index must be running during editor measurements');
  const editorDuring = await measureEditor();
  const duringEnd = await invoke<IndexStatus | null>('fixture_index_status');
  const session = await preparation,
    revision = editor.revision;
  editorHost.setAttribute('inert', '');
  container.hidden = false;
  const baseline = await invoke('fixture_memory');
  const emptyFrames: number[] = [];
  let emptyPrevious = await frame();
  for (let i = 0; i < 120; i++) {
    const now = await frame();
    emptyFrames.push(now - emptyPrevious);
    emptyPrevious = now;
  }
  const emptyP95 = percentile(emptyFrames, 0.95);
  const idleBaseline = await measureIdle();
  const failures: string[] = [];
  const errors: string[] = [];
  const runs: unknown[] = [];
  const stages: unknown[] = [];
  const sample = async (name: string) => {
    const m = await invoke('fixture_memory');
    stages.push({ name, m });
    await invoke('fixture_log', { message: JSON.stringify({ stage: name, m }) });
  };
  let smallGraph: GraphSnapshot | null = null;
  const renderer = new GraphRenderer(container, {
    select: (id) => {
      renderer.select(id);
    },
    open: () => {},
    changed: () => {},
    error: (message) => errors.push(message),
  });
  for (const limit of [500, 5000]) {
    status.textContent = `验证 ${limit} 节点的真实绘制、拖拽和静止状态…`;
    const graph = await invoke<GraphSnapshot>('knowledge_snapshot', {
      ...session,
      query: { ...defaultQuery, limit, showMissing: false },
    });
    await sample(`${limit}:payload`);
    if (limit === 500) smallGraph = graph;
    await sample(`${limit}:canvas`);
    const started = performance.now();
    renderer.setData(graph);
    while (renderer.metrics.layoutRunning && performance.now() - started < 20_000) await sleep(40);
    assert(!renderer.metrics.layoutRunning, 'layout must settle');
    const settledMs = performance.now() - started;
    renderer.fit();
    await sample(`${limit}:layout`);
    await sleep(250);
    let previous = await frame();
    const intervals: number[] = [];
    const drawMs: number[] = [];
    const pathBuilds = renderer.metrics.pathBuilds;
    for (let i = 0; i < 180; i++) {
      const now = await frame();
      intervals.push(now - previous);
      drawMs.push(renderer.metrics.drawMs);
      previous = now;
      renderer.camera({ x: 0.5 + Math.sin(i / 20) * 0.04 });
    }
    const panPathBuilds = renderer.metrics.pathBuilds - pathBuilds;
    await sample(`${limit}:pan`);
    renderer.fit();
    await sleep(200);
    const id = graph.nodes[Math.floor(graph.nodes.length / 2)]?.id;
    assert(id, 'fixture node exists');
    if (id) {
      renderer.center(id);
      await sleep(250);
      const p = renderer.screenPosition(id),
        rect = container.getBoundingClientRect();
      const canvas = renderer.pointerTarget;
      const dispatch = (type: string, x: number, y: number, buttons: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type.replace('mouse', 'pointer'), {
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            clientX: rect.left + x,
            clientY: rect.top + y,
            button: 0,
            buttons,
            bubbles: true,
            cancelable: true,
          }),
        );
      dispatch('mousemove', p.x, p.y, 0);
      await sleep(50);
      dispatch('mousedown', p.x, p.y, 1);
      for (let i = 1; i <= 45; i++) {
        await frame();
        dispatch('mousemove', p.x + i, p.y + i / 2, 1);
      }
      dispatch('mouseup', p.x + 45, p.y + 22.5, 0);
      await sleep(900);
      const next = renderer.screenPosition(id);
      diagnostics = { ...diagnostics, drag: { id, before: p, after: next }, limit };
      assert(Math.hypot(next.x - p.x, next.y - p.y) > 10, 'native graph drag must move the node');
    }
    await sample(`${limit}:drag`);
    renderer.theme(darkPalette);
    document.body.style.background = darkPalette.background;
    await sleep(400);
    const before = renderer.metrics.renders;
    const idleCpu = await measureIdle();
    const idleRenders = renderer.metrics.renders - before;
    const memory = await invoke<{ webRssKiB: number }>('fixture_memory');
    diagnostics = {
      baseline,
      memory,
      limit,
      stages,
      emptyP95,
      frameP95: percentile(intervals, 0.95),
      idleRenders,
      runs,
    };
    if (memory.webRssKiB - (baseline as { webRssKiB: number }).webRssKiB > 200 * 1024) {
      await invoke('fixture_log', {
        message: JSON.stringify({ profileMemory: memory, baseline, limit }),
      });
      await sleep(1000);
    }
    if (memory.webRssKiB - (baseline as { webRssKiB: number }).webRssKiB > 200 * 1024)
      failures.push(`${limit}: WebContent memory exceeds 200 MiB budget`);
    if (percentile(intervals, 0.95) > Math.max(20, Math.min(22, emptyP95 + 3)))
      failures.push(`${limit}: frame P95 exceeds empty-host baseline by over 3 ms`);
    if (percentile(drawMs, 0.95) > 6) failures.push(`${limit}: draw P95 exceeds 6 ms CPU budget`);
    assert(idleRenders <= 1, 'settled graph must not continuously render');
    if (
      idleCpu.hostPercent + idleCpu.webPercent >
      idleBaseline.hostPercent + idleBaseline.webPercent + 2
    )
      failures.push(`${limit}: idle CPU exceeds baseline by over 2 percentage points of one core`);
    assert(errors.length === 0, errors.join(';'));
    runs.push({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      settledMs,
      drawP95: percentile(drawMs, 0.95),
      panPathBuilds,
      frameP50: percentile(intervals, 0.5),
      frameP95: percentile(intervals, 0.95),
      frameP99: percentile(intervals, 0.99),
      idleRenders,
      idleCpu,
      memory,
      metrics: { ...renderer.metrics },
    });
  }
  renderer.destroy();
  await sleep(300);
  assert(
    graphResources.renderers === 0 && graphResources.workers === 0,
    'renderer and worker must be released',
  );
  // The same budgets for the 3D scene, measured in the real WebView: WebGL2 availability, orbit frames,
  // dragging, a settled scene that stays idle, and release of every GPU and worker resource.
  const probe = document.createElement('canvas').getContext('webgl2');
  const webgl = {
    webgl2: !!probe,
    samples: probe ? (probe.getParameter(probe.SAMPLES) as number) : 0,
    maxPointSize: probe ? Array.from(probe.getParameter(probe.ALIASED_POINT_SIZE_RANGE)) : [],
  };
  probe?.getExtension('WEBGL_lose_context')?.loseContext();
  const runs3d: unknown[] = [];
  const cycles3d: unknown[] = [];
  if (!webgl.webgl2) failures.push('3D: WebGL2 is unavailable in this WebView');
  else {
    document.body.style.background = '#ffffff';
    const scene = new GraphRenderer3D(container, {
      select: (id) => scene.select(id),
      open: () => {},
      changed: () => {},
      error: (message) => errors.push(message),
      unavailable: (message) => errors.push(message),
    });
    for (const limit of [500, 5000]) {
      status.textContent = `验证 ${limit} 节点的三维绘制、旋转、拖拽和静止状态…`;
      const graph = await invoke<GraphSnapshot>('knowledge_snapshot', {
        ...session,
        query: { ...defaultQuery, limit, showMissing: false },
      });
      const started = performance.now();
      scene.setData(graph);
      while (scene.metrics.layoutRunning && performance.now() - started < 30_000) await sleep(40);
      assert(!scene.metrics.layoutRunning, '3D layout must settle');
      const settledMs = performance.now() - started;
      scene.fit();
      await sleep(800);
      await sample(`${limit}:3d-layout`);
      let previous = await frame();
      const intervals: number[] = [];
      const drawMs: number[] = [];
      for (let i = 0; i < 180; i++) {
        const now = await frame();
        intervals.push(now - previous);
        drawMs.push(scene.metrics.drawMs);
        previous = now;
        scene.step(0.004, 0);
      }
      await sample(`${limit}:3d-orbit`);
      const id = graph.nodes[Math.floor(graph.nodes.length / 2)]?.id;
      assert(id, 'fixture node exists');
      if (id) {
        scene.center(id);
        await sleep(700);
        const p = scene.screenPosition(id),
          rect = container.getBoundingClientRect();
        // Picking returns the nearest document on that line of sight, which may hide `id`.
        const grabbed = scene.pick(p);
        if (!grabbed) throw new Error('a document must sit under the centred pointer');
        const startedAt = scene.position(grabbed);
        const dispatch = (type: string, x: number, y: number, buttons: number) =>
          scene.pointerTarget.dispatchEvent(
            new PointerEvent(type.replace('mouse', 'pointer'), {
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: rect.left + x,
              clientY: rect.top + y,
              button: 0,
              buttons,
              bubbles: true,
              cancelable: true,
            }),
          );
        dispatch('mousemove', p.x, p.y, 0);
        await sleep(50);
        dispatch('mousedown', p.x, p.y, 1);
        for (let i = 1; i <= 45; i++) {
          await frame();
          dispatch('mousemove', p.x + i, p.y + i / 2, 1);
        }
        dispatch('mouseup', p.x + 45, p.y + 22.5, 0);
        await sleep(900);
        const next = scene.screenPosition(grabbed),
          moved = scene.position(grabbed);
        diagnostics = { ...diagnostics, drag3d: { id: grabbed, before: p, after: next }, limit };
        assert(Math.hypot(next.x - p.x, next.y - p.y) > 10, 'native 3D drag must move the node');
        assert(
          [moved.x, moved.y, moved.z ?? Number.NaN].every(Number.isFinite) &&
            Math.hypot(
              moved.x - startedAt.x,
              moved.y - startedAt.y,
              (moved.z ?? 0) - (startedAt.z ?? 0),
            ) > 1,
          'native 3D drag must change the stored coordinates',
        );
      }
      await sample(`${limit}:3d-drag`);
      scene.theme(darkPalette);
      document.body.style.background = darkPalette.background;
      await sleep(400);
      const before = scene.metrics.renders;
      const idleCpu = await measureIdle();
      const idleRenders = scene.metrics.renders - before;
      const memory = await invoke<{ webRssKiB: number }>('fixture_memory');
      if (memory.webRssKiB - (baseline as { webRssKiB: number }).webRssKiB > 200 * 1024)
        failures.push(`3D ${limit}: WebContent memory exceeds 200 MiB budget`);
      if (percentile(intervals, 0.95) > Math.max(20, Math.min(22, emptyP95 + 3)))
        failures.push(`3D ${limit}: frame P95 exceeds empty-host baseline by over 3 ms`);
      if (percentile(drawMs, 0.95) > 6)
        failures.push(`3D ${limit}: draw P95 exceeds 6 ms CPU budget`);
      if (idleRenders > 1) failures.push(`3D ${limit}: settled scene keeps rendering`);
      if (
        idleCpu.hostPercent + idleCpu.webPercent >
        idleBaseline.hostPercent + idleBaseline.webPercent + 2
      )
        failures.push(
          `3D ${limit}: idle CPU exceeds baseline by over 2 percentage points of one core`,
        );
      assert(errors.length === 0, errors.join(';'));
      runs3d.push({
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        settledMs,
        drawP95: percentile(drawMs, 0.95),
        frameP50: percentile(intervals, 0.5),
        frameP95: percentile(intervals, 0.95),
        frameP99: percentile(intervals, 0.99),
        idleRenders,
        idleCpu,
        memory,
        metrics: { ...scene.metrics },
      });
      document.body.style.background = '#ffffff';
      scene.theme(lightPalette);
    }
    scene.destroy();
    await sleep(300);
    assert(
      graphResources.renderers === 0 && graphResources.workers === 0,
      '3D scene and worker must be released',
    );
    for (let i = 0; i < 20; i++) {
      const next = new GraphRenderer3D(container, {
        select: () => {},
        open: () => {},
        changed: () => {},
        error: (message) => errors.push(message),
        unavailable: (message) => errors.push(message),
      });
      if (smallGraph) next.setData(smallGraph);
      await frame();
      await frame();
      next.destroy();
      await sleep(60);
      if (i % 5 === 4) cycles3d.push(await invoke('fixture_memory'));
    }
    assert(
      graphResources.renderers === 0 && graphResources.workers === 0,
      'repeated 3D open/close resource leak',
    );
  }
  const cycles: unknown[] = [];
  for (let i = 0; i < 20; i++) {
    const next = new GraphRenderer(container, {
      select: () => {},
      open: () => {},
      changed: () => {},
      error: (message) => errors.push(message),
    });
    if (smallGraph) next.setData(smallGraph);
    await frame();
    await frame();
    next.destroy();
    await sleep(60);
    if (i % 5 === 4) cycles.push(await invoke('fixture_memory'));
  }
  const after = await invoke('fixture_memory');
  assert(
    graphResources.renderers === 0 && graphResources.workers === 0,
    'repeated open/close resource leak',
  );
  await invoke('knowledge_active', { requestId: session.requestId, active: false });
  assert(
    editor.element === editorFrame && editorFrame.isConnected && editor.revision === revision,
    'graph must retain the native editor instance and document revision',
  );
  assert((await editor.flush()) === source, 'graph changed native Markdown');
  container.hidden = true;
  editorHost.removeAttribute('inert');
  status.textContent = '复验关闭图谱后的编辑、撤销与重做…';
  const editorAfter = await measureEditor();
  if (editorAfter.commandMedian > editorBefore.commandMedian * 1.05 + 2)
    failures.push('editor command median regressed beyond 5% plus 2ms timer tolerance');
  if (editorDuring.commandMedian > editorBefore.commandMedian * 1.05 + 2)
    failures.push(
      'editor command median during indexing regressed beyond 5% plus 2ms timer tolerance',
    );
  assert(editorErrors.length === 0, editorErrors.join(';'));
  const coexistence = {
    utf8Bytes: new TextEncoder().encode(source).length,
    utf16Units: source.length,
    before: editorBefore,
    during: editorDuring,
    indexStatusDuring: [duringStatus, duringEnd],
    after: editorAfter,
    exact: true,
    sameIframe: true,
    unchangedRevision: true,
    errors: editorErrors,
  };
  editor.destroy();
  editorHost.remove();
  await invoke('fixture_result', {
    result: {
      passed: failures.length === 0,
      coexistence,
      failures,
      emptyP95,
      idleBaseline,
      baseline,
      runs,
      webgl,
      runs3d,
      stages,
      cycles,
      cycles3d,
      after,
      resources: graphResources,
      errors,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    },
  });
} catch (error) {
  status.textContent = String(error);
  await invoke('fixture_result', {
    result: {
      ...diagnostics,
      passed: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
}
