"use client";

import { useRef } from "react";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera } from "three";

import type { PanConfig } from "../types";

interface CameraControllerProps {
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
}

interface Point {
  x: number;
  y: number;
}

interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

function clampTarget(
  target: Point,
  camera: OrthographicCamera,
  baseWidth: number,
  baseHeight: number
) {
  const visibleWidth = camera.right - camera.left;
  const visibleHeight = camera.top - camera.bottom;

  const minX = -baseWidth / 2 + visibleWidth / 2;
  const maxX = baseWidth / 2 - visibleWidth / 2;
  const minY = -baseHeight / 2 + visibleHeight / 2;
  const maxY = baseHeight / 2 - visibleHeight / 2;

  target.x = minX >= maxX ? 0 : Math.max(minX, Math.min(maxX, target.x));
  target.y = minY >= maxY ? 0 : Math.max(minY, Math.min(maxY, target.y));
}

function capturePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as unknown as Partial<PointerCaptureTarget>;
  target.setPointerCapture?.(event.pointerId);
}

function releasePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as unknown as Partial<PointerCaptureTarget>;
  target.releasePointerCapture?.(event.pointerId);
}

export function CameraController({
  baseWidth,
  baseHeight,
  panConfig,
}: CameraControllerProps) {
  const { camera, size } = useThree();
  const targetPosition = useRef<Point>({ x: 0, y: 0 });
  const dragState = useRef({
    isDragging: false,
    previousScreenPoint: { x: 0, y: 0 },
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!panConfig.enabled) {
      return;
    }

    event.stopPropagation();
    dragState.current.isDragging = true;
    dragState.current.previousScreenPoint = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
    capturePointer(event);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragState.current.isDragging) {
      return;
    }

    const currentScreenX = event.nativeEvent.clientX;
    const currentScreenY = event.nativeEvent.clientY;
    const screenDx = currentScreenX - dragState.current.previousScreenPoint.x;
    const screenDy = currentScreenY - dragState.current.previousScreenPoint.y;

    const orthoCamera = camera as OrthographicCamera;
    const frustumWidth = orthoCamera.right - orthoCamera.left;
    const frustumHeight = orthoCamera.top - orthoCamera.bottom;

    const worldDx = -(screenDx / size.width) * frustumWidth;
    const worldDy = (screenDy / size.height) * frustumHeight;

    targetPosition.current.x += worldDx;
    targetPosition.current.y += worldDy;
    clampTarget(
      targetPosition.current,
      orthoCamera,
      baseWidth,
      baseHeight
    );

    dragState.current.previousScreenPoint = {
      x: currentScreenX,
      y: currentScreenY,
    };
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    dragState.current.isDragging = false;
    releasePointer(event);
  };

  useFrame(() => {
    const dx = targetPosition.current.x - camera.position.x;
    const dy = targetPosition.current.y - camera.position.y;

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return;
    }

    camera.position.x += dx * panConfig.easingFactor;
    camera.position.y += dy * panConfig.easingFactor;
  });

  return (
    <mesh
      position={[0, 0, 5]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <planeGeometry args={[baseWidth, baseHeight]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
