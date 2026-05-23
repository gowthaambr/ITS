import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  new THREE.MeshStandardMaterial({ color: '#13161d', roughness: 0.88, metalness: 0.18 }), // dark concrete
  new THREE.MeshStandardMaterial({ color: '#0a1220', roughness: 0.12, metalness: 0.95 }), // glass tower
  new THREE.MeshStandardMaterial({ color: '#1c1308', roughness: 0.93, metalness: 0.06 }), // aged tone
  new THREE.MeshStandardMaterial({ color: '#0e1922', roughness: 0.28, metalness: 0.75 }), // metal cladding
  new THREE.MeshStandardMaterial({ color: '#1c1f28', roughness: 0.90, metalness: 0.10 }), // medium concrete
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
      <Cylinder args={[0.2, 0.3, height]} position={[0, height / 2, 0]}>
        <meshStandardMaterial color="#231a0e" roughness={0.95} />
      </Cylinder>
      <mesh position={[0, height * 0.78, 0]}>
        <dodecahedronGeometry args={[leafSize * 1.15, 1]} />
        <meshStandardMaterial color="#0c1c0d" roughness={0.88} />
      </mesh>
      <mesh position={[0, height * 1.12, 0]}>
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
        <meshStandardMaterial color="#ffe8a8" emissive="#ffcc44" emissiveIntensity={5.0} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
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
    const neonPalette = ['#00f2fe', '#ff2060', '#a855f7', '#10b981', '#fb923c'];
    positions.forEach((pos, index) => {
      const h = 25 + Math.random() * 75;
      const w = 16 + Math.random() * 14;
      const d = 16 + Math.random() * 14;
      const style = index % 5;
      const isGlass = style === 1 || style === 3;
      const hasNeon = index % 3 === 0;
      const neonColor = neonPalette[index % neonPalette.length];
      const isTall = h > 55;
      const isVeryTall = h > 75;
      const numWinCols = w > 22 ? 3 : 2;
      const step1H = isTall ? h * 0.62 : h;
      const step2H = isTall ? h - step1H : 0;
      const step2W = isTall ? w * 0.78 : 0;
      const step2D = isTall ? d * 0.78 : 0;
      b.push({
        x: pos[0], z: pos[1], w, d, h, isGlass, hasNeon, neonColor,
        isTall, isVeryTall, numWinCols, step1H, step2H, step2W, step2D,
        mat: buildingMaterials[style],
        windowsLit: Array.from({ length: Math.floor(step1H / 4) }, () => Math.random() > 0.42),
        windowsLit2: Array.from({ length: Math.floor(step2H / 4) }, () => Math.random() > 0.45),
        rooftopSeed: Math.random(),
        acW: 3 + Math.random() * 4,
        acD: 2 + Math.random() * 2,
      });
    });

    const trees = [];
    for (let z = -130; z <= 130; z += 30) {
      if (Math.abs(z) > 22) {
        trees.push([22, 0, z]);
        trees.push([-22, 0, z]);
      }
    }
    for (let x = -130; x <= 130; x += 30) {
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

      {/* === BUILDINGS — stepped profiles, window columns, neon accents === */}
      {buildings.map((b, i) => {
        const winColor = b.isGlass ? '#b8d8ff' : '#fbbf24';
        const winEmissive = b.isGlass ? '#3b82f6' : '#d97706';
        const winIntensity = b.isGlass ? 1.5 : 2.2;
        const cSpF = b.w / (b.numWinCols + 1);
        const cSpS = b.d / (b.numWinCols + 1);
        return (
          <group key={i} position={[b.x, 0, b.z]}>
            {/* LOWER SECTION */}
            <Box args={[b.w, b.step1H, b.d]} position={[0, b.step1H / 2, 0]} castShadow receiveShadow material={b.mat} />

            {/* STEPPED UPPER SECTION */}
            {b.isTall && (
              <Box args={[b.step2W, b.step2H, b.step2D]}
                   position={[0, b.step1H + b.step2H / 2, 0]}
                   castShadow receiveShadow material={b.mat} />
            )}

            {/* GROUND FLOOR PLINTH */}
            <Box args={[b.w + 1.8, 3.2, b.d + 1.8]} position={[0, 1.6, 0]}>
              <meshStandardMaterial color="#0f1218" roughness={0.92} metalness={0.22} />
            </Box>

            {/* WINDOW COLUMNS — front face, lower section */}
            {b.windowsLit.map((lit, f) => (lit && f % 2 === 0) ? (
              <React.Fragment key={`wff-${i}-${f}`}>
                {Array.from({ length: b.numWinCols }, (_, col) => (
                  <mesh key={`wf-${col}`} position={[(col + 1) * cSpF - b.w / 2, f * 4 + 2.8, b.d / 2 + 0.09]}>
                    <planeGeometry args={[cSpF * 0.64, 1.4]} />
                    <meshStandardMaterial color={winColor} emissive={winEmissive}
                      emissiveIntensity={winIntensity} toneMapped={false} side={THREE.DoubleSide} />
                  </mesh>
                ))}
              </React.Fragment>
            ) : null)}

            {/* WINDOW COLUMNS — side face, lower section */}
            {b.windowsLit.map((lit, f) => (lit && f % 2 === 0) ? (
              <React.Fragment key={`wsf-${i}-${f}`}>
                {Array.from({ length: b.numWinCols }, (_, col) => (
                  <mesh key={`ws-${col}`} position={[b.w / 2 + 0.09, f * 4 + 2.8, (col + 1) * cSpS - b.d / 2]} rotation={[0, -Math.PI / 2, 0]}>
                    <planeGeometry args={[cSpS * 0.64, 1.4]} />
                    <meshStandardMaterial color={winColor} emissive={winEmissive}
                      emissiveIntensity={winIntensity} toneMapped={false} side={THREE.DoubleSide} />
                  </mesh>
                ))}
              </React.Fragment>
            ) : null)}

            {/* WINDOW COLUMNS — upper stepped section */}
            {b.isTall && b.windowsLit2.map((lit, f) => (lit && f % 2 === 0) ? (
              <React.Fragment key={`wuf-${i}-${f}`}>
                {Array.from({ length: Math.max(1, b.numWinCols - 1) }, (_, col) => {
                  const nc = Math.max(1, b.numWinCols - 1);
                  const sp = b.step2W / (nc + 1);
                  return (
                    <mesh key={`wu-${col}`} position={[(col + 1) * sp - b.step2W / 2, b.step1H + f * 4 + 2.8, b.step2D / 2 + 0.09]}>
                      <planeGeometry args={[sp * 0.64, 1.4]} />
                      <meshStandardMaterial color={winColor} emissive={winEmissive}
                        emissiveIntensity={winIntensity} toneMapped={false} side={THREE.DoubleSide} />
                    </mesh>
                  );
                })}
              </React.Fragment>
            ) : null)}

            {/* NEON ACCENT STRIPS */}
            {b.hasNeon && (
              <>
                <Box args={[0.22, b.step1H * 0.88, 0.22]} position={[-b.w / 2 - 0.08, b.step1H * 0.5, b.d / 2 + 0.08]}>
                  <meshStandardMaterial color={b.neonColor} emissive={b.neonColor} emissiveIntensity={3.5} toneMapped={false} />
                </Box>
                <Box args={[0.22, b.step1H * 0.88, 0.22]} position={[b.w / 2 + 0.08, b.step1H * 0.5, b.d / 2 + 0.08]}>
                  <meshStandardMaterial color={b.neonColor} emissive={b.neonColor} emissiveIntensity={3.5} toneMapped={false} />
                </Box>
                <Box args={[b.w + 0.5, 0.22, 0.22]} position={[0, b.step1H - 1.5, b.d / 2 + 0.08]}>
                  <meshStandardMaterial color={b.neonColor} emissive={b.neonColor} emissiveIntensity={3.5} toneMapped={false} />
                </Box>
              </>
            )}

            {/* ROOFTOP — AC unit, stair shaft, antenna, water tank */}
            <Box args={[b.acW, 1.8, b.acD]} position={[b.w * 0.15, b.step1H + 0.9, b.d * 0.1]}>
              <meshStandardMaterial color="#1e2530" roughness={0.7} metalness={0.5} />
            </Box>
            <Box args={[2.8, 3.4, 2.8]} position={[-b.w * 0.2, b.step1H + 1.7, -b.d * 0.2]}>
              <meshStandardMaterial color="#13161d" roughness={0.85} metalness={0.3} />
            </Box>
            {b.rooftopSeed > 0.45 && (
              <Cylinder args={[0.07, 0.07, 6]} position={[b.w * 0.1, b.step1H + 3.9, b.d * 0.15]}>
                <meshStandardMaterial color="#1a1d24" roughness={0.5} metalness={0.9} />
              </Cylinder>
            )}
            {b.rooftopSeed > 0.7 && (
              <Cylinder args={[1.2, 1.2, 2.4]} position={[b.w * 0.25, b.step1H + 1.2, -b.d * 0.22]}>
                <meshStandardMaterial color="#1e2835" roughness={0.78} metalness={0.45} />
              </Cylinder>
            )}

            {/* HELIPAD on very tall buildings */}
            {b.isVeryTall && (
              <>
                <Cylinder args={[3.8, 3.8, 0.22, 32]} position={[0, b.h + 0.11, 0]}>
                  <meshStandardMaterial color="#1a2030" roughness={0.8} metalness={0.35} />
                </Cylinder>
                <mesh position={[0, b.h + 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[2.9, 3.4, 32]} />
                  <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={1.2} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
              </>
            )}
          </group>
        );
      })}

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
function VehicleMesh({ id, type, direction, getLightState, removeMe, reportViolation }) {
  const ref = useRef();
  const innerRef = useRef();

  const specs = useMemo(() => {
    if (type === 'Person') return { speed: 0.12, color: '#10b981', clearance: 2 };
    if (type === 'Bike') return { speed: 0.65, color: '#f59e0b', clearance: 6 };
    if (type === 'Truck') return { speed: 0.28, color: '#e2e8f0', clearance: 15 };
    return { speed: 0.5, color: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random()*5)], clearance: 8 };
  }, [type]);

  // 15% of non-pedestrian vehicles run red lights
  const willRunRed = useMemo(() => type !== 'Person' && Math.random() < 0.15, [type]);
  const crossedStopRef = useRef(false);

  const [currentSpeed, setCurrentSpeed] = useState(specs.speed);

  useEffect(() => {
    if (!ref.current) return;
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
      if (!willRunRed) shouldMove = false;
    }

    // Detect red-light violation: vehicle crosses stop line during red
    if (!crossedStopRef.current && distanceToStop < 1 && distanceToStop > -10 && facingLight === 'RED') {
      crossedStopRef.current = true;
      if (reportViolation) reportViolation(id, type, direction);
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
  const PHASE_DURATIONS = [7500, 3000, 7500, 3000];
  const phaseStartRef = useRef(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    phaseStartRef.current = Date.now();
    const timer = setTimeout(() => {
      setLightPhase((p) => (p + 1) % 4);
    }, PHASE_DURATIONS[lightPhase]);
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
  const [totalSpawned, setTotalSpawned] = useState(0);
  const [throughput, setThroughput] = useState(0);
  const [violations, setViolations] = useState([]);

  const spawnVehicle = (type, direction) => {
    setVehicles(prev => [...prev, { id: generateId(), type, direction }]);
    setTotalSpawned(p => p + 1);
  };

  const reportViolation = useCallback((id, type, direction) => {
    setViolations(prev => [
      { id, type, direction, time: new Date().toLocaleTimeString('en-US', { hour12: false }) },
      ...prev,
    ].slice(0, 15));
  }, []);

  // Computed values
  const elapsed = Date.now() - phaseStartRef.current;
  const remaining = Math.max(0, Math.ceil((PHASE_DURATIONS[lightPhase] - elapsed) / 1000));
  const nsLight = getLightState('NS');
  const ewLight = getLightState('EW');
  const fleetCounts = { Car: 0, Truck: 0, Bike: 0 };
  vehicles.forEach(v => { if (v.type !== 'Person') fleetCounts[v.type] = (fleetCounts[v.type] || 0) + 1; });
  const maxFleet = Math.max(...Object.values(fleetCounts), 1);
  const trafficStatus = violations.length === 0 ? ['SECURE', 'neon-green'] : violations.length < 4 ? ['CAUTION', 'neon-yellow'] : ['ALERT', 'neon-red'];

  const FLEET_META = [
    { type: 'Car',   color: '#3b82f6', label: 'CARS'   },
    { type: 'Truck', color: '#94a3b8', label: 'TRUCKS' },
    { type: 'Bike',  color: '#f59e0b', label: 'BIKES'  },
  ];

  const DIR_LABEL = { N: 'N-BOUND', S: 'S-BOUND', E: 'E-BOUND', W: 'W-BOUND' };

  return (
    <div className="app-wrapper">
      <div className="ui-container glass-panel">
        <div className="sidebar">
          <h1 className="cyber-title">A.I. MATRIX // LIVE</h1>
          <p className="cyber-subtitle">High-Fidelity Traffic Digital Twin</p>

          {/* ── TOP KPI ROW ── */}
          <div className="dashboard-stats">
            <div className="stat-box">
              <div className="stat-value neon-blue">{vehicles.length}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-box">
              <div className={`stat-value ${trafficStatus[1]}`}>{trafficStatus[0]}</div>
              <div className="stat-label">Status</div>
            </div>
          </div>

          {/* ── SIGNAL MATRIX ── */}
          <div className="stats-panel">
            <div className="panel-header">
              <span className="panel-label">SIGNAL MATRIX</span>
              <span className="panel-timer">{remaining}s</span>
            </div>
            <div className="signal-matrix">
              {[['N / S', nsLight], ['E / W', ewLight]].map(([axis, state]) => (
                <div key={axis} className={`signal-card sig-${state.toLowerCase()}`}>
                  <div className="sig-axis">{axis}</div>
                  <div className="sig-dot" />
                  <div className="sig-state">{state}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── SESSION METRICS ── */}
          <div className="stats-panel">
            <div className="panel-header"><span className="panel-label">SESSION METRICS</span></div>
            <div className="metrics-row">
              <div className="metric-block">
                <div className="metric-val neon-blue">{totalSpawned}</div>
                <div className="metric-label">DEPLOYED</div>
              </div>
              <div className="metric-sep" />
              <div className="metric-block">
                <div className="metric-val neon-green">{throughput}</div>
                <div className="metric-label">CLEARED</div>
              </div>
              <div className="metric-sep" />
              <div className="metric-block">
                <div className="metric-val neon-red">{violations.length}</div>
                <div className="metric-label">VIOLATIONS</div>
              </div>
            </div>
          </div>

          {/* ── FLEET STATUS ── */}
          <div className="stats-panel">
            <div className="panel-header"><span className="panel-label">FLEET BREAKDOWN</span></div>
            {FLEET_META.map(({ type, color, label }) => (
              <div key={type} className="fleet-row">
                <span className="fleet-label">{label}</span>
                <div className="fleet-bar-bg">
                  <div className="fleet-bar-fill" style={{ width: `${(fleetCounts[type] / maxFleet) * 100}%`, background: color }} />
                </div>
                <span className="fleet-count" style={{ color }}>{fleetCounts[type]}</span>
              </div>
            ))}
          </div>

          {/* ── SPAWN PANEL ── */}
          <div className="hud-panel">
            <h3 className="hud-title">Deploy Target Nodes</h3>
            <div className="spawn-grid">
              <button className="spawn-btn" onClick={() => spawnVehicle('Car', 'N')}>Car [North ⬇️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Bike', 'S')}>Bike [South ⬆️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Truck', 'E')}>Truck [East ⬅️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Car', 'W')}>Car [West ➡️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Truck', 'N')}>Truck [North ⬇️]</button>
              <button className="spawn-btn" onClick={() => spawnVehicle('Bike', 'W')}>Bike [West ➡️]</button>
            </div>
          </div>

          {/* ── INCIDENT LOG ── */}
          <div className="stats-panel">
            <div className="panel-header">
              <span className="panel-label">INCIDENT LOG</span>
              {violations.length > 0 && (
                <button className="clear-btn" onClick={() => setViolations([])}>CLEAR</button>
              )}
            </div>
            <div className="violations-log">
              {violations.length === 0 ? (
                <div className="no-violations">No incidents recorded</div>
              ) : violations.map((v, i) => (
                <div key={i} className="violation-row">
                  <span className="v-time">{v.time}</span>
                  <span className="v-type">{v.type.toUpperCase()}</span>
                  <span className="v-desc">RAN RED · {DIR_LABEL[v.direction]}</span>
                </div>
              ))}
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
          <Bloom luminanceThreshold={1.0} mipmapBlur intensity={0.8} />
        </EffectComposer>

        <Environment preset="night" />

        <ambientLight intensity={0.45} />
        <hemisphereLight skyColor="#8fb8ff" groundColor="#0c1320" intensity={0.4} />
        <pointLight position={[0, 35, 0]} color="#b4d6ff" intensity={1.2} distance={200} />
        <directionalLight
           position={[100, 200, 50]}
           intensity={0.4}
           color="#c4d7ee"
           castShadow
           shadow-mapSize={[1024, 1024]}
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
            reportViolation={reportViolation}
            removeMe={(id) => {
              setVehicles(prev => prev.filter(v => v.id !== id));
              setThroughput(p => p + 1);
            }}
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
