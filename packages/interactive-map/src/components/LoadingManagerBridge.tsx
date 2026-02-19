import { type ReactNode } from "react";
import {
  LoadingManagerContext,
  type LoadingManagerStore,
} from "../context/LoadingManagerContext";

interface LoadingManagerBridgeProps {
  manager: LoadingManagerStore | null;
  children: ReactNode;
}

export function LoadingManagerBridge({ manager, children }: LoadingManagerBridgeProps) {
  if (!manager) {
    return <>{children}</>;
  }

  return (
    <LoadingManagerContext.Provider value={manager}>
      {children}
    </LoadingManagerContext.Provider>
  );
}
