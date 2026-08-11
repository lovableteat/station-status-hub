import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getUserAvatarPublicUrl } from "./userAvatarUrl";

interface UserAvatarProps extends Omit<ComponentProps<typeof Avatar>, "children"> {
  avatarPath?: string | null;
  displayName?: string | null;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function UserAvatar({
  avatarPath,
  displayName,
  className,
  imageClassName,
  fallbackClassName,
  ...props
}: UserAvatarProps) {
  const avatarUrl = getUserAvatarPublicUrl(avatarPath);
  const initials = (displayName?.trim() || "?").slice(0, 2).toUpperCase();

  return (
    <Avatar className={cn("bg-cyan-300/10", className)} {...props}>
      {avatarUrl ? (
        <AvatarImage
          src={avatarUrl}
          alt={`${displayName || "使用者"}的頭像`}
          className={cn("object-cover", imageClassName)}
        />
      ) : null}
      <AvatarFallback className={cn("bg-cyan-300/10 font-bold text-cyan-100", fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
