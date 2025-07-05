import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "default" | "outline" | "ghost";
}

export function BackButton({ onClick, label = "返回上一頁", variant = "outline" }: BackButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.history.back();
    }
  };

  return (
    <Button variant={variant} onClick={handleClick} size="sm">
      <ArrowLeft className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}