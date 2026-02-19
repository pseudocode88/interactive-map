import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  LoadingManagerContext,
  type LoadingManagerState,
} from "../context/LoadingManagerContext";
import type { LoadingStyleConfig } from "../types";

const DEFAULT_MESSAGES = [
  "Preparing the canvas...",
  "Loading map layers...",
  "Applying masks...",
  "Initializing particles...",
  "Rendering first frame...",
];

const DEFAULT_STYLE: Required<LoadingStyleConfig> = {
  barColor: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.85)",
  textColor: "#cccccc",
  barHeight: 4,
  font: "inherit",
};

const FALLBACK_STATE: LoadingManagerState = {
  stages: new Map(),
  overallProgress: 0,
  isComplete: false,
  currentStage: "",
};

interface LoadingOverlayProps {
  messages?: string[];
  loadingStyle?: LoadingStyleConfig;
  onFadeComplete?: () => void;
}

function getMessageForProgress(progress: number, messages: string[]): string {
  if (messages.length === 0) {
    return "";
  }

  const thresholds = messages.map((_, index) => (index * 100) / messages.length);
  let messageIndex = 0;

  for (let index = 0; index < thresholds.length; index += 1) {
    if (progress >= thresholds[index]) {
      messageIndex = index;
    }
  }

  return messages[messageIndex] ?? "";
}

export function LoadingOverlay({ messages, loadingStyle, onFadeComplete }: LoadingOverlayProps) {
  const manager = useContext(LoadingManagerContext);
  const [mounted, setMounted] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const state = useSyncExternalStore(
    manager?.subscribe ?? (() => () => {}),
    manager?.getSnapshot ?? (() => FALLBACK_STATE),
    () => FALLBACK_STATE
  );

  const mergedStyle = useMemo(
    () => ({ ...DEFAULT_STYLE, ...(loadingStyle ?? {}) }),
    [loadingStyle]
  );
  const activeMessages = messages && messages.length > 0 ? messages : DEFAULT_MESSAGES;
  const label = getMessageForProgress(state.overallProgress, activeMessages);

  useEffect(() => {
    if (!state.isComplete) {
      return;
    }

    setIsFadingOut(true);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
      onFadeComplete?.();
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onFadeComplete, state.isComplete]);

  if (!manager || !mounted) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: mergedStyle.backgroundColor,
        color: mergedStyle.textColor,
        opacity: isFadingOut ? 0 : 1,
        transition: "opacity 0.4s ease",
        pointerEvents: isFadingOut ? "none" : "auto",
      }}
    >
      <div
        style={{
          width: 240,
          backgroundColor: "rgba(255, 255, 255, 0.2)",
          borderRadius: 999,
          overflow: "hidden",
          height: mergedStyle.barHeight,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, state.overallProgress))}%`,
            height: "100%",
            backgroundColor: mergedStyle.barColor,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 13,
          fontFamily: mergedStyle.font,
          color: mergedStyle.textColor,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
    </div>
  );
}
