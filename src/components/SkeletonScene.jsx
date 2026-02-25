import { useRef, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Center } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from "@react-three/postprocessing";
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
        toneMappingExposure: 1.,
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
        position={[0, -1.05, 0]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#bbbbbb88" // Darker white for cell lines with reduced opacity
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#bbbbbb55" // Darker white for section lines with reduced opacity
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
      
      <EffectComposer>
        <Bloom 
          luminanceThreshold={0.2} 
          luminanceSmoothing={0.9} 
          height={300} 
          intensity={0.5} 
          mipmapBlur={true}
        />
        {/* <ChromaticAberration
          offset={[0.01, 0.002]} // RGB shift offset
          radialModulation={true} // Higher intensity at edges
          modulationOffset={0.5} // Center area unaffected
        /> */}
        {/* <Noise opacity={0.02} /> */}
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </Canvas>
  );
}
