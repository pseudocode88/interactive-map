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

export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
}
