import type { ReactNode } from "react";

export type EasingPreset = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Either a named preset or a custom cubic-bezier tuple [x1, y1, x2, y2].
 * Default is 'ease-in-out' for all animation types.
 */
export type EasingConfig = EasingPreset | [number, number, number, number];

export interface BounceAnimation {
  type: "bounce";
  /** Direction vector for bounce (normalized internally). Default: { x: 0, y: 1 } (vertical) */
  direction?: { x: number; y: number };
  /** Max displacement in pixels along the direction. Default: 20 */
  amplitude?: number;
  /** Duration of one full bounce cycle (up and back) in seconds. Default: 1 */
  duration?: number;
  /** Easing function for the bounce. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface CarouselAnimation {
  type: "carousel";
  /** Direction vector for movement (normalized internally). Default: { x: 1, y: 0 } (rightward) */
  direction?: { x: number; y: number };
  /** Movement speed in pixels per second. Default: 50 */
  speed?: number;
  /**
   * 'wrap' — layer re-enters from the opposite side when it exits base image bounds (seamless loop).
   * 'infinite' — layer keeps moving in one direction forever (eventually leaves visible area).
   * Default: 'wrap'
   */
  mode?: "wrap" | "infinite";
  /** Easing is not applicable for carousel (constant velocity). This field is ignored if provided. */
}

export interface FadeAnimation {
  type: "fade";
  /** Minimum opacity. Default: 0 */
  minOpacity?: number;
  /** Maximum opacity. Default: 1 */
  maxOpacity?: number;
  /** Duration of one full fade cycle (min → max → min) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the fade. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface WobbleAnimation {
  type: "wobble";
  /** Offset from center position in pixels. Layer sways between -offset and +offset. Default: { x: 10, y: 0 } */
  offset?: { x: number; y: number };
  /** Duration of one full wobble cycle (left → right → left) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the wobble. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export type LayerAnimation =
  | BounceAnimation
  | CarouselAnimation
  | FadeAnimation
  | WobbleAnimation;

export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  /** Single animation or array of parallel animations. */
  animation?: LayerAnimation | LayerAnimation[];
  /**
   * Override the auto-calculated parallax factor for this layer.
   * 1.0 = moves with camera (base layer speed).
   * < 1.0 = moves slower (feels farther).
   * > 1.0 = moves faster (feels closer).
   * Only used when parallaxConfig is provided on the map.
   */
  parallaxFactor?: number;
}

export interface PanConfig {
  enabled?: boolean;
  easingFactor?: number;
}

export interface ZoomConfig {
  enabled?: boolean;
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  scrollSpeed?: number;
  easingFactor?: number;
}

export interface ParallaxConfig {
  /** Global multiplier applied to auto-calculated parallax factors. Default: 0.3 */
  intensity?: number;
  /**
   * 'depth' — closer layers scale faster on zoom (pop-out effect).
   * 'drift' — zoom parallax only affects positional offset (layers spread apart).
   * Default: 'depth'
   */
  mode?: "depth" | "drift";
}

export interface MapMarker {
  /** X position in base image pixel coordinates (0 = left edge) */
  x: number;
  /** Y position in base image pixel coordinates (0 = top edge) */
  y: number;
  id: string;
  /** Text shown in tooltip on hover */
  label: string;
  /** Marker dot color (CSS color string). Default: "#ff4444" */
  color?: string;
}

export interface InteractiveMapProps {
  layers: MapLayer[];
  /** ID of the layer to use as the viewport reference. If not provided, defaults to the layer with the lowest zIndex. */
  baseLayerId?: string;
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
  zoomConfig?: ZoomConfig;
  /** Enable parallax effect. If not provided, parallax is disabled. */
  parallaxConfig?: ParallaxConfig;
  /** Array of markers to display on the map */
  markers?: MapMarker[];
  /** Called when a marker is clicked. Receives the marker ID. */
  onMarkerClick?: (markerId: string) => void;
  /**
   * Custom render function for marker visuals. Receives the marker data.
   * If not provided, the default pulsing dot is used.
   * The returned element replaces ONLY the dot visual, not the tooltip.
   */
  renderMarker?: (marker: MapMarker) => ReactNode;
  /**
   * Increment this number to trigger a zoom reset (zooms out to initialZoom).
   * Pan position is preserved. E.g. set to Date.now() or a counter.
   */
  resetZoomTrigger?: number;
}
