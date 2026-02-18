"use client";

import { useEffect, useRef } from "react";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera } from "three";

import type { PanConfig, ZoomConfig } from "../types";

interface CameraControllerProps {
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;
}

interface Point {
  x: number;
  y: number;
}

interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

function clampTargetForZoom(
  target: Point,
  visibleWidth: number,
  visibleHeight: number,
  baseWidth: number,
  baseHeight: number
) {
  const minX = -baseWidth / 2 + visibleWidth / 2;
  const maxX = baseWidth / 2 - visibleWidth / 2;
  const minY = -baseHeight / 2 + visibleHeight / 2;
  const maxY = baseHeight / 2 - visibleHeight / 2;

  target.x = minX >= maxX ? 0 : Math.max(minX, Math.min(maxX, target.x));
  target.y = minY >= maxY ? 0 : Math.max(minY, Math.min(maxY, target.y));
}

function clampTarget(
  target: Point,
  camera: OrthographicCamera,
  baseWidth: number,
  baseHeight: number
) {
  const visibleWidth = camera.right - camera.left;
  const visibleHeight = camera.top - camera.bottom;
  clampTargetForZoom(target, visibleWidth, visibleHeight, baseWidth, baseHeight);
}

function capturePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as unknown as Partial<PointerCaptureTarget>;
  target.setPointerCapture?.(event.pointerId);
}

function releasePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as unknown as Partial<PointerCaptureTarget>;
  target.releasePointerCapture?.(event.pointerId);
}

function getDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export function CameraController({
  baseWidth,
  baseHeight,
  panConfig,
  zoomConfig,
}: CameraControllerProps) {
  const { camera, size, gl } = useThree();
  const orthoCamera = camera as OrthographicCamera;
  const aspectRatio = size.height / size.width;
  const baseFrustumHalfWidth = baseWidth / 2;
  const baseFrustumHalfHeight = baseFrustumHalfWidth * aspectRatio;

  const targetPosition = useRef<Point>({ x: 0, y: 0 });
  const targetZoom = useRef<number>(zoomConfig.initialZoom);
  const currentZoom = useRef<number>(zoomConfig.initialZoom);
  const dragState = useRef({
    isDragging: false,
    previousScreenPoint: { x: 0, y: 0 },
  });
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchState = useRef({
    isPinching: false,
    initialDistance: 0,
    initialZoom: 1,
  });

  useEffect(() => {
    currentZoom.current = zoomConfig.initialZoom;
    targetZoom.current = zoomConfig.initialZoom;

    const halfW = baseFrustumHalfWidth / zoomConfig.initialZoom;
    const halfH = baseFrustumHalfHeight / zoomConfig.initialZoom;
    orthoCamera.left = -halfW;
    orthoCamera.right = halfW;
    orthoCamera.top = halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.updateProjectionMatrix();

    clampTargetForZoom(
      targetPosition.current,
      halfW * 2,
      halfH * 2,
      baseWidth,
      baseHeight
    );
  }, [
    baseFrustumHalfHeight,
    baseFrustumHalfWidth,
    baseHeight,
    baseWidth,
    orthoCamera,
    zoomConfig.initialZoom,
  ]);

  useEffect(() => {
    if (!zoomConfig.enabled) {
      return;
    }

    const canvas = gl.domElement;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const oldZoom = targetZoom.current;
      const scaleFactor = 1 - event.deltaY * zoomConfig.scrollSpeed;
      const newZoom = Math.max(
        zoomConfig.minZoom,
        Math.min(zoomConfig.maxZoom, oldZoom * scaleFactor)
      );
      targetZoom.current = newZoom;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      const oldHalfW = baseFrustumHalfWidth / oldZoom;
      const oldHalfH = baseFrustumHalfHeight / oldZoom;
      const newHalfW = baseFrustumHalfWidth / newZoom;
      const newHalfH = baseFrustumHalfHeight / newZoom;

      targetPosition.current.x += ndcX * (oldHalfW - newHalfW);
      targetPosition.current.y += ndcY * (oldHalfH - newHalfH);

      clampTargetForZoom(
        targetPosition.current,
        newHalfW * 2,
        newHalfH * 2,
        baseWidth,
        baseHeight
      );
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [
    baseFrustumHalfHeight,
    baseFrustumHalfWidth,
    baseHeight,
    baseWidth,
    gl,
    zoomConfig.enabled,
    zoomConfig.maxZoom,
    zoomConfig.minZoom,
    zoomConfig.scrollSpeed,
  ]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    capturePointer(event);

    const screenPoint = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
    pointers.current.set(event.pointerId, screenPoint);

    if (pointers.current.size === 2 && zoomConfig.enabled) {
      dragState.current.isDragging = false;
      const [p1, p2] = Array.from(pointers.current.values());
      pinchState.current = {
        isPinching: true,
        initialDistance: getDistance(p1, p2),
        initialZoom: targetZoom.current,
      };
      return;
    }

    if (pointers.current.size === 1 && panConfig.enabled) {
      dragState.current.isDragging = true;
      dragState.current.previousScreenPoint = screenPoint;
    }
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const screenPoint = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
    pointers.current.set(event.pointerId, screenPoint);

    if (pinchState.current.isPinching && pointers.current.size === 2) {
      const [p1, p2] = Array.from(pointers.current.values());
      const currentDistance = getDistance(p1, p2);

      if (pinchState.current.initialDistance <= 0) {
        return;
      }

      const scale = currentDistance / pinchState.current.initialDistance;
      const oldZoom = targetZoom.current;
      const newZoom = Math.max(
        zoomConfig.minZoom,
        Math.min(zoomConfig.maxZoom, pinchState.current.initialZoom * scale)
      );
      targetZoom.current = newZoom;

      const midpoint = getMidpoint(p1, p2);
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((midpoint.x - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((midpoint.y - rect.top) / rect.height) * 2 - 1);

      const oldHalfW = baseFrustumHalfWidth / oldZoom;
      const oldHalfH = baseFrustumHalfHeight / oldZoom;
      const newHalfW = baseFrustumHalfWidth / newZoom;
      const newHalfH = baseFrustumHalfHeight / newZoom;

      targetPosition.current.x += ndcX * (oldHalfW - newHalfW);
      targetPosition.current.y += ndcY * (oldHalfH - newHalfH);

      clampTargetForZoom(
        targetPosition.current,
        newHalfW * 2,
        newHalfH * 2,
        baseWidth,
        baseHeight
      );
      return;
    }

    if (!dragState.current.isDragging) {
      return;
    }

    const currentScreenX = event.nativeEvent.clientX;
    const currentScreenY = event.nativeEvent.clientY;
    const screenDx = currentScreenX - dragState.current.previousScreenPoint.x;
    const screenDy = currentScreenY - dragState.current.previousScreenPoint.y;

    const frustumWidth = orthoCamera.right - orthoCamera.left;
    const frustumHeight = orthoCamera.top - orthoCamera.bottom;

    const worldDx = -(screenDx / size.width) * frustumWidth;
    const worldDy = (screenDy / size.height) * frustumHeight;

    targetPosition.current.x += worldDx;
    targetPosition.current.y += worldDy;
    clampTarget(targetPosition.current, orthoCamera, baseWidth, baseHeight);

    dragState.current.previousScreenPoint = {
      x: currentScreenX,
      y: currentScreenY,
    };
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    releasePointer(event);
    pointers.current.delete(event.pointerId);

    if (pinchState.current.isPinching) {
      pinchState.current.isPinching = false;

      if (pointers.current.size === 1 && panConfig.enabled) {
        const remaining = Array.from(pointers.current.values())[0];
        dragState.current.isDragging = true;
        dragState.current.previousScreenPoint = remaining;
      }
    }

    if (pointers.current.size === 0) {
      dragState.current.isDragging = false;
    }
  };

  useFrame(() => {
    const zoomDiff = targetZoom.current - currentZoom.current;
    if (Math.abs(zoomDiff) > 0.001) {
      currentZoom.current += zoomDiff * zoomConfig.easingFactor;

      const halfW = baseFrustumHalfWidth / currentZoom.current;
      const halfH = baseFrustumHalfHeight / currentZoom.current;
      orthoCamera.left = -halfW;
      orthoCamera.right = halfW;
      orthoCamera.top = halfH;
      orthoCamera.bottom = -halfH;
      orthoCamera.updateProjectionMatrix();
    }

    const dx = targetPosition.current.x - camera.position.x;
    const dy = targetPosition.current.y - camera.position.y;

    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      camera.position.x += dx * panConfig.easingFactor;
      camera.position.y += dy * panConfig.easingFactor;
    }
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
