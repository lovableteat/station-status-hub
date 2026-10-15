import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const colors = ["#63c8b7", "#79a9e8", "#d6ad65", "#b59bdf", "#e28f99", "#a4adb9"];
const valid = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function DiagramColorControl({ id, label, value, disabled, onChange }: {
  id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <div className="diagram-color-control">
    <Label htmlFor={id}>{label}</Label>
    <div className="diagram-color-inputs">
      <input id={id} type="color" value={value} disabled={disabled} onInput={event => { if (valid(event.currentTarget.value) && !disabled) onChange(event.currentTarget.value.toLowerCase()); }} onChange={event => { if (valid(event.target.value) && !disabled) onChange(event.target.value.toLowerCase()); }} />
      <Input id={`${id}-hex`} aria-label={`${label}色碼`} value={draft} maxLength={7} disabled={disabled} aria-invalid={!valid(draft)} spellCheck={false}
        onChange={event => { setDraft(event.target.value); if (valid(event.target.value) && !disabled) onChange(event.target.value.toLowerCase()); }}
        onBlur={() => setDraft(value)} />
    </div>
    <div className="diagram-swatches">{colors.map(color => <button key={color} type="button" title={color} aria-label={`使用 ${color} 顏色`} aria-pressed={value.toLowerCase() === color} disabled={disabled} onClick={() => { if (!disabled) onChange(color); }}><span style={{ background: color }} />{value.toLowerCase() === color && <Check />}</button>)}</div>
  </div>;
}
