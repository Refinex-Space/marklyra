import { expect, type Page, test } from '@playwright/test';
import type { GraphRenderer3D } from '../../apps/desktop/src/features/knowledge-graph/renderer3d.js';

interface Fixture {
  renderer: GraphRenderer3D;
  selected: (string | null)[];
  unavailable: string[];
  pointer: (type: string, x: number, y: number) => void;
  click: (x: number, y: number) => void;
  drag: (from: [number, number], to: [number, number]) => void;
  graphResources: { renderers: number; workers: number };
}

async function setup(page: Page, dark = false, populate = true) {
  await page.route('**/__knowledge-3d', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><body style="margin:0;background:${dark ? '#0d1117' : '#ffffff'}"><div id="graph" style="position:relative;width:900px;height:600px"></div>`,
    }),
  );
  await page.goto('/__knowledge-3d');
  await page.evaluate(
    async ([dark, populate]) => {
      const route = '/src/features/knowledge-graph/renderer3d.ts';
      const resources = '/src/features/knowledge-graph/resources.ts';
      const { GraphRenderer3D, darkPalette, lightPalette } = await import(route);
      const { graphResources } = await import(resources);
      const selected: (string | null)[] = [];
      const unavailable: string[] = [];
      const renderer = new GraphRenderer3D(
        document.getElementById('graph'),
        {
          select: (id: string | null) => selected.push(id),
          open: () => {},
          changed: () => {},
          error: () => {},
          unavailable: (message: string) => unavailable.push(message),
        },
        dark ? darkPalette : lightPalette,
      );
      if (populate) {
        // Every node is pinned, so the layout is settled and the coordinates below are final.
        const positions = {
          a: { x: -150, y: 0, z: 0, pinned: true },
          b: { x: 150, y: 0, z: 0, pinned: true },
          front: { x: 0, y: 0, z: 100, pinned: true },
          behind: { x: 0, y: 0, z: -300, pinned: true },
          high: { x: 0, y: 160, z: 0, pinned: true },
        };
        renderer.restore({
          version: 2,
          mode: '3d',
          positions,
          camera: null,
          camera3d: { yaw: 0, pitch: 0, ratio: 1, x: 0, y: 0, z: 0 },
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
            path: `${id === 'front' || id === 'behind' ? 'Docs' : 'Notes'}/${id}.md`,
            title: `${id} document`,
            tags: [],
            incoming: id === 'a' ? 3 : 1,
            outgoing: 0,
            state: 'ready',
          })),
          edges: [
            { id: 'ab', source: 'a', target: 'b', count: 1, anchorMissing: false },
            { id: 'bf', source: 'b', target: 'front', count: 1, anchorMissing: false },
          ],
          totalNotes: 5,
          totalEdges: 2,
          unresolved: 0,
          truncated: false,
          folders: [],
          tags: [],
        });
      }
      const target = renderer.pointerTarget;
      const pointer = (type: string, x: number, y: number) => {
        const box = target.getBoundingClientRect();
        target.dispatchEvent(
          new PointerEvent(type, {
            clientX: box.left + x,
            clientY: box.top + y,
            pointerId: 1,
            button: 0,
            bubbles: true,
          }),
        );
      };
      const click = (x: number, y: number) => {
        pointer('pointerdown', x, y);
        pointer('pointerup', x, y);
      };
      const drag = (from: [number, number], to: [number, number]) => {
        pointer('pointerdown', ...from);
        for (let i = 1; i <= 6; i++)
          pointer(
            'pointermove',
            from[0] + ((to[0] - from[0]) * i) / 6,
            from[1] + ((to[1] - from[1]) * i) / 6,
          );
        pointer('pointerup', ...to);
      };
      Reflect.set(window, '__fixture', {
        renderer,
        selected,
        unavailable,
        pointer,
        click,
        drag,
        graphResources,
      });
      renderer.renderNow();
      await new Promise((resolve) => setTimeout(resolve, 200));
      renderer.renderNow();
    },
    [dark, populate] as const,
  );
}
/** Runs `run` in the page with the fixture the setup left on `window`. */
async function fixture<T>(page: Page, run: (f: Fixture) => T | Promise<T>): Promise<T> {
  const handle = await page.evaluateHandle<Fixture>(() => Reflect.get(window, '__fixture'));
  try {
    return await handle.evaluate(run);
  } finally {
    await handle.dispose();
  }
}

for (const dark of [false, true]) {
  test(`${dark ? 'dark' : 'light'}: the scene is drawn with depth and the theme background`, async ({
    page,
  }) => {
    await setup(page, dark);
    const result = await fixture(page, ({ renderer }) => {
      renderer.renderNow();
      const canvas = renderer.pointerTarget.previousElementSibling as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
      const ratio = canvas.width / canvas.clientWidth;
      const read = (x: number, y: number) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(
          Math.round(x * ratio),
          Math.round((canvas.clientHeight - y) * ratio),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return Array.from(pixel.slice(0, 3));
      };
      const at = (id: string) => renderer.screenPosition(id);
      return {
        corner: read(3, 3),
        a: read(at('a').x, at('a').y),
        front: read(at('front').x, at('front').y),
        canvases: renderer.pointerTarget.parentElement?.querySelectorAll('canvas').length,
      };
    });
    const background = dark ? [13, 17, 23] : [255, 255, 255];
    expect(result.corner).toEqual(background);
    expect(result.a).not.toEqual(background);
    expect(result.front).not.toEqual(background);
    expect(result.canvases).toBe(2);
  });
}

test('picking prefers the node nearest the camera along the same line of sight', async ({
  page,
}) => {
  await setup(page);
  const result = await fixture(page, ({ renderer, selected, click, pointer }) => {
    const front = renderer.screenPosition('front'),
      behind = renderer.screenPosition('behind');
    renderer.renderNow();
    click(front.x, front.y);
    pointer('pointermove', front.x, front.y);
    return {
      overlap: Math.hypot(front.x - behind.x, front.y - behind.y),
      selected: [...selected],
      cursor: renderer.pointerTarget.style.cursor,
    };
  });
  // The two nodes sit on one line of sight, yet the click reaches the closer one.
  expect(result.overlap).toBeLessThan(12);
  expect(result.selected).toEqual(['front']);
  expect(result.cursor).toBe('grab');
});

test('dragging empty space orbits the view and leaves node positions alone', async ({ page }) => {
  await setup(page);
  const result = await fixture(page, ({ renderer, drag }) => {
    const before = renderer.capture();
    const spot = renderer.screenPosition('a');
    drag([30, 30], [250, 120]);
    renderer.renderNow();
    const after = renderer.capture();
    return {
      yaw: [before.camera3d?.yaw, after.camera3d?.yaw],
      pitch: [before.camera3d?.pitch, after.camera3d?.pitch],
      positions: [before.positions, after.positions],
      moved: Math.hypot(
        renderer.screenPosition('a').x - spot.x,
        renderer.screenPosition('a').y - spot.y,
      ),
    };
  });
  expect(result.yaw[0]).toBe(0);
  expect(result.yaw[1]).not.toBe(0);
  expect(result.pitch[1]).toBeGreaterThan(0);
  expect(result.moved).toBeGreaterThan(20);
  expect(result.positions[1]).toEqual(result.positions[0]);
});

test('dragging a node moves it on the plane facing the camera and nothing else', async ({
  page,
}) => {
  await setup(page);
  const result = await fixture(page, ({ renderer, drag }) => {
    const a = renderer.screenPosition('a'),
      before = renderer.capture().positions;
    drag([a.x, a.y], [a.x + 70, a.y + 40]);
    const after = renderer.capture().positions;
    return { before, after, camera: renderer.capture().camera3d };
  });
  const { before, after } = result;
  expect((after.a?.x ?? 0) - (before.a?.x ?? 0)).toBeGreaterThan(20);
  expect((after.a?.y ?? 0) - (before.a?.y ?? 0)).toBeLessThan(-10);
  expect(after.a?.z).toBeCloseTo(0, 3);
  for (const id of ['b', 'front', 'behind', 'high']) expect(after[id]).toEqual(before[id]);
  expect(result.camera?.yaw).toBe(0);
});

test('shift-drag pans the look-at point; the wheel zooms towards the pointer', async ({ page }) => {
  await setup(page);
  const result = await fixture(page, ({ renderer, pointer }) => {
    const before = renderer.capture().camera3d;
    const target = renderer.pointerTarget;
    const box = target.getBoundingClientRect();
    const send = (type: string, x: number, y: number, shiftKey = false) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          clientX: box.left + x,
          clientY: box.top + y,
          pointerId: 1,
          button: 0,
          shiftKey,
          bubbles: true,
        }),
      );
    send('pointerdown', 40, 40, true);
    send('pointermove', 140, 90, true);
    send('pointerup', 140, 90, true);
    pointer('pointermove', 5, 5);
    const panned = renderer.capture().camera3d;
    target.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: box.left + 600,
        clientY: box.top + 150,
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      }),
    );
    return { before, panned };
  });
  expect(result.panned?.x).toBeLessThan(result.before?.x ?? 0);
  expect(result.panned?.y).toBeGreaterThan(result.before?.y ?? 0);
  expect(result.panned?.yaw).toBe(result.before?.yaw);
  // The wheel animates; the ratio settles below 1 and the point under the pointer stays put.
  await expect
    .poll(() => fixture(page, ({ renderer }) => renderer.capture().camera3d?.ratio ?? 1))
    .toBeLessThan(0.9);
});

test('keyboard steps orbit the view and fit restores the framing', async ({ page }) => {
  await setup(page);
  const result = await fixture(page, ({ renderer }) => {
    renderer.step(-0.08, 0);
    renderer.step(0, 0.08);
    return renderer.capture().camera3d;
  });
  expect(result?.yaw).toBeGreaterThan(0.3);
  expect(result?.pitch).toBeGreaterThan(0.3);
  await fixture(page, ({ renderer }) => renderer.zoom(0.5));
  await expect
    .poll(() => fixture(page, ({ renderer }) => renderer.capture().camera3d?.ratio ?? 1))
    .toBeLessThan(0.6);
  await fixture(page, ({ renderer }) => renderer.fit());
  await expect
    .poll(() => fixture(page, ({ renderer }) => renderer.capture().camera3d?.ratio ?? 0))
    .toBeCloseTo(1, 2);
});

test('a lost GPU context is reported so the workbench can fall back to 2D', async ({ page }) => {
  await setup(page);
  await fixture(page, ({ renderer }) => {
    const canvas = renderer.pointerTarget.previousElementSibling as HTMLCanvasElement;
    (canvas.getContext('webgl2') as WebGL2RenderingContext)
      .getExtension('WEBGL_lose_context')
      ?.loseContext();
  });
  await expect.poll(() => fixture(page, ({ unavailable }) => unavailable.length)).toBe(1);
  // Drawing after the loss is a quiet no-op rather than an exception.
  await fixture(page, ({ renderer }) => renderer.renderNow());
});

test('destroying the scene releases canvases, workers and the GPU context', async ({ page }) => {
  await setup(page);
  const result = await fixture(page, ({ renderer, graphResources }) => {
    const mount = renderer.pointerTarget.parentElement;
    const live = { ...graphResources };
    renderer.destroy();
    return {
      live,
      after: { ...graphResources },
      canvases: mount?.querySelectorAll('canvas').length,
    };
  });
  expect(result.live.renderers).toBe(1);
  expect(result.after).toEqual({ renderers: 0, workers: 0 });
  expect(result.canvases).toBe(0);
});

test('a dense graph lays out in 3D, fills a volume and stays within the frame budget', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, false, false);
  const nodeCount = 5000;
  await page.evaluate(
    ([count]) => {
      const { renderer } = Reflect.get(window, '__fixture') as Fixture;
      let seed = 12345;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      const nodes = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        path: `Folder${i % 9}/n${i}.md`,
        title: `Document ${i}`,
        tags: [],
        incoming: i < 40 ? 80 : 0,
        outgoing: 0,
        state: 'ready' as const,
      }));
      const edges = Array.from({ length: Math.round(count * 3) }, (_, i) => ({
        id: `e${i}`,
        source: `n${Math.floor(random() * count)}`,
        target: `n${Math.floor(random() ** 3 * count)}`,
        count: 1,
        anchorMissing: false,
      })).filter((edge) => edge.source !== edge.target);
      renderer.restore({
        version: 2,
        mode: '3d',
        positions: {},
        camera: null,
        camera3d: null,
        particles: false,
        query: {
          focus: null,
          depth: 1,
          filter: '',
          folder: '',
          tag: '',
          showMissing: true,
          showOrphans: true,
          limit: 5000,
        },
      });
      renderer.setData({
        generation: 2,
        nodes,
        edges,
        totalNotes: count,
        totalEdges: edges.length,
        unresolved: 0,
        truncated: false,
        folders: [],
        tags: [],
      });
    },
    [nodeCount] as const,
  );
  await expect
    .poll(
      () =>
        fixture(
          page,
          ({ renderer }) => renderer.metrics.batches > 0 && !renderer.metrics.layoutRunning,
        ),
      {
        timeout: 60_000,
      },
    )
    .toBe(true);
  const result = await fixture(page, ({ renderer }) => {
    const positions = Object.values(renderer.capture().positions);
    const spread = (pick: (p: { x: number; y: number; z?: number }) => number) => {
      const values = positions.map(pick);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      renderer.step(-0.02, 0);
      renderer.renderNow();
      times.push(renderer.metrics.drawMs);
    }
    times.sort((a, b) => a - b);
    return {
      count: positions.length,
      finite: positions.every((p) => [p.x, p.y, p.z].every((v) => Number.isFinite(v))),
      x: spread((p) => p.x),
      z: spread((p) => p.z ?? 0),
      median: times[15] ?? 0,
      p95: times[28] ?? 0,
    };
  });
  testInfo.annotations.push({
    type: 'draw',
    description: `5000 nodes: median ${result.median.toFixed(2)} ms, p95 ${result.p95.toFixed(2)} ms`,
  });
  expect(result.count).toBe(nodeCount);
  expect(result.finite).toBe(true);
  // A real 3D layout: depth carries a meaningful share of the spread instead of collapsing flat.
  expect(result.z).toBeGreaterThan(result.x * 0.4);
  expect(result.p95).toBeLessThan(40);
});
