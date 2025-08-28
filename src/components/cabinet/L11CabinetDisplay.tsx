import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BackButton } from '@/components/common/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface CabinetRackProps {
  position: [number, number, number];
  color: string;
  size: [number, number, number];
}

function CabinetRack({ position, color, size }: CabinetRackProps) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function CabinetScene() {
  const frameColor = '#2d3748';
  
  // Cabinet components positions and colors
  const components = [
    // Top switch
    { position: [0, 5.5, 0] as [number, number, number], color: '#3b82f6', size: [3.8, 0.3, 2] as [number, number, number] },
    // Power supply
    { position: [0, 4.8, 0] as [number, number, number], color: '#f59e0b', size: [3.8, 0.4, 2] as [number, number, number] },
    
    // 10 Compute trays
    ...Array.from({ length: 10 }, (_, i) => ({
      position: [0, 4.1 - (i * 0.35), 0] as [number, number, number],
      color: '#10b981',
      size: [3.8, 0.25, 2] as [number, number, number]
    })),
    
    // 9 Switch trays
    ...Array.from({ length: 9 }, (_, i) => ({
      position: [0, 0.6 - (i * 0.35), 0] as [number, number, number],
      color: '#3b82f6',
      size: [3.8, 0.3, 2] as [number, number, number]
    })),
    
    // 8 Compute trays
    ...Array.from({ length: 8 }, (_, i) => ({
      position: [0, -2.5 - (i * 0.35), 0] as [number, number, number],
      color: '#10b981',
      size: [3.8, 0.25, 2] as [number, number, number]
    })),
    
    // Bottom power supply
    { position: [0, -5.3, 0] as [number, number, number], color: '#f59e0b', size: [3.8, 0.4, 2] as [number, number, number] },
  ];

  return (
    <group>
      {/* Cabinet frame */}
      <mesh position={[0, 0, 2.1]}>
        <boxGeometry args={[4, 12, 0.1]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[0, 0, -2.1]}>
        <boxGeometry args={[4, 12, 0.1]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[-2, 0, 0]}>
        <boxGeometry args={[0.1, 12, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[2, 0, 0]}>
        <boxGeometry args={[0.1, 12, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[0, -6, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Cabinet components */}
      {components.map((comp, index) => (
        <CabinetRack
          key={index}
          position={comp.position}
          color={comp.color}
          size={comp.size}
        />
      ))}
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
    </group>
  );
}

function ErrorFallback() {
  return (
    <div className="h-[600px] rounded-lg border bg-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <h3 className="text-lg font-semibold mb-2">3D顯示載入失敗</h3>
        <p className="text-sm text-slate-400">請重新整理頁面或聯繫系統管理員</p>
      </div>
    </div>
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
              <Suspense fallback={<ErrorFallback />}>
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
              </Suspense>
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