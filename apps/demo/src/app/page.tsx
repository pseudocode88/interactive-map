import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "overlay",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: -50 },
  },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
      />
    </main>
  );
}
