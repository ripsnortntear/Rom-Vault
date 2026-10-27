"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw, X, Download } from "lucide-react";

interface Props {
  children: ReactNode;
  onReset: () => void;
  gameTitle?: string;
  downloadUrl?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class EmulatorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[EmulatorErrorBoundary] Caught emulator runtime error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isMemoryError =
        this.state.error?.message?.toLowerCase().includes("memory") ||
        this.state.error?.message?.toLowerCase().includes("oom") ||
        this.state.error?.message?.toLowerCase().includes("out of memory") ||
        this.state.error?.message?.toLowerCase().includes("array buffer");

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-900/95 p-6 sm:p-8 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              Emulation Suspended
            </h3>

            {this.props.gameTitle && (
              <p className="text-xs font-semibold text-zinc-300 mb-3 truncate">
                {this.props.gameTitle}
              </p>
            )}

            <p className="text-xs text-zinc-400 leading-relaxed mb-6">
              {isMemoryError
                ? "Your mobile browser ran low on WebAssembly memory while running this full disc image. Try closing background browser tabs or download the game for desktop emulation."
                : "The emulator encountered an unexpected runtime error. Your library filters and search queries have been safely preserved."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition active:scale-95 cursor-pointer shadow-md shadow-blue-600/20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Emulation
              </button>

              {this.props.downloadUrl && (
                <a
                  href={this.props.downloadUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10 transition active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download ROM
                </a>
              )}

              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition active:scale-95 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Return to Library
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
