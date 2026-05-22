import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, Plane, Cylinder, Html, Environment, SpotLight, Trail, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import './App.css';

// --- CONFIGURATION ---
const LANE_WIDTH = 8;
const STOP_LINE = 14; 
const SPEED_MODIFIER = 0.5;

const generateId = () => Math.random().toString(36).substr(2, 6).toUpperCase();

// Global mutable store for physics coordinates avoiding React re-renders
const vehicleTracker = {};

// --- REALISTIC MATERIALS ---
const asphaltMaterial = new THREE.MeshStandardMaterial({ 
  color: '#111316', 
  roughness: 0.6, 
  metalness: 0.1 
});

const sidewalkMaterial = new THREE.MeshStandardMaterial({ 
  color: '#2a2d34', 
  roughness: 0.9, 
  metalness: 0.05 
});

const buildingMaterials = [
  new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.8, metalness: 0.2 }),
  new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.4, metalness: 0.8 }), // Glassy
  new THREE.MeshStandardMaterial({ color: '#21252b', roughness: 0.9, metalness: 0.1 })
];

const windowMaterial = new THREE.MeshStandardMaterial({ 
  color: '#fcd34d', 
  emissive: '#fbad00', 
  emissiveIntensity: 2.0, 
  toneMapped: false 
});

// --- PROCEDURAL TREES ---
function Tree({ position }) {
  const { height, leafSize } = useMemo(() => ({
    height: 4 + Math.random() * 4,
    leafSize: 1.8 + Math.random() * 1.5,
  }), []);
  return (
    <group position={position}>
      <Cylinder args={[0.2, 0.3, height]} position={[0, height / 2, 0]} castShadow>
        <meshStandardMaterial color="#231a0e" roughness={0.95} />
      </Cylinder>
      <mesh position={[0, height * 0.78, 0]} castShadow>
        <dodecahedronGeometry args={[leafSize * 1.15, 1]} />
        <meshStandardMaterial color="#0c1c0d" roughness={0.88} />
      </mesh>
      <mesh position={[0, height * 1.12, 0]} castShadow>
        <dodecahedronGeometry args={[leafSize * 0.7, 1]} />
        <meshStandardMaterial color="#112214" roughness={0.82} />
      </mesh>
    </group>
  );
}

// --- L-SHAPED LAMP POST ---
function LampPost({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <Cylinder args={[0.26, 0.32, 0.45]} position={[0, 0.22, 0]}>
        <meshStandardMaterial color="#1c2230" roughness={0.7} metalness={0.6} />
      </Cylinder>
      <Cylinder args={[0.1, 0.13, 9]} position={[0, 4.9, 0]}>
        <meshStandardMaterial color="#253040" roughness={0.5} metalness={0.8} />
      </Cylinder>
      <Box args={[4.6, 0.13, 0.13]} position={[-2.3, 9.2, 0]}>
        <meshStandardMaterial color="#253040" roughness={0.5} metalness={0.8} />
      </Box>
      <Box args={[1.9, 0.42, 0.58]} position={[-4.4, 9.05, 0]}>
        <meshStandardMaterial color="#0c1220" roughness={0.2} metalness={0.9} />
      </Box>
      <mesh position={[-4.4, 8.82, 0]}>
        <planeGeometry args={[1.65, 0.22]} />
        <meshStandardMaterial color="#ffe8a8" emissive="#ffcc44" emissiveIntensity={5.0} toneMapped={false} />
      </mesh>
      <pointLight position={[-4.4, 8.2, 0]} color="#ffcc44" intensity={22} distance={30} decay={2} />
    </group>
  );
}

