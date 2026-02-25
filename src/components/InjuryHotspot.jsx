import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard } from "@react-three/drei";
import * as THREE from "three";
import {
  scanlineVertexShader,
  scanlineFragmentShader,
} from "../shaders/scanlineShader";

export default function InjuryHotspot({
  name,
  side,
  coordinates,
  description,
  color = "#39FF14",
  onHover,
}) {
  const shaderRef = useRef();
  const [hovered, setHovered] = useState(false);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0.9 },
    }),
    [color],
  );

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group position={[coordinates.x, coordinates.y, coordinates.z]}>
      {/* Scanline shader disc — always faces camera */}
      <Billboard>
        <mesh>
          <circleGeometry args={[0.18, 64]} />
          <shaderMaterial
            ref={shaderRef}
            vertexShader={scanlineVertexShader}
            fragmentShader={scanlineFragmentShader}
            uniforms={uniforms}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </Billboard>

      {/* Local accent glow */}
      <pointLight color={color} intensity={0.5} distance={0.8} decay={2} />

      {/* HTML overlay marker */}
      <Html
        center
        distanceFactor={5}
        zIndexRange={[50, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => {
            setHovered(true);
            onHover?.(true);
          }}
          onMouseLeave={() => {
            setHovered(false);
            onHover?.(false);
          }}
        >
          {/* Diamond marker */}
          <div
            className="w-3 h-3 cursor-pointer shrink-0"
            style={{
              background: color,
              transform: "rotate(45deg)",
              boxShadow: `0 0 12px ${color}, 0 0 4px ${color}`,
              animation: "hotspot-pulse 2s ease-in-out infinite",
            }}
          />

          {/* Expandable info card */}
          <div
            className="absolute bottom-full mb-3 p-3 pointer-events-none w-64"
            style={{
              background: "rgba(10, 10, 10, 0.92)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `1px solid ${color}26`, // 15% opacity
              opacity: hovered ? 1 : 0,
              filter: hovered ? "blur(0px)" : "blur(12px)",
              transform: hovered ? "translateY(0)" : "translateY(6px)",
              transition: "all 0.6s cubic-bezier(0.5, 0, 0, 1)",
              pointerEvents: hovered ? "auto" : "none",
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <div
                className="w-1.5 h-1.5 shrink-0"
                style={{ background: color }}
              />
              <span
                className="text-2xl font-heading uppercase whitespace-nowrap"
                style={{ color: color }}
              >
                {name} — {side}
              </span>
            </div>
            <p className="text-[8px] leading-[1.1] text-white/50 m-0">
              {description}
            </p>
          </div>
        </div>
      </Html>
    </group>
  );
}
