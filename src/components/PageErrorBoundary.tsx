import { Component, type ReactNode } from "react";

/** A failed page/chunk keeps navigation and logout available. Reload is explicit. */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="panel" role="alert">
      <h2>页面暂时无法打开</h2>
      <p>资源加载或页面处理失败。可切换其他页面，或重新加载后再试。</p>
      <button onClick={() => window.location.reload()}>重新加载</button>
    </div>;
    return this.props.children;
  }
}
