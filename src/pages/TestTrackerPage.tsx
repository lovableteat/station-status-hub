import { TestTracker } from "@/components/test-tracker/TestTracker";
import { BackButton } from "@/components/common/BackButton";

export default function TestTrackerPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <TestTracker />
      </div>
    </div>
  );
}