// --- 3D ENVIRONMENT ---
function EnvironmentScene() {
  const { buildings, treePositions } = useMemo(() => {
    const b = [];
    const positions = [
      [-60, -60], [-90, -40], [-40, -90],
      [60, 60], [90, 40], [40, 90],
      [60, -60], [90, -40], [40, -90],
      [-60, 60], [-90, 40], [-40, 90],
      [-130, -65], [-65, -130],
      [130, 65], [65, 130],
      [130, -65], [65, -130],
      [-130, 65], [-65, 130],
    ];
    positions.forEach((pos, index) => {
      const h = 25 + Math.random() * 75;
      const w = 16 + Math.random() * 14;
      const d = 16 + Math.random() * 14;
      const floors = Math.floor(h / 4);
      b.push({
        x: pos[0], z: pos[1], w, d, h,
        mat: buildingMaterials[index % buildingMaterials.length],
        isGlass: index % 3 === 1,
        windowsLit: Array.from({ length: floors }, () => Math.random() > 0.42),
        rooftopSeed: Math.random(),
        acW: 3 + Math.random() * 4,
        acD: 2 + Math.random() * 2,
      });
    });

    const trees = [];
    for (let z = -130; z <= 130; z += 16) {
      if (Math.abs(z) > 22) {
        trees.push([22, 0, z]);
        trees.push([-22, 0, z]);
      }
    }
    for (let x = -130; x <= 130; x += 16) {
      if (Math.abs(x) > 22) {
        trees.push([x, 0, 22]);
        trees.push([x, 0, -22]);
      }
    }
    return { buildings: b, treePositions: trees };
  }, []);

  const cwOffsets = [-7.2, -5.2, -3.2, -1.2, 1.2, 3.2, 5.2, 7.2];
  const centerDashes = Array.from({ length: 18 }, (_, i) => -144 + i * 17).filter(v => Math.abs(v) > 23);

  return (
    <group>
      {/* Base ground */}
      <Plane args={[500, 500]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]} receiveShadow>
        <meshStandardMaterial color="#090b0f" roughness={0.98} />
      </Plane>
      {/* City block ground in corners */}
      {[[-120, -120], [120, -120], [-120, 120], [120, 120]].map(([x, z], i) => (
        <Plane key={`blk-${i}`} args={[200, 200]} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.1, z]} receiveShadow>
          <meshStandardMaterial color="#0b0d11" roughness={0.97} />
        </Plane>
      ))}

      {/* === SIDEWALKS === */}
      <Box args={[14, 0.28, 260]} position={[27, 0.09, 0]} receiveShadow>
        <meshStandardMaterial color="#1e2128" roughness={0.96} metalness={0.02} />
      </Box>
      <Box args={[14, 0.28, 260]} position={[-27, 0.09, 0]} receiveShadow>
        <meshStandardMaterial color="#1e2128" roughness={0.96} metalness={0.02} />
      </Box>
      <Box args={[260, 0.28, 14]} position={[0, 0.09, 27]} receiveShadow>
        <meshStandardMaterial color="#1e2128" roughness={0.96} metalness={0.02} />
      </Box>
      <Box args={[260, 0.28, 14]} position={[0, 0.09, -27]} receiveShadow>
        <meshStandardMaterial color="#1e2128" roughness={0.96} metalness={0.02} />
      </Box>

      {/* === CURBS === */}
      {[[20, 0, 260, true], [-20, 0, 260, true], [260, 0, 20, false], [260, 0, -20, false]].map(([x, z, len, ns], i) => (
        <Box key={`curb-${i}`} args={ns ? [0.38, 0.32, len] : [len, 0.32, 0.38]} position={[x, 0.11, z]}>
          <meshStandardMaterial color="#363a45" roughness={0.9} />
        </Box>
      ))}

      {/* === ROADS === */}
      <Plane args={[300, 40]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color="#131a27" roughness={0.78} metalness={0.06} />
      </Plane>
      <Plane args={[40, 300]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#131a27" roughness={0.78} metalness={0.06} />
      </Plane>
      <Box args={[40, 0.22, 40]} position={[0, 0.13, 0]} receiveShadow>
        <meshStandardMaterial color="#1c2438" roughness={0.9} metalness={0.05} />
      </Box>

      {/* === LANE MARKINGS — white dashes === */}
      {[-115, -85, -55, -25, 25, 55, 85, 115].map((z, i) => (
        <Plane key={`ns-${i}`} args={[0.65, 8]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, z]}>
          <meshStandardMaterial color="#dde0e8" emissive="#dde0e8" emissiveIntensity={0.5} toneMapped={false} />
        </Plane>
      ))}
      {[-115, -85, -55, -25, 25, 55, 85, 115].map((x, i) => (
        <Plane key={`ew-${i}`} args={[8, 0.65]} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.17, 0]}>
          <meshStandardMaterial color="#dde0e8" emissive="#dde0e8" emissiveIntensity={0.5} toneMapped={false} />
        </Plane>
      ))}

      {/* === YELLOW CENTER LINES === */}
      {centerDashes.map((z, i) => (
        <Plane key={`yns-${i}`} args={[0.28, 8]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, z]}>
          <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.9} toneMapped={false} />
        </Plane>
      ))}
      {centerDashes.map((x, i) => (
        <Plane key={`yew-${i}`} args={[8, 0.28]} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.18, 0]}>
          <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.9} toneMapped={false} />
        </Plane>
      ))}

      {/* === STOP LINES === */}
      {[[0, 0.18, 23, [19, 0.7]], [0, 0.18, -23, [19, 0.7]], [23, 0.18, 0, [0.7, 19]], [-23, 0.18, 0, [0.7, 19]]].map(([x, y, z, size], i) => (
        <Plane key={`stop-${i}`} args={size} rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]}>
          <meshStandardMaterial color="#f0f0f0" emissive="#f0f0f0" emissiveIntensity={0.65} toneMapped={false} />
        </Plane>
      ))}

      {/* === CROSSWALKS (4 approaches) === */}
      {cwOffsets.map((x, i) => (
        <Plane key={`cwN-${i}`} args={[1.1, 5.5]} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.18, 26]}>
          <meshStandardMaterial color="#e8e8e8" emissive="#e8e8e8" emissiveIntensity={0.55} toneMapped={false} />
        </Plane>
      ))}
      {cwOffsets.map((x, i) => (
        <Plane key={`cwS-${i}`} args={[1.1, 5.5]} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.18, -26]}>
          <meshStandardMaterial color="#e8e8e8" emissive="#e8e8e8" emissiveIntensity={0.55} toneMapped={false} />
        </Plane>
      ))}
      {cwOffsets.map((z, i) => (
        <Plane key={`cwE-${i}`} args={[5.5, 1.1]} rotation={[-Math.PI / 2, 0, 0]} position={[26, 0.18, z]}>
          <meshStandardMaterial color="#e8e8e8" emissive="#e8e8e8" emissiveIntensity={0.55} toneMapped={false} />
        </Plane>
      ))}
      {cwOffsets.map((z, i) => (
        <Plane key={`cwW-${i}`} args={[5.5, 1.1]} rotation={[-Math.PI / 2, 0, 0]} position={[-26, 0.18, z]}>
          <meshStandardMaterial color="#e8e8e8" emissive="#e8e8e8" emissiveIntensity={0.55} toneMapped={false} />
        </Plane>
      ))}

      {/* === BUILDINGS WITH WINDOWS & ROOFTOP DETAILS === */}
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2 - 0.2, b.z]}>
          {/* Body */}
          <Box args={[b.w, b.h, b.d]} castShadow receiveShadow material={b.mat} />
          {/* Ground floor plinth */}
          <Box args={[b.w + 1.2, 3.2, b.d + 1.2]} position={[0, -b.h / 2 + 1.6, 0]}>
            <meshStandardMaterial color="#16191f" roughness={0.9} metalness={0.15} />
          </Box>
          {/* Window strips — front face */}
          {b.windowsLit.map((lit, f) => lit ? (
            <mesh key={`wf-${f}`} position={[0, -b.h / 2 + f * 4 + 2.5, b.d / 2 + 0.07]}>
              <planeGeometry args={[b.w * 0.76, 1.4]} />
              <meshStandardMaterial
                color={b.isGlass ? '#a8d8ff' : '#fbbf24'}
                emissive={b.isGlass ? '#3b82f6' : '#d97706'}
                emissiveIntensity={b.isGlass ? 1.3 : 2.0}
                toneMapped={false} transparent opacity={0.88}
              />
            </mesh>
          ) : null)}
          {/* Window strips — side face */}
          {b.windowsLit.map((lit, f) => lit ? (
            <mesh key={`ws-${f}`} position={[b.w / 2 + 0.07, -b.h / 2 + f * 4 + 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[b.d * 0.76, 1.4]} />
              <meshStandardMaterial
                color={b.isGlass ? '#a8d8ff' : '#fbbf24'}
                emissive={b.isGlass ? '#3b82f6' : '#d97706'}
                emissiveIntensity={b.isGlass ? 1.3 : 2.0}
                toneMapped={false} transparent opacity={0.88}
              />
            </mesh>
          ) : null)}
          {/* Rooftop AC unit */}
          <Box args={[b.acW, 1.6, b.acD]} position={[b.w * 0.18, b.h / 2 + 0.8, b.d * 0.1]}>
            <meshStandardMaterial color="#252b36" roughness={0.7} metalness={0.5} />
          </Box>
          <Box args={[b.acW * 0.6, 0.5, b.acD * 0.6]} position={[b.w * 0.18, b.h / 2 + 1.85, b.d * 0.1]}>
            <meshStandardMaterial color="#1a1f28" roughness={0.6} metalness={0.6} />
          </Box>
          {/* Rooftop antenna */}
          {b.rooftopSeed > 0.45 && (
            <Cylinder args={[0.07, 0.07, 5.5]} position={[-b.w * 0.22, b.h / 2 + 2.75, b.d * 0.18]}>
              <meshStandardMaterial color="#1a1d24" roughness={0.5} metalness={0.9} />
            </Cylinder>
          )}
          {/* Rooftop water tank */}
          {b.rooftopSeed > 0.7 && (
            <Cylinder args={[1.1, 1.1, 2.2]} position={[b.w * 0.25, b.h / 2 + 1.1, -b.d * 0.2]}>
              <meshStandardMaterial color="#1e2530" roughness={0.8} metalness={0.4} />
            </Cylinder>
          )}
        </group>
      ))}

      {/* === TREES ALONG SIDEWALKS === */}
      {treePositions.map((pos, i) => (
        <Tree key={`tree-${i}`} position={pos} />
      ))}

      {/* === L-SHAPED LAMP POSTS === */}
      {[-95, -60, -28, 28, 60, 95].map((pos, i) => (
        <group key={`lamps-${i}`}>
          <LampPost position={[21, 0, pos]} rotation={[0, 0, 0]} />
          <LampPost position={[-21, 0, pos]} rotation={[0, Math.PI, 0]} />
          <LampPost position={[pos, 0, 21]} rotation={[0, Math.PI / 2, 0]} />
          <LampPost position={[pos, 0, -21]} rotation={[0, -Math.PI / 2, 0]} />
        </group>
      ))}
    </group>
  );
}

