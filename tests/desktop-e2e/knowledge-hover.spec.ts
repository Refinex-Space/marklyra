import { expect, type Page, test } from '@playwright/test';
import type { GraphRenderer } from '../../apps/desktop/src/features/knowledge-graph/renderer.js';

async function setup(page: Page, dark: boolean) {
  await page.route('**/__knowledge-hover', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="graph" style="width:1000px;height:700px"></div>',
    }),
  );
  await page.goto('/__knowledge-hover');
  await page.evaluate(async (dark) => {
    const route = '/src/features/knowledge-graph/renderer.ts';
    const { GraphRenderer, darkPalette, lightPalette, graphResources } = await import(route);
    const renderer: GraphRenderer = new GraphRenderer(
      document.getElementById('graph'),
      { select: () => {}, open: () => {}, changed: () => {}, error: () => {} },
      dark ? darkPalette : lightPalette,
    );
    const positions = {
      a: { x: -180, y: 80, pinned: true },
      b: { x: 0, y: 80, pinned: true },
      c: { x: 180, y: 80, pinned: true },
      orphan: { x: 180, y: -80, pinned: true },
    };
    renderer.restore({
      version: 1,
      positions,
      camera: { x: 0.5, y: 0.5, ratio: 1 },
      particles: false,
      query: {
        focus: null,
        depth: 1,
        filter: '',
        folder: '',
        tag: '',
        showMissing: true,
        showOrphans: true,
        limit: 2000,
      },
    });
    renderer.setData({
      generation: 1,
      nodes: Object.keys(positions).map((id) => ({
        id,
        path: `${id}.md`,
        title: `${id} document`,
        tags: [],
        incoming: id === 'b' || id === 'c' ? 1 : 0,
        outgoing: id === 'a' || id === 'b' ? 1 : 0,
        state: 'ready',
      })),
      edges: [
        { id: 'ab', source: 'a', target: 'b', count: 1, anchorMissing: false },
        { id: 'bc', source: 'b', target: 'c', count: 1, anchorMissing: false },
      ],
      totalNotes: 4,
      totalEdges: 2,
      unresolved: 0,
      truncated: false,
      folders: [],
      tags: [],
    });
    const canvas = renderer.pointerTarget;
    const hover = (id: string | null) => {
      const p = id ? renderer.screenPosition(id) : { x: 20, y: 20 };
      const box = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: box.left + p.x,
          clientY: box.top + p.y,
          pointerId: 1,
        }),
      );
    };
    const sample = (id: string, label = false) => {
      const p = renderer.screenPosition(id);
      const ratio = canvas.width / canvas.clientWidth;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing graph canvas context');
      return Array.from(
        context.getImageData(
          Math.round((p.x + (label ? 16 : 0)) * ratio),
          Math.round((p.y - (label ? 9 : 0)) * ratio),
          (label ? 100 : 1) * ratio,
          (label ? 18 : 1) * ratio,
        ).data,
      );
    };
    Reflect.set(window, '__hoverFixture', { renderer, hover, sample, graphResources });
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }, dark);
}

for (const dark of [false, true]) {
  test(`${dark ? 'dark' : 'light'} hover fades locally without flashing unrelated nodes or labels`, async ({
    page,
  }) => {
    await setup(page, dark);
    const result = await page.evaluate(async () => {
      const { renderer, hover, sample } = Reflect.get(window, '__hoverFixture');
      const before = {
        node: sample('orphan'),
        label: sample('orphan', true),
        hovered: sample('a'),
      };
      const metrics = { ...renderer.metrics };
      const geometry = renderer.capture();
      const frames: { node: number[]; label: number[]; hovered: number[] }[] = [];
      hover('a');
      const start = performance.now();
      while (performance.now() - start < 350) {
        await new Promise(requestAnimationFrame);
        frames.push({
          node: sample('orphan'),
          label: sample('orphan', true),
          hovered: sample('a'),
        });
      }
      const settled = renderer.metrics.renders;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const idleRenders = renderer.metrics.renders - settled;
      hover('c');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const switched = { a: sample('a'), c: sample('c'), node: sample('orphan') };
      hover(null);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        before,
        frames,
        idleRenders,
        switched,
        restored: sample('a'),
        pathBuilds: renderer.metrics.pathBuilds - metrics.pathBuilds,
        batches: renderer.metrics.batches - metrics.batches,
        sameGeometry: JSON.stringify(renderer.capture()) === JSON.stringify(geometry),
      };
    });
    expect(
      result.frames.every((f) => JSON.stringify(f.node) === JSON.stringify(result.before.node)),
    ).toBe(true);
    expect(
      result.frames.every((f) => JSON.stringify(f.label) === JSON.stringify(result.before.label)),
    ).toBe(true);
    expect(new Set(result.frames.map((f) => f.hovered.join(','))).size).toBeGreaterThan(3);
    expect(result.frames.at(-1)?.hovered).not.toEqual(result.before.hovered);
    expect(result.switched.a).toEqual(result.before.hovered);
    expect(result.switched.node).toEqual(result.before.node);
    expect(result.restored).toEqual(result.before.hovered);
    expect(result.idleRenders).toBe(0);
    expect(result.pathBuilds).toBe(0);
    expect(result.batches).toBe(0);
    expect(result.sameGeometry).toBe(true);
  });
}

