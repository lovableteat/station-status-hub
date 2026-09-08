import { Box, Check, Cpu, Ruler, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildPcbModelFootprint } from "./core/modelAssets.ts";
import type { PcbModelAsset } from "./types.ts";

export function PcbStepModelDialog({
  asset,
  busy = false,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  asset: PcbModelAsset | null;
  busy?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
}) {
  const footprint = useMemo(() => asset ? buildPcbModelFootprint(asset) : [], [asset]);
  const leadCount = footprint.filter((part) => part.role === "lead").length;
  const dimensions = asset?.metadata.calibratedDimensions;

  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="pcb-step-dialog sm:max-w-3xl">
        <DialogHeader>
          <div className="pcb-step-dialog-heading">
            <span className="pcb-step-dialog-icon"><Cpu aria-hidden="true" /></span>
            <div>
              <DialogTitle>STEP 元件尺寸與 2D 封裝預覽</DialogTitle>
              <DialogDescription>
                已從模型自動取得長、寬、高；黃色區域為偵測到的端子或腳位。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {asset && dimensions && (
          <div className="pcb-step-dialog-content">
            <section className="pcb-step-preview-panel" aria-label="STEP 元件 2D 俯視預覽">
              <div className="pcb-step-preview-toolbar">
                <span><Box aria-hidden="true" />2D Layout 俯視圖</span>
                <span>{leadCount > 0 ? `辨識 ${leadCount} 組腳位` : `${asset.metadata.parts.length} 個實體零件`}</span>
              </div>
              <div className="pcb-step-preview-stage">
                <svg viewBox="-58 -58 116 116" role="img" aria-label={`${asset.metadata.fileName} 俯視封裝`}>
                  <rect x="-50" y="-50" width="100" height="100" rx="3" className="pcb-step-preview-boundary" />
                  <g>
                    {footprint.map((part) => (
                      <polygon
                        key={part.id}
                        data-footprint-role={part.role}
                        points={part.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                        fill={part.role === "lead" ? "#f6c453" : part.color}
                        className={part.role === "lead" ? "is-lead" : "is-body"}
                      />
                    ))}
                  </g>
                  <path d="M-50 44v6h6" className="pcb-step-preview-origin" />
                </svg>
              </div>
              <div className="pcb-step-preview-legend">
                <span><i className="is-body" />元件本體</span>
                <span><i className="is-lead" />腳位／端子</span>
                <span><i className="is-outline" />元件占用範圍</span>
              </div>
            </section>

            <section className="pcb-step-metrics" aria-label="自動解析尺寸">
              <div className="pcb-step-file-name">
                <Check aria-hidden="true" />
                <div><strong>模型解析完成</strong><span>{asset.metadata.fileName}</span></div>
              </div>
              {[
                ["長度 X", dimensions.widthMm, "板面左右尺寸"],
                ["寬度 Y", dimensions.depthMm, "板面前後尺寸"],
                ["高度 Z", dimensions.heightMm, "離板最高尺寸"],
              ].map(([label, value, hint]) => (
                <div className="pcb-step-metric" key={String(label)}>
                  <span><Ruler aria-hidden="true" />{label}</span>
                  <strong>{value}<small> mm</small></strong>
                  <small>{hint}</small>
                </div>
              ))}
              <div className="pcb-step-axis-note">
                2D 封裝會依照長度與寬度等比例放置；3D 使用高度建立實際外形。
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="pcb-step-dialog-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" />{onConfirm ? "取消" : "關閉"}
          </Button>
          {onConfirm && (
            <Button type="button" disabled={busy} onClick={() => void onConfirm()}>
              <Check className="mr-1.5 h-4 w-4" />{busy ? "儲存模型中…" : confirmLabel ?? "確認使用"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
