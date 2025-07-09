
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Sidebar } from "@/components/layout/Sidebar";
import { AnnouncementSection } from "@/components/layout/AnnouncementSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-6" data-dashboard-content>
          <AnnouncementSection 
            showInModal={true}
            maxDisplay={5}
            className="mb-6"
          />
          <Dashboard />
        </main>
      </div>
    </div>
  );
}

export default Index;
