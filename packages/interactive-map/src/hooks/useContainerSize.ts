import { RefObject, useEffect, useState } from "react";

interface ContainerSize {
  width: number;
  height: number;
}

export function useContainerSize(
  containerRef: RefObject<HTMLDivElement | null>
): ContainerSize | null {
  const [size, setSize] = useState<ContainerSize | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      setSize(null);
      return;
    }

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
}
