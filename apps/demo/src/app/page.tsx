import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "cloud-back", 
    src: "/overlay-cloud-back.png", 
    zIndex: -1,
    animation: [
      {
        type: "wobble" as const,
        offset: { x: 10, y: 0 },
        duration: 10
      }
    ] 
  },
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud-front",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: -10 },
    animation: [
      {
        type: "bounce" as const,
        direction: { x: 0, y: 10 },
        amplitude: 15,
        duration: 2,
        easing: "ease-in-out" as const,
      },
      { type: "fade" as const, minOpacity: 0.4, maxOpacity: 1, duration: 3 },
    ],
  },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7" }}>
      <InteractiveMap
        layers={layers}
        baseLayerId="base"
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 2, initialZoom: 1.2 }}
      />
    </main>
  );
}
