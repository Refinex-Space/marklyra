import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

test('a file BOM does not prevent YAML image-root resolution or become part of its authority', async ({
  page,
}) => {
  await setupImageHost(page);
  const raw = '\uFEFF---\r\ntypora-root-url: media\n---\r\n\r\n![pixel](pixel.png)\n\nBody';
  await createImageEditor(page, { source: raw, context: 'bom-image-doc' });
  await expect(imageFrame(page).locator('#write > .md-meta-block')).toHaveCount(1);
  await expectDecodedImage(page);
  const requests = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.context).toBe('bom-image-doc');
    expect(request.reference).toBe('media/pixel.png');
    expect(request.source).toBe('pixel.png');
  }
  expect(await imageSource(page)).toBe(raw);
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});
