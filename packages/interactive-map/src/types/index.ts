export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
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

export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
  zoomConfig?: ZoomConfig;
}
