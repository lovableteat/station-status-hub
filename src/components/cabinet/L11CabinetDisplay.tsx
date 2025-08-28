import React, { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { BackButton } from '@/components/common/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';

interface CabinetRackProps {
  position: [number, number, number];
  label: string;
  type: 'switch' | 'compute' | 'power';
  count?: number;
  color?: string;
}

function CabinetRack({ position, label, type, count, color }: CabinetRackProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const getColor = () => {
    if (color) return color;
    switch (type) {
      case 'switch': return '#3b82f6';
      case 'compute': return '#10b981';
      case 'power': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getSize = (): [number, number, number] => {
    switch (type) {
      case 'switch': return [3.8, 0.3, 2];
      case 'compute': return [3.8, 0.25, 2];
      case 'power': return [3.8, 0.4, 2];
      default: return [3.8, 0.3, 2];
    }
  };

  const [width, height, depth] = getSize();

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.05 : 1}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={getColor()} metalness={0.3} roughness={0.4} />
      </mesh>
      
      {/* LED indicators */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh key={i} position={[-1.8 + i * 0.3, 0, 1.01]}>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshStandardMaterial 
            color={hovered ? '#22c55e' : '#dc2626'} 
            emissive={hovered ? '#065f46' : '#7f1d1d'}
          />
        </mesh>
      ))}
      
      <Text
        position={[0, 0, 1.01]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label} {count && `(${count})`}
      </Text>
    </group>
  );
}

function CabinetFrame() {
  // Cabinet frame structure
  const frameColor = '#2d3748';
  
  return (
    <group>
      {/* Front frame */}
      <mesh position={[0, 0, 2.1]}>
        <boxGeometry args={[4, 12, 0.1]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      {/* Back panel */}
      <mesh position={[0, 0, -2.1]}>
        <boxGeometry args={[4, 12, 0.1]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      {/* Side panels */}
      <mesh position={[-2, 0, 0]}>
        <boxGeometry args={[0.1, 12, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[2, 0, 0]}>
        <boxGeometry args={[0.1, 12, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      {/* Top and bottom */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0, -6, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
    </group>
  );
}

function CabinetScene() {
  const groupRef = useRef<THREE.Group>(null);
  
  // Cabinet components from top to bottom based on the image
  const components = [
    { label: "Top Of Rack Switch", type: "switch" as const, yPos: 5.5 },
    { label: "Power Supplies", type: "power" as const, yPos: 4.8 },
    
    // 10 Compute Trays
    ...Array.from({ length: 10 }, (_, i) => ({
      label: `Compute Tray ${10 - i}`,
      type: "compute" as const,
      yPos: 4.1 - (i * 0.35)
    })),
    
    // 9 Switch Trays
    ...Array.from({ length: 9 }, (_, i) => ({
      label: `Switch Tray ${9 - i}`,
      type: "switch" as const,
      yPos: 0.6 - (i * 0.35)
    })),
    
    // 8 Compute Trays
    ...Array.from({ length: 8 }, (_, i) => ({
      label: `Compute Tray ${8 - i}`,
      type: "compute" as const,
      yPos: -2.5 - (i * 0.35)
    })),
    
    { label: "Power Supplies", type: "power" as const, yPos: -5.3 },
  ];

  return (
    <group ref={groupRef}>
      <CabinetFrame />
      
      {components.map((comp, index) => (
        <CabinetRack
          key={index}
          position={[0, comp.yPos, 0]}
          label={comp.label}
          type={comp.type}
        />
      ))}
      
      {/* Ambient lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
      
      {/* Background */}
      <mesh position={[0, 0, -10]} scale={[50, 50, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

export function L11CabinetDisplay() {
  const [autoRotate, setAutoRotate] = useState(true);
  
  const handleReset = () => {
    setAutoRotate(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-foreground mt-2">L11機櫃展示</h1>
          <p className="text-muted-foreground">3D機櫃結構展示</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            重置視角
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 3D Display */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              L11機櫃 3D結構
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[600px] rounded-lg overflow-hidden border bg-slate-900">
              <Canvas
                camera={{ position: [8, 3, 8], fov: 50 }}
                style={{ background: 'linear-gradient(to bottom, #1e293b, #0f172a)' }}
              >
                <Suspense fallback={null}>
                  <CabinetScene />
                  <OrbitControls 
                    autoRotate={autoRotate}
                    autoRotateSpeed={1}
                    enablePan={true}
                    enableZoom={true}
                    enableRotate={true}
                    minDistance={5}
                    maxDistance={20}
                    onStart={() => setAutoRotate(false)}
                  />
                </Suspense>
              </Canvas>
            </div>
          </CardContent>
        </Card>

        {/* Information Panel */}
        <Card>
          <CardHeader>
            <CardTitle>機櫃組件說明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3 w-3 bg-blue-500 rounded" />
                <Badge variant="outline">交換機</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                網路交換設備，負責資料傳輸
              </p>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3 w-3 bg-emerald-500 rounded" />
                <Badge variant="outline">運算單元</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                主要處理運算任務的伺服器托盤
              </p>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3 w-3 bg-amber-500 rounded" />
                <Badge variant="outline">電源供應</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                提供穩定電力供應的冗餘電源
              </p>
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-2">操作說明</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 滑鼠拖拽旋轉視角</li>
                <li>• 滾輪縮放檢視</li>
                <li>• 滑鼠懸停查看組件</li>
                <li>• 自動旋轉展示</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">10</div>
            <div className="text-sm text-muted-foreground">交換機托盤</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">18</div>
            <div className="text-sm text-muted-foreground">運算托盤</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">2</div>
            <div className="text-sm text-muted-foreground">電源供應單元</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}