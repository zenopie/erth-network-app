import React from "react";

/**
 * Catches a render-time throw in one page so the sidebar and the rest of the
 * app stay up. Chain and indexer data is not trusted to be well formed: a
 * field that should be a string and is not would otherwise unmount everything.
 * Layout keys it by path, so navigating away clears it.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page failed to render:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: 24 }}>
        <h2>This page could not be shown</h2>
        <p>
          Something it read could not be displayed: {String(this.state.error?.message ?? this.state.error).slice(0, 200)}
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
