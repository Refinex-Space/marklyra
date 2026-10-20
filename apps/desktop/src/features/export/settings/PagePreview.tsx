import type { CSSProperties } from 'react';
import {
  hasText,
  marginsFillPage,
  type PdfPreviewModel,
  resolveVariables,
  type SampleDocument,
  type Zones,
} from './pdfLayout.js';

const BOX = { width: 168, height: 184 };

function Band({
  zones,
  sample,
  edge,
}: {
  zones: Zones;
  sample: SampleDocument;
  edge: 'top' | 'bottom';
}) {
  if (!hasText(zones)) return null;
  return (
    <div className={`es-page-band es-page-band-${edge}`} aria-hidden="true">
      <span>{resolveVariables(zones.left, sample)}</span>
      <span>{resolveVariables(zones.center, sample)}</span>
      <span>{resolveVariables(zones.right, sample)}</span>
    </div>
  );
}

/** A schematic of the printed page: paper, margins, header/footer text and a few text lines. */
export function PagePreview({
  model,
  sample,
  orientation,
}: {
  model: PdfPreviewModel;
  sample: SampleDocument;
  orientation: string;
}) {
  const [width, height] = model.paper;
  const scale = Math.min(BOX.width / width, BOX.height / height);
  const page: CSSProperties = {
    width: width * scale,
    height: height * scale,
  };
  const body: CSSProperties = {
    top: model.margins.top * scale,
    right: model.margins.right * scale,
    bottom: model.margins.bottom * scale,
    left: model.margins.left * scale,
  };
  const bands = (edge: 'top' | 'bottom'): CSSProperties => ({
    left: model.margins.left * scale,
    right: model.margins.right * scale,
    [edge]: 0,
    height: (edge === 'top' ? model.margins.top : model.margins.bottom) * scale,
  });
  const filled = marginsFillPage(model);
  return (
    <figure className="es-preview" aria-label="页面预览">
      <div className="es-preview-stage" style={{ width: BOX.width, height: BOX.height }}>
        <div className="es-page" style={page}>
          <div className="es-page-body" style={body} aria-hidden="true">
            <i className="es-page-bar" />
            <i className="es-page-lines" />
          </div>
          <div className="es-page-edge" style={bands('top')}>
            <Band zones={model.header} sample={sample} edge="top" />
          </div>
          <div className="es-page-edge" style={bands('bottom')}>
            <Band zones={model.footer} sample={sample} edge="bottom" />
          </div>
        </div>
      </div>
      <figcaption>
        {width} × {height} 毫米 · {orientation}
        {filled && <strong role="alert"> · 边距占满了纸张</strong>}
      </figcaption>
    </figure>
  );
}
