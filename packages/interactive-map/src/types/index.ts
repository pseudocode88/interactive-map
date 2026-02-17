export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
}

export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;
  height?: string;
  className?: string;
}
