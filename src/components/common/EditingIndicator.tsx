import { useEffect, useState } from "react";
import { Edit3, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";

interface EditingIndicatorProps {
  itemType: 'system' | 'progress' | 'issue';
  itemId: string;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  className?: string;
}

export function EditingIndicator({ 
  itemType, 
  itemId, 
  onEditStart, 
  onEditEnd, 
  className 
}: EditingIndicatorProps) {
  const { onlineUsers, updateEditingState } = useUserPresence();
  const [isEditing, setIsEditing] = useState(false);

  // Find users editing this item
  const editingUsers = onlineUsers.filter(user => 
    user.isEditing?.itemType === itemType && user.isEditing?.itemId === itemId
  );

  // Handle editing state changes
  useEffect(() => {
    if (isEditing) {
      updateEditingState({
        module: 'test-tracker',
        itemType,
        itemId
      });
      onEditStart?.();
    } else {
      updateEditingState();
      onEditEnd?.();
    }

    return () => {
      if (isEditing) {
        updateEditingState();
      }
    };
  }, [isEditing, itemType, itemId, updateEditingState, onEditStart, onEditEnd]);

  const startEditing = () => setIsEditing(true);
  const stopEditing = () => setIsEditing(false);

  if (editingUsers.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("inline-flex items-center gap-1", className)}>
          <Badge variant="secondary" className="text-xs px-2 py-1">
            <Edit3 className="h-3 w-3 mr-1" />
            {editingUsers.length === 1 ? (
              <span>{editingUsers[0].displayName || editingUsers[0].username} 編輯中</span>
            ) : (
              <span>{editingUsers.length} 人編輯中</span>
            )}
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <div className="font-medium text-xs">正在編輯:</div>
          {editingUsers.map(user => (
            <div key={user.userId} className="text-xs">
              {user.displayName || user.username} ({user.role})
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Hook to manage editing state for components
export function useEditingState(itemType: 'system' | 'progress' | 'issue', itemId: string) {
  const [isEditing, setIsEditing] = useState(false);
  const { updateEditingState } = useUserPresence();

  const startEditing = () => {
    setIsEditing(true);
    updateEditingState({
      module: 'test-tracker',
      itemType,
      itemId
    });
  };

  const stopEditing = () => {
    setIsEditing(false);
    updateEditingState();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isEditing) {
        updateEditingState();
      }
    };
  }, [isEditing, updateEditingState]);

  return {
    isEditing,
    startEditing,
    stopEditing
  };
}