test('brief crossings do not repaint the graph and closing cancels pending hover work', async ({
  page,
}) => {
  await setup(page, false);
  const result = await page.evaluate(async () => {
    const { renderer, hover, graphResources } = Reflect.get(window, '__hoverFixture');
    const before = renderer.metrics.renders;
    for (const id of ['a', 'b', 'c', null]) {
      hover(id);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    const crossingRenders = renderer.metrics.renders - before;
    hover('a');
    renderer.destroy();
    const destroyed = renderer.metrics.renders;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { crossingRenders, afterDestroy: renderer.metrics.renders - destroyed, graphResources };
  });
  expect(result.crossingRenders).toBe(0);
  expect(result.afterDestroy).toBe(0);
  expect(result.graphResources).toEqual({ renderers: 0, workers: 0 });
});

test('reduced motion uses static local feedback and preserves the clicked selection', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, true);
  const result = await page.evaluate(async () => {
    const { renderer, hover, sample } = Reflect.get(window, '__hoverFixture');
    renderer.select('a');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const selected = sample('a'),
      faded = sample('orphan'),
      before = renderer.metrics.renders;
    hover('c');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = {
      selectionStable: JSON.stringify(selected) === JSON.stringify(sample('a')),
      backgroundStable: JSON.stringify(faded) === JSON.stringify(sample('orphan')),
      renders: renderer.metrics.renders - before,
    };
    renderer.pause();
    const paused = renderer.metrics.renders;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { ...result, pausedRenders: renderer.metrics.renders - paused };
  });
  expect(result.selectionStable).toBe(true);
  expect(result.backgroundStable).toBe(true);
  expect(result.renders).toBe(1);
  expect(result.pausedRenders).toBe(0);
});

test('dense graph hover reuses scene paths, settles and stops mid-transition when paused', async ({
  page,
}, info) => {
  await setup(page, true);
  const result = await page.evaluate(async () => {
    const { renderer, hover } = Reflect.get(window, '__hoverFixture');
    const positions = Object.fromEntries(
      Array.from({ length: 5000 }, (_, i) => [
        `n${i}`,
        { x: (i % 100) * 16, y: Math.floor(i / 100) * 16, pinned: true },
      ]),
    );
    renderer.restore({ version: 1, positions, camera: null, particles: false });
    const nodes = Object.keys(positions).map((id) => ({
      id,
      path: `${id}.md`,
      title: id,
      tags: [],
      incoming: 4,
      outgoing: 4,
      state: 'ready',
    }));
    const edges = nodes.flatMap((node, i) =>
      [1, 7, 31, 127].map((step) => ({
        id: `${i}-${step}`,
        source: node.id,
        target: `n${(i + step) % 5000}`,
        count: 1,
        anchorMissing: false,
      })),
    );
    renderer.setData({
      generation: 2,
      nodes,
      edges,
      totalNotes: 5000,
      totalEdges: 20000,
      unresolved: 0,
      truncated: false,
      folders: [],
      tags: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const baselineDraws: number[] = [],
      baselineIntervals: number[] = [];
    let previousBaseline = await new Promise<number>(requestAnimationFrame);
    for (let i = 0; i < 90; i++) {
      renderer.camera({});
      const now = await new Promise<number>(requestAnimationFrame);
      if (i >= 10) {
        baselineDraws.push(renderer.metrics.drawMs);
        baselineIntervals.push(now - previousBaseline);
      }
      previousBaseline = now;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const metrics = { ...renderer.metrics },
      geometry = renderer.capture();
    const draws: number[] = [];
    const intervals: number[] = [];
    for (const id of ['n2320', 'n2321', 'n2322', 'n2323', 'n2324', null]) {
      hover(id);
      const start = performance.now();
      let last = renderer.metrics.renders,
        previous = await new Promise<number>(requestAnimationFrame);
      while (performance.now() - start < 300) {
        const now = await new Promise<number>(requestAnimationFrame);
        intervals.push(now - previous);
        previous = now;
        if (renderer.metrics.renders !== last) draws.push(renderer.metrics.drawMs);
        last = renderer.metrics.renders;
      }
    }
    const settled = renderer.metrics.renders;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const idleRenders = renderer.metrics.renders - settled;
    hover('n2320');
    await new Promise((resolve) => setTimeout(resolve, 100));
    renderer.pause();
    const paused = renderer.metrics.renders;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      nodes: nodes.length,
      edges: edges.length,
      baselineDraws,
      baselineIntervals,
      draws,
      intervals,
      idleRenders,
      pausedRenders: renderer.metrics.renders - paused,
      pathBuilds: renderer.metrics.pathBuilds - metrics.pathBuilds,
      batches: renderer.metrics.batches - metrics.batches,
      sameGeometry: JSON.stringify(renderer.capture()) === JSON.stringify(geometry),
    };
  });
  await info.attach('hover-render-timings', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  expect(result.draws.length).toBeGreaterThan(10);
  expect(result.idleRenders).toBe(0);
  expect(result.pausedRenders).toBe(0);
  expect(result.pathBuilds).toBe(0);
  expect(result.batches).toBe(0);
  expect(result.sameGeometry).toBe(true);
});
