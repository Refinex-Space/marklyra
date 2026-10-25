import { Component, type ReactNode } from 'react';

/** A graph loading/rendering failure must never unmount the editor or its undo history. */
export class GraphBoundary extends Component<
  { children: ReactNode; close: () => void },
  { error: string }
> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section
        className="knowledge-surface"
        role="alert"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 15,
          display: 'grid',
          placeContent: 'center',
          gap: 12,
          padding: 32,
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      >
        <strong>图谱暂时无法显示</strong>
        <p>{this.state.error}</p>
        <button type="button" onClick={this.props.close}>
          返回文档
        </button>
      </section>
    );
  }
}
