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
import { getPcbModelTopViewImage } from "./core/modelProjection.ts";
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
  const preview = useMemo(() => asset ? getPcbModelTopViewImage(asset) : "", [asset]);
  const dimensions = asset?.metadata.calibratedDimensions;
  const previewWidth = dimensions ? 100 * Math.min(1, dimensions.widthMm / dimensions.depthMm) : 100;
  const previewHeight = dimensions ? 100 * Math.min(1, dimensions.depthMm / dimensions.widthMm) : 100;

  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="pcb-step-dialog sm:max-w-3xl">
        <DialogHeader>
          <div className="pcb-step-dialog-heading">
            <span className="pcb-step-dialog-icon"><Cpu aria-hidden="true" /></span>
            <div>
              <DialogTitle>STEP 元件尺寸與 2D 俯視預覽</DialogTitle>
              <DialogDescription>
                已從模型自動取得長、寬、高，依完整幾何呈現外殼、開孔與端子。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {asset && dimensions && (
          <div className="pcb-step-dialog-content">
            <section className="pcb-step-preview-panel" aria-label="STEP 元件 2D 俯視預覽">
              <div className="pcb-step-preview-toolbar">
                <span><Box aria-hidden="true" />2D 機構俯視圖</span>
                <span>{`${asset.metadata.parts.length} 個實體零件`}</span>
              </div>
              <div className="pcb-step-preview-stage">
                <svg viewBox="-58 -58 116 116" role="img" aria-label={`${asset.metadata.fileName} 俯視封裝`}>
                  <rect x={-previewWidth / 2} y={-previewHeight / 2} width={previewWidth} height={previewHeight} rx="1" className="pcb-step-preview-boundary" />
                  <image href={preview} x="-50" y="-50" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
                </svg>
              </div>
              <div className="pcb-step-preview-legend">
                <span><i className="is-body" />元件本體</span>
                <span>保留原始模型幾何</span>
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
                2D 與 3D 使用同一份模型，按實際長寬比例顯示。STEP 不含電氣焊盤與腳位編號；需要原始 PCB 封裝資料才能顯示這些資訊。
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
