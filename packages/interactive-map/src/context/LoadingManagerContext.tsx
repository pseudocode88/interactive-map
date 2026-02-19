import { createContext, useMemo, type ReactNode } from "react";

export enum LoadingStage {
  BASE_IMAGE = "base-image",
  LAYER_TEXTURES = "layer-textures",
  MASK_TEXTURES = "mask-textures",
  PARTICLE_INIT = "particle-init",
  FIRST_FRAME = "first-frame",
}

export interface LoadingManagerState {
  stages: Map<string, { label: string; progress: number }>;
  overallProgress: number;
  isComplete: boolean;
  currentStage: string;
}

interface LoadingStageRecord {
  label: string;
  progress: number;
  weight: number;
}

export interface LoadingManagerStore {
  registerStage: (id: string, label: string) => void;
  updateStageProgress: (id: string, progress: number) => void;
  completeStage: (id: string) => void;
  subscribe: (callback: (state: LoadingManagerState) => void) => () => void;
  getSnapshot: () => LoadingManagerState;
}

const STAGE_WEIGHTS: Record<string, number> = {
  [LoadingStage.BASE_IMAGE]: 10,
  [LoadingStage.LAYER_TEXTURES]: 40,
  [LoadingStage.MASK_TEXTURES]: 20,
  [LoadingStage.PARTICLE_INIT]: 20,
  [LoadingStage.FIRST_FRAME]: 10,
};

const EMPTY_SNAPSHOT: LoadingManagerState = {
  stages: new Map(),
  overallProgress: 0,
  isComplete: false,
  currentStage: "",
};

function clampProgress(progress: number): number {
  if (Number.isNaN(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}

function computeSnapshot(stages: Map<string, LoadingStageRecord>): LoadingManagerState {
  if (stages.size === 0) {
    return EMPTY_SNAPSHOT;
  }

  const serialized = new Map<string, { label: string; progress: number }>();
  let totalWeight = 0;
  let weightedProgress = 0;
  let firstIncompleteLabel = "";
  let fallbackLabel = "";

  for (const [id, stage] of stages) {
    serialized.set(id, { label: stage.label, progress: stage.progress });
    totalWeight += stage.weight;
    weightedProgress += stage.progress * stage.weight;
    fallbackLabel = stage.label;
    if (!firstIncompleteLabel && stage.progress < 1) {
      firstIncompleteLabel = stage.label;
    }
  }

  const overallProgress = totalWeight === 0 ? 0 : (weightedProgress / totalWeight) * 100;

  return {
    stages: serialized,
    overallProgress,
    isComplete: overallProgress >= 100,
    currentStage: firstIncompleteLabel || fallbackLabel,
  };
}

function createLoadingManagerStore(): LoadingManagerStore {
  const stages = new Map<string, LoadingStageRecord>();
  const listeners = new Set<(state: LoadingManagerState) => void>();
  let snapshot: LoadingManagerState = EMPTY_SNAPSHOT;

  const emit = () => {
    snapshot = computeSnapshot(stages);

    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const registerStage = (id: string, label: string) => {
    const existing = stages.get(id);
    const nextWeight = STAGE_WEIGHTS[id] ?? 0;

    stages.set(id, {
      label,
      progress: existing?.progress ?? 0,
      weight: nextWeight,
    });
    emit();
  };

  const updateStageProgress = (id: string, progress: number) => {
    const nextProgress = clampProgress(progress);
    const existing = stages.get(id);

    stages.set(id, {
      label: existing?.label ?? id,
      progress: nextProgress,
      weight: existing?.weight ?? STAGE_WEIGHTS[id] ?? 0,
    });
    emit();
  };

  const completeStage = (id: string) => {
    updateStageProgress(id, 1);
  };

  const subscribe = (callback: (state: LoadingManagerState) => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };

  const getSnapshot = () => snapshot;

  return {
    registerStage,
    updateStageProgress,
    completeStage,
    subscribe,
    getSnapshot,
  };
}

export const LoadingManagerContext = createContext<LoadingManagerStore | null>(null);

interface LoadingManagerProviderProps {
  children: ReactNode;
}

export function LoadingManagerProvider({ children }: LoadingManagerProviderProps) {
  const store = useMemo(() => createLoadingManagerStore(), []);

  return (
    <LoadingManagerContext.Provider value={store}>
      {children}
    </LoadingManagerContext.Provider>
  );
}
