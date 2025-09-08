import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Settings, 
  Eye, 
  Edit, 
  Trash2, 
  Users, 
  Activity,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface CabinetInfo {
  id: string;
  name: string;
  location: string;
  model: string;
  status: 'active' | 'maintenance' | 'offline' | 'planning';
  totalSystems: number;
  completedSystems: number;
  totalComponents: number;
  configuredComponents: number;
  assignedEngineers: string[];
  createdAt: string;
  lastUpdated: string;
}

interface CabinetCardProps {
  cabinet: CabinetInfo;
  onEdit?: (cabinet: CabinetInfo) => void;
  onDelete?: (cabinetId: string) => void;
  onViewDetails?: (cabinetId: string) => void;
}

export function CabinetCard({ 
  cabinet, 
  onEdit, 
  onDelete, 
  onViewDetails 
}: CabinetCardProps) {
  const navigate = useNavigate();
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'maintenance': return 'bg-yellow-500'; 
      case 'offline': return 'bg-red-500';
      case 'planning': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'maintenance': return <AlertTriangle className="h-4 w-4" />;
      case 'offline': return <AlertTriangle className="h-4 w-4" />;
      case 'planning': return <Activity className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const systemProgress = cabinet.totalSystems > 0 
    ? (cabinet.completedSystems / cabinet.totalSystems) * 100 
    : 0;
    
  const componentProgress = cabinet.totalComponents > 0 
    ? (cabinet.configuredComponents / cabinet.totalComponents) * 100 
    : 0;

  const handleView3D = () => {
    navigate(`/cabinet/${cabinet.id}`);
  };

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(cabinet.id);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`h-3 w-3 rounded-full ${getStatusColor(cabinet.status)} mt-1`} />
            <div>
              <CardTitle className="text-lg">{cabinet.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {cabinet.location} • {cabinet.model}
              </p>
            </div>
          </div>
          <Badge 
            variant={cabinet.status === 'active' ? 'default' : 'secondary'}
            className="flex items-center gap-1"
          >
            {getStatusIcon(cabinet.status)}
            {cabinet.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 系統進度 */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">系統完成進度</span>
            <span className="text-muted-foreground">
              {cabinet.completedSystems} / {cabinet.totalSystems}
            </span>
          </div>
          <Progress value={systemProgress} className="h-2" />
          <div className="text-right text-xs text-muted-foreground mt-1">
            {systemProgress.toFixed(1)}%
          </div>
        </div>

        {/* 組件配置進度 */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">組件配置進度</span>
            <span className="text-muted-foreground">
              {cabinet.configuredComponents} / {cabinet.totalComponents}
            </span>
          </div>
          <Progress value={componentProgress} className="h-2" />
          <div className="text-right text-xs text-muted-foreground mt-1">
            {componentProgress.toFixed(1)}%
          </div>
        </div>

        {/* 指派工程師 */}
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">指派工程師:</span>
          <div className="flex gap-1">
            {cabinet.assignedEngineers.length > 0 ? (
              cabinet.assignedEngineers.slice(0, 3).map((engineer, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {engineer}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">未指派</span>
            )}
            {cabinet.assignedEngineers.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{cabinet.assignedEngineers.length - 3}
              </Badge>
            )}
          </div>
        </div>

        {/* 最後更新時間 */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          最後更新: {new Date(cabinet.lastUpdated).toLocaleString('zh-TW')}
        </div>

        {/* 操作按鈕 */}
        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            onClick={handleView3D}
            className="flex-1"
          >
            <Eye className="h-4 w-4 mr-2" />
            3D展示
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleViewDetails}
            className="flex-1"
          >
            <Settings className="h-4 w-4 mr-2" />
            詳細設定
          </Button>
          {onEdit && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => onEdit(cabinet)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => onDelete(cabinet.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}