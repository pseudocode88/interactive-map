import { useContext, useMemo } from "react";
import { LoadingManagerContext } from "../context/LoadingManagerContext";

const NOOP_REGISTER = (_id: string, _label: string) => {};
const NOOP_UPDATE = (_id: string, _progress: number) => {};
const NOOP_COMPLETE = (_id: string) => {};

export function useLoadingManager() {
  const manager = useContext(LoadingManagerContext);

  return useMemo(
    () => ({
      registerStage: manager?.registerStage ?? NOOP_REGISTER,
      updateStageProgress: manager?.updateStageProgress ?? NOOP_UPDATE,
      completeStage: manager?.completeStage ?? NOOP_COMPLETE,
    }),
    [manager]
  );
}