// Glowing Traffic Lights
function TrafficLight({ position, rotation, state }) {
  const getCol = (c) => c === state ? (c === 'RED' ? '#ff003c' : c === 'YELLOW' ? '#ffaa00' : '#00ffaa') : '#111';
  const getIntens = (c) => c === state ? 5.0 : 0.0;

  return (
    <group position={position} rotation={rotation}>
      <Cylinder args={[0.3, 0.5, 18]} position={[0, 9, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1a1c23" metalness={0.9} roughness={0.5} />
      </Cylinder>
      <Box args={[9, 0.5, 0.5]} position={[-4.5, 18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1a1c23" metalness={0.9} />
      </Box>
      <Box args={[5, 1.5, 1.5]} position={[-7.5, 18, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#000000" />
      </Box>
      
      {/* Stoplight Lenses with Bloom Support */}
      <mesh position={[-6, 18, 0.8]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color={getCol('GREEN')} emissive={getCol('GREEN')} emissiveIntensity={getIntens('GREEN')} toneMapped={false} />
      </mesh>
      <mesh position={[-7.5, 18, 0.8]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color={getCol('YELLOW')} emissive={getCol('YELLOW')} emissiveIntensity={getIntens('YELLOW')} toneMapped={false} />
      </mesh>
      <mesh position={[-9, 18, 0.8]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color={getCol('RED')} emissive={getCol('RED')} emissiveIntensity={getIntens('RED')} toneMapped={false} />
      </mesh>
    </group>
  );
}

// --- HYPER-REALISTIC VEHICLE MODELS ---
const VehicleModel = React.forwardRef(({ type, color }, ref) => {
  const wheelRefs = useRef([]);

  useFrame(() => {
    // Spin wheels
    wheelRefs.current.forEach(w => {
      if (w) w.rotation.x -= 0.1 * SPEED_MODIFIER;
    });
  });

  const getHeadlights = () => (
    <>
      {/* Headlight Meshes */}
       <Box args={[0.6, 0.3, 0.1]} position={[-0.8, 1.2, -2.8]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={4.0} toneMapped={false} />
       </Box>
       <Box args={[0.6, 0.3, 0.1]} position={[0.8, 1.2, -2.8]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={4.0} toneMapped={false} />
       </Box>
       {/* Real Spotlights */}
       <SpotLight position={[-0.8, 1.2, -2.8]} target-position={[-0.8, 0, -20]} distance={40} angle={0.4} attenuation={5} intensity={250} color="#e0f7ff" penumbra={0.3} castShadow />
       <SpotLight position={[0.8, 1.2, -2.8]} target-position={[0.8, 0, -20]} distance={40} angle={0.4} attenuation={5} intensity={250} color="#e0f7ff" penumbra={0.3} castShadow />
    </>
  );

  const getTaillights = (zPos) => (
    <>
      <Box args={[0.5, 0.2, 0.1]} position={[-0.8, 1.2, zPos]}>
         <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={3.0} toneMapped={false} />
      </Box>
      <Box args={[0.5, 0.2, 0.1]} position={[0.8, 1.2, zPos]}>
         <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={3.0} toneMapped={false} />
      </Box>
    </>
  );

  if (type === 'Person') {
    return (
      <group>
        {/* Legs */}
        <Box args={[0.5, 1.2, 0.4]} position={[0, 0.6, 0]} castShadow receiveShadow>
           <meshStandardMaterial color="#0f0f0f" />
        </Box>
        {/* Torso */}
        <Box args={[0.8, 1.2, 0.5]} position={[0, 1.8, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.8} />
        </Box>
        {/* Head */}
        <mesh position={[0, 2.7, 0]} castShadow receiveShadow>
           <sphereGeometry args={[0.35, 16, 16]} />
           <meshStandardMaterial color="#fcd5ce" roughness={0.5} />
        </mesh>
      </group>
    );
  }

  if (type === 'Truck') {
    return (
      <group ref={ref}>
        {/* Cab */}
        <Box args={[3, 3.5, 3]} position={[0, 2.8, -3.5]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.2} metalness={0.7} />
        </Box>
        {/* Cargo Container */}
        <Box args={[3.2, 4.5, 8]} position={[0, 3.3, 2]} castShadow receiveShadow>
          <meshStandardMaterial color="#c2c5cc" roughness={0.5} />
        </Box>
        {getHeadlights()}
        {getTaillights(6.1)}
        {/* Wheels */}
        {[[-1.6,-3], [1.6,-3], [-1.6, 1], [1.6, 1], [-1.6, 4], [1.6, 4]].map((pos, i) => (
          <group key={i} position={[pos[0], 1.2, pos[1]]} ref={el => wheelRefs.current[i] = el}>
             <Cylinder args={[1.2, 1.2, 0.8]} rotation={[0, 0, Math.PI/2]} castShadow>
               <meshStandardMaterial color="#1a1c23" roughness={0.9} />
             </Cylinder>
             {/* Rim */}
             <Cylinder args={[0.8, 0.8, 0.82]} rotation={[0, 0, Math.PI/2]}>
               <meshStandardMaterial color="#a0aec0" metalness={0.9} roughness={0.1} />
             </Cylinder>
          </group>
        ))}
      </group>
    );
  }
  
  if (type === 'Bike') {
    return (
      <group ref={ref}>
        <Box args={[0.8, 1, 3]} position={[0, 1.2, 0]} castShadow>
           <meshStandardMaterial color={color} roughness={0.3} metalness={0.8} />
        </Box>
        {/* Headlight */}
        <Box args={[0.4, 0.4, 0.1]} position={[0, 1.6, -1.6]}>
           <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={5.0} toneMapped={false} />
        </Box>
        <SpotLight position={[0, 1.6, -1.6]} target-position={[0, 0, -20]} distance={40} angle={0.4} attenuation={5} intensity={200} color="#e0f7ff" castShadow />
        
        {/* Taillight */}
        <Box args={[0.3, 0.3, 0.1]} position={[0, 1.5, 1.6]}>
           <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={4.0} toneMapped={false} />
        </Box>

        {/* Wheels */}
        {[[-1.2], [1.2]].map((zPos, i) => (
          <group key={i} position={[0, 0.7, zPos]} ref={el => wheelRefs.current[i] = el}>
            <Cylinder args={[0.7, 0.7, 0.3]} rotation={[0, 0, Math.PI/2]} castShadow>
               <meshStandardMaterial color="#1a1c23" />
            </Cylinder>
            <Cylinder args={[0.5, 0.5, 0.35]} rotation={[0, 0, Math.PI/2]}>
               <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} />
            </Cylinder>
          </group>
        ))}
      </group>
    );
  }

  // Standard Car
  return (
    <group ref={ref}>
      {/* Base Body - More aerodynamic curve */}
      <Box args={[2.5, 1.2, 5.5]} position={[0, 1.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.8} clearcoat={1.0} clearcoatRoughness={0.1} />
      </Box>
      {/* Glass Cabin */}
      <Box args={[2.2, 1.0, 3]} position={[0, 2.3, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color="#000" transparent opacity={0.8} roughness={0.0} metalness={1.0} />
      </Box>
      
      {getHeadlights()}
      {getTaillights(2.8)}

      {/* Wheels */}
      {[[-1.25,-1.8], [1.25,-1.8], [-1.25,1.8], [1.25,1.8]].map((pos, i) => (
        <group key={i} position={[pos[0], 0.8, pos[1]]} ref={el => wheelRefs.current[i] = el}>
           <Cylinder args={[0.8, 0.8, 0.4]} rotation={[0, 0, Math.PI/2]} castShadow>
             <meshStandardMaterial color="#1a1c23" roughness={0.9} />
           </Cylinder>
           <Cylinder args={[0.5, 0.5, 0.45]} rotation={[0, 0, Math.PI/2]}>
             <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
           </Cylinder>
        </group>
      ))}
    </group>
  );
});

// --- PHYSICS CONTROLLER MESH ---
function VehicleMesh({ id, type, direction, getLightState, removeMe }) {
  const ref = useRef();
  const innerRef = useRef(); // Ref for the spinning/animated part

  const specs = useMemo(() => {
    if (type === 'Person') return { speed: 0.12, color: '#10b981', clearance: 2 };
    if (type === 'Bike') return { speed: 0.65, color: '#f59e0b', clearance: 6 };
    if (type === 'Truck') return { speed: 0.28, color: '#e2e8f0', clearance: 15 }; // White/Silver Truck
    return { speed: 0.5, color: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random()*5)], clearance: 8 };
  }, [type]);

  const [currentSpeed, setCurrentSpeed] = useState(specs.speed);

  useEffect(() => {
    const startDist = 500; 
    const laneOffset = type === 'Person' ? (LANE_WIDTH + 3) : (LANE_WIDTH / 2);
    
    if (direction === 'N') { 
      ref.current.position.set(laneOffset, 0, startDist);
    } else if (direction === 'S') { 
      ref.current.position.set(-laneOffset, 0, -startDist);
      ref.current.rotation.y = Math.PI;
    } else if (direction === 'E') { 
      ref.current.position.set(-startDist, 0, laneOffset);
      ref.current.rotation.y = -Math.PI / 2;
    } else if (direction === 'W') { 
      ref.current.position.set(startDist, 0, -laneOffset);
      ref.current.rotation.y = Math.PI / 2;
    }
  }, [direction, specs]);

  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.position;
    
    // Register position globally
    vehicleTracker[id] = { pos: pos.clone(), dir: direction, type };

    let facingLight = '';
    let distanceToStop = 0;

    if (direction === 'N' || direction === 'S') {
      facingLight = getLightState('NS');
      distanceToStop = direction === 'N' ? (pos.z - STOP_LINE) : (-pos.z - STOP_LINE);
    } else {
      facingLight = getLightState('EW');
      distanceToStop = direction === 'E' ? (-pos.x - STOP_LINE) : (pos.x - STOP_LINE);
    }

    let shouldMove = true;
    
    if (facingLight === 'RED' && distanceToStop > 0 && distanceToStop < (specs.clearance + 15)) {
      shouldMove = false;
    }

    for (let currentId in vehicleTracker) {
      if (currentId !== id) {
        const other = vehicleTracker[currentId];
        let sameLane = false;
        if ((direction === 'N' || direction === 'S') && Math.abs(pos.x - other.pos.x) < 1) sameLane = true;
        if ((direction === 'E' || direction === 'W') && Math.abs(pos.z - other.pos.z) < 1) sameLane = true;

        if (other.dir === direction && sameLane) { 
          let distAhead = null;
          if (direction === 'N') distAhead = pos.z - other.pos.z;
          else if (direction === 'S') distAhead = other.pos.z - pos.z;
          else if (direction === 'E') distAhead = other.pos.x - pos.x;
          else if (direction === 'W') distAhead = pos.x - other.pos.x;
          
          if (distAhead > 0 && distAhead < (specs.clearance + 15)) {
            shouldMove = false;
          }
        }
      }
    }

    let actualSpeed = specs.speed;
    if (shouldMove) {
      ref.current.translateZ(-specs.speed * SPEED_MODIFIER); 
    } else {
      actualSpeed = 0;
    }
    
    if (Math.abs(currentSpeed - actualSpeed) > 0.01) {
       setCurrentSpeed(actualSpeed);
    }

    // Stop wheel rotation if stopped (handled inside the VehicleModel, but we can pause it by passing speed later. For now it rotates automatically)

    if (Math.abs(pos.x) > 600 || Math.abs(pos.z) > 600) {
      delete vehicleTracker[id]; 
      removeMe(id);
    }
  });

  const displaySpeed = Math.floor(currentSpeed * 100 * (SPEED_MODIFIER * 5));
  const tBox = type === 'Person' ? [1.5, 3.5, 1.5] : type === 'Truck' ? [5, 6, 14] : type === 'Bike' ? [3, 4, 6] : [4, 4, 8];

  return (
    <group ref={ref}>
      <VehicleModel type={type} color={specs.color} ref={innerRef} />
      
      {/* Semi-transparent Bounding Tracker Box - More cyber vibe */}
      <mesh position={[0, tBox[1]/2, 0]}>
        <boxGeometry args={tBox} />
        <meshBasicMaterial color="#00ffcc" wireframe transparent opacity={0.2} toneMapped={false} />
      </mesh>

    </group>
  );
}

// --- REACT APP EXPORT ---
export default function App() {
  const [lightPhase, setLightPhase] = useState(0);

  useEffect(() => {
    const timings = [7500, 3000, 7500, 3000]; 
    const timer = setTimeout(() => {
      setLightPhase((p) => (p + 1) % 4);
    }, timings[lightPhase]);
    return () => clearTimeout(timer);
  }, [lightPhase]);

  const getLightState = (axis) => {
    if (axis === 'NS') {
      if (lightPhase === 0) return 'GREEN';
      if (lightPhase === 1) return 'YELLOW';
      return 'RED';
    }
    if (axis === 'EW') {
      if (lightPhase === 2) return 'GREEN';
      if (lightPhase === 3) return 'YELLOW';
      return 'RED';
    }
  };

  const [vehicles, setVehicles] = useState([]);
  
  const spawnVehicle = (type, direction) => {
    setVehicles(prev => [...prev, { id: generateId(), type, direction }]);
  };

  return (
    <div className="app-wrapper">
      <div className="ui-container glass-panel">
        <div className="sidebar">
          <h1 className="cyber-title">A.I. MATRIX // LIVE</h1>
          <p className="cyber-subtitle">High-Fidelity Traffic Digital Twin</p>
          
          <div className="dashboard-stats">
            <div className="stat-box">
              <div className="stat-value neon-blue">{vehicles.length}</div>
              <div className="stat-label">Active Entities</div>
            </div>
            <div className="stat-box">
              <div className="stat-value neon-green">SECURE</div>
              <div className="stat-label">Traffic Status</div>
            </div>
          </div>

          <div className="hud-panel">
            <h3 className="hud-title">Deploy Target Nodes</h3>
            <div className="spawn-grid">
              <button className="spawn-btn" onClick={() => spawnVehicle('Car', 'N')}>Car [North ⬇️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Bike', 'S')}>Bike [South ⬆️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Truck', 'E')}>Truck [East ⬅️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Car', 'W')}>Car [West ➡️]</button>
              <button className="spawn-btn person-btn" onClick={() => spawnVehicle('Person', 'N')}>Person [North ⬇️]</button>
              <button className="spawn-btn person-btn" onClick={() => spawnVehicle('Person', 'E')}>Person [East ⬅️]</button>
            </div>
          </div>
        </div>
        
        <div className="canvas-container">
          <div className="hud-reticle"></div>
          <div className="crosshair-text">Rendering: Ultra Settings // Night Mode // Bloom Active</div>
        </div>
      </div>

      <Canvas shadows flat camera={{ position: [-60, 45, -60], fov: 50 }}>
        {/* Dark night sky */}
        <color attach="background" args={['#081323']} />
        <fog attach="fog" args={['#081323', 30, 320]} />
        
        {/* High-quality Post Processing Pipeline */}
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={1.0} mipmapBlur intensity={1.5} />
        </EffectComposer>

        <Environment preset="night" />

        <ambientLight intensity={0.2} />
        <hemisphereLight skyColor="#8fb8ff" groundColor="#10121a" intensity={0.35} />
        <pointLight position={[25, 20, 25]} intensity={1.4} distance={200} color="#d9f3ff" />
        <ambientLight intensity={0.28} />
        <hemisphereLight skyColor="#98c8ff" groundColor="#0c1320" intensity={0.25} />
        <pointLight position={[0, 35, 0]} color="#b4d6ff" intensity={1.1} distance={180} />
        <pointLight position={[30, 20, -30]} color="#ffd6a6" intensity={0.7} distance={120} />
        {/* Moonlight */}
        <directionalLight 
           position={[100, 200, 50]} 
           intensity={0.4} 
           color="#c4d7ee"
           castShadow 
           shadow-mapSize={[4096, 4096]} 
           shadow-camera-left={-200}
           shadow-camera-right={200}
           shadow-camera-top={200}
           shadow-camera-bottom={-200}
           shadow-bias={-0.0002}
        />

        <EnvironmentScene />
        
        <TrafficLight position={[-20, 0, -20]} rotation={[0, 0, 0]} state={getLightState('EW')} />
        <TrafficLight position={[20, 0, 20]} rotation={[0, Math.PI, 0]} state={getLightState('EW')} />
        <TrafficLight position={[-20, 0, 20]} rotation={[0, Math.PI/2, 0]} state={getLightState('NS')} />
        <TrafficLight position={[20, 0, -20]} rotation={[0, -Math.PI/2, 0]} state={getLightState('NS')} />

        {vehicles.map(v => (
          <VehicleMesh 
            key={v.id} 
            id={v.id} 
            type={v.type} 
            direction={v.direction} 
            getLightState={getLightState}
            removeMe={(id) => setVehicles(prev => prev.filter(v => v.id !== id))}
          />
        ))}

        <OrbitControls 
          enablePan={true}
          maxPolarAngle={Math.PI / 2.05} 
          minDistance={10}
          maxDistance={500}
          autoRotate
          autoRotateSpeed={0.2}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
