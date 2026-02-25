import { useRef, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Center } from "@react-three/drei";
import * as THREE from "three";
import { Model } from "./Skull";
import InjuryHotspot from "./InjuryHotspot";

function SkeletonModel() {
  const groupRef = useRef();

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.color.set("#ccc8bb");
        child.material.roughness = 0.75;
        child.material.metalness = 0.05;
        child.material.envMapIntensity = 0.4;
      }
    });
  }, []);

  return (
    <group ref={groupRef}>
      <Model />
    </group>
  );
}

export default function SkeletonScene({ injuredJoints = [], riskColor = "#39FF14" }) {
  const [isInteracting, setIsInteracting] = useState(false);

  return (
    <Canvas
      camera={{ position: [2, 1.2, 2.5], fov: 40 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
    >
      <color attach="background" args={["#0a0a0a"]} />
      <fog attach="fog" args={["#0a0a0a", 5, 12]} />

      {/* Three-point + accent rim lighting */}
      <ambientLight intensity={0.35} color="#e0ddd5" />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.4}
        color="#fff8f0"
        castShadow
      />
      <directionalLight position={[-2, 3, -1]} intensity={0.3} color="#9090cc" />
      <spotLight
        position={[0, 4, -3]}
        intensity={0.6}
        color={riskColor}
        angle={0.4}
        penumbra={1}
      />

      <Center>
        <SkeletonModel />
      </Center>

      {injuredJoints.map((joint, i) => (
        <InjuryHotspot 
          key={i} 
          {...joint} 
          color={riskColor} 
          onHover={setIsInteracting}
        />
      ))}

      <Grid
        position={[0, -0.5, 0]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.4}
        cellColor="#161616"
        sectionSize={2}
        sectionThickness={0.8}
        sectionColor="#1f1f1f"
        fadeDistance={10}
        fadeStrength={1.5}
      />

      <OrbitControls
        target={[0, 0, 0]}
        minDistance={2}
        maxDistance={5}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.75}
        enablePan={false}
        autoRotate={!isInteracting}
        autoRotateSpeed={0.3}
      />
    </Canvas>
  );
}
