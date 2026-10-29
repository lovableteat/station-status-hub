import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";

export interface MaterialRequestOwner { id: string; name: string; username?: string }

export function MaterialRequestOwnerPicker({ record, owners, disabled, onChange }: {
  record: MaterialWorkbookRecord;
  owners: MaterialRequestOwner[];
  disabled: boolean;
  onChange: (owner: MaterialRequestOwner | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saved = record.requestOwnerId || (record.requestOwnerName ? "__previous__" : "__unassigned__");
  return <div className="order-3 w-40 shrink-0 lg:order-none" data-testid="pending-owner-picker">
    <Select value={saved} disabled={disabled || saving} onValueChange={value => {
      const owner = owners.find(item => item.id === value) ?? null;
      setSaving(true); setError("");
      void onChange(owner).catch(error => setError(error instanceof Error ? error.message : "負責人未儲存，請重試。")).finally(() => setSaving(false));
    }}>
      <SelectTrigger className="h-9 text-xs" aria-label={`負責人 ${record.refDes || record.name}`} aria-busy={saving}><span className="mr-1 shrink-0 text-muted-foreground">負責人</span><SelectValue placeholder="未指定" /></SelectTrigger>
      <SelectContent><SelectItem value="__unassigned__">未指定</SelectItem>
        {record.requestOwnerName && !owners.some(owner => owner.id === saved) && <SelectItem value={saved}>{record.requestOwnerName}（原負責人）</SelectItem>}
        {owners.map(owner => <SelectItem key={owner.id} value={owner.id}>{owner.name}{owners.filter(item => item.name === owner.name).length > 1 && owner.username ? `（${owner.username}）` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
    {error && <p role="alert" className="max-w-40 text-xs text-destructive">{error}</p>}
  </div>;
}
