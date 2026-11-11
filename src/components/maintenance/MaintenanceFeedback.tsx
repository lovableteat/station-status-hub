import { toast } from '@/components/ui/sonner';

export function MaintenanceSpinner() {
  return <span className="mf-loading-spinner" aria-hidden="true" />;
}

export function MaintenanceLoading({ label, announce = true }: { label: string; announce?: boolean }) {
  return <span className="mf-loading" role={announce ? 'status' : undefined}>
    <MaintenanceSpinner />
    <span>{label}</span>
  </span>;
}

export function showMaintenanceSuccess(message: string, description?: string) {
  toast.success(message, {
    id: 'maintenance-success',
    position: 'top-right',
    duration: 2400,
    className: 'mf-success-toast',
    description,
  });
}
