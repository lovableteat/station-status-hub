import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, FileImage, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface DashboardScreenshotExporterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DashboardScreenshotExporter({
  isOpen,
  onClose,
}: DashboardScreenshotExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const captureScreenshot = async () => {
    const dashboardElement =
      document.querySelector("[data-dashboard-content]") || document.body;

    return html2canvas(dashboardElement as HTMLElement, {
      allowTaint: true,
      backgroundColor: "#ffffff",
      height: dashboardElement.scrollHeight,
      scale: 2,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      width: dashboardElement.scrollWidth,
    });
  };

  const exportAsPNG = async () => {
    try {
      setIsExporting(true);
      const canvas = await captureScreenshot();

      const link = document.createElement("a");
      link.download = `dashboard_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export complete",
        description: "Dashboard snapshot saved as PNG.",
      });

      onClose();
    } catch (error) {
      console.error("PNG export failed:", error);
      toast({
        title: "Export failed",
        description: "Unable to export the dashboard as PNG.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsPDF = async () => {
    try {
      setIsExporting(true);
      const canvas = await captureScreenshot();

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;
      const pdfWidth = 297;
      const pdfHeight = 210;

      let finalWidth = pdfWidth;
      let finalHeight = pdfWidth / ratio;

      if (ratio <= pdfWidth / pdfHeight) {
        finalHeight = pdfHeight;
        finalWidth = pdfHeight * ratio;
      }

      const pdf = new jsPDF({
        format: "a4",
        orientation: "landscape",
        unit: "mm",
      });

      pdf.setFontSize(16);
      pdf.text("Dashboard Snapshot", 20, 20);
      pdf.setFontSize(10);
      pdf.text(`Captured: ${new Date().toLocaleString("zh-TW")}`, 20, 30);
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (pdfWidth - finalWidth) / 2,
        40,
        finalWidth,
        finalHeight
      );
      pdf.save(`dashboard_${new Date().toISOString().slice(0, 10)}.pdf`);

      toast({
        title: "Export complete",
        description: "Dashboard snapshot saved as PDF.",
      });

      onClose();
    } catch (error) {
      console.error("PDF export failed:", error);
      toast({
        title: "Export failed",
        description: "Unable to export the dashboard as PDF.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Export Dashboard
          </DialogTitle>
          <DialogDescription>
            Save the current dashboard view as PNG or PDF. This export does not
            modify any project data.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={isExporting}
            onClick={exportAsPNG}
            variant="outline"
          >
            <FileImage className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export PNG"}
          </Button>

          <Button className="w-full" disabled={isExporting} onClick={exportAsPDF}>
            <FileText className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
