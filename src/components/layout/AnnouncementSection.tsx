
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";

interface AnnouncementSectionProps {
  showInModal?: boolean;
  maxDisplay?: number;
  className?: string;
}

export function AnnouncementSection({ 
  showInModal = false, 
  maxDisplay = 3,
  className = ""
}: AnnouncementSectionProps) {
  return (
    <div className={className}>
      <AnnouncementBanner 
        showInModal={showInModal}
        maxDisplay={maxDisplay}
      />
    </div>
  );
}
