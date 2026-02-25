import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard } from "@react-three/drei";
import * as THREE from "three";
import {
  scanlineVertexShader,
  scanlineFragmentShader,
} from "../shaders/scanlineShader";

function HotspotParticles({ count = 20, color, spread = 0.3, speed = 0.5 }) {
  const points = useRef();

  // Initial positions and random phases (spread controls distribution radius)
  const [initialPositions, phases] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const phs = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;

      phs[i * 3] = Math.random() * Math.PI * 2;
      phs[i * 3 + 1] = Math.random() * Math.PI * 2;
      phs[i * 3 + 2] = Math.random() * Math.PI * 2;
    }
    return [pos, phs];
  }, [count, spread]);

  useFrame((state) => {
    if (!points.current) return;
    const time = state.clock.getElapsedTime();
    const positions = points.current.geometry.attributes.position.array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Oscillate around initial position; speed scales animation rate
      positions[i3] = initialPositions[i3] + Math.sin(time * speed * 0.5 + phases[i3]) * 0.05;
      positions[i3 + 1] = initialPositions[i3 + 1] + Math.cos(time * speed * 0.3 + phases[i3 + 1]) * 0.05;
      positions[i3 + 2] = initialPositions[i3 + 2] + Math.sin(time * speed * 0.7 + phases[i3 + 2]) * 0.05;
    }
    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={new Float32Array(initialPositions)} 
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color={color}
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function InjuryHotspot({
  name,
  side,
  coordinates,
  description,
  color = "#39FF14",
  onHover,
  particleSpread,
  particleSpeed,
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

      {/* Floating particles for energy effect */}
      <HotspotParticles
        count={10}
        color={color}
        {...(particleSpread != null && { spread: particleSpread })}
        {...(particleSpeed != null && { speed: particleSpeed })}
      />

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
            className="absolute bottom-full mb-3 p-3 pointer-events-none w-54"
            style={{
              background: "rgba(10, 10, 10, 0.92)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `1px solid ${color}26`, // 15% opacity
              opacity: hovered ? 1 : 0,
              filter: hovered ? "blur(0px)" : "blur(12px)",
              transform: hovered ? "translateY(0) scale(1)" : "translateY(6px) scale(.6)",
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
