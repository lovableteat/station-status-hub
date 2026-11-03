import sevenZipWasmUrl from "7z-wasm/7zz.wasm?url";
import { boundedSpecText, extractMaterialSpecArchive, readMaterialSpecOffice, readMaterialSpecText } from "./materialSpecDocumentCore";
import type { SpecDecodedContent } from "./materialSpecDocumentCore";

async function geometry(name: string, bytes: Uint8Array): Promise<SpecDecodedContent> {
  if (/\.(stp|step)$/i.test(name)) {
    const { importStepModel } = await import("../data-center/stepImport");
    const { summarizeSpecFillStep } = await import("../material-requests/materialSpecFillEngineering");
    const model = await importStepModel(new File([new Uint8Array(bytes)], name));
    return { text: summarizeSpecFillStep(name, model, new TextDecoder().decode(bytes)), status: "partial", method: "STEP 模型幾何／屬性", note: "只提供模型外框、名稱及明文屬性，不能代替工程圖公差、接腳安裝深度或電氣額定值。" };
  }
  const THREE = await import("three");
  let object: InstanceType<typeof THREE.Object3D>;
  if (/\.stl$/i.test(name)) {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    object = new THREE.Mesh(new STLLoader().parse(bytes.buffer as ArrayBuffer));
  } else if (/\.ply$/i.test(name)) {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    object = new THREE.Mesh(new PLYLoader().parse(bytes.buffer as ArrayBuffer));
  } else {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    object = new OBJLoader().parse(new TextDecoder().decode(bytes));
  }
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(Number.isFinite) || bounds.isEmpty()) throw new Error("模型沒有有效幾何。");
  const names: string[] = [];
  object.traverse(part => { if (part.name) names.push(part.name); });
  return { text: `${name}\n原始模型座標軸近似外框 X=${size.x}、Y=${size.y}、Z=${size.z}（原始模型單位，未假定為 mm）\n物件名稱：${names.join("、")}\n只解析網格，不代表材料、電氣規格、工程公差或安裝深度。`, status: "partial", method: "3D 網格幾何", note: "模型單位須由工程文件核對；未推測電氣規格或原始設計參數。" };
}

self.onmessage = async ({ data }: MessageEvent<{ name: string; bytes: ArrayBuffer }>) => {
  try {
    const bytes = new Uint8Array(data.bytes);
    let result: SpecDecodedContent;
    if (/\.(zip|rar|7z)$/i.test(data.name)) {
      const response = await fetch(sevenZipWasmUrl);
      if (!response.ok) throw new Error("壓縮檔解析器載入失敗。");
      result = { text: "", status: "read", method: "壓縮檔目錄／解壓", children: await extractMaterialSpecArchive(bytes, await response.arrayBuffer()) };
    } else if (/\.(docx|pptx|xlsx?|xlsm|xlsb|odt|ods|odp)$/i.test(data.name)) result = await readMaterialSpecOffice(data.name, bytes);
    else if (/\.(stp|step|stl|obj|ply)$/i.test(data.name)) result = await geometry(data.name, bytes);
    else if (/\.(tif|tiff)$/i.test(data.name)) {
      const UTIF = await import("utif");
      const pages = UTIF.decode(data.bytes);
      if (pages.length > 200) throw new Error("TIFF 超過 200 頁，本次未判讀。");
      const children = []; let total = 0;
      for (const [index, page] of pages.entries()) {
        const width = page.width || page.t256?.[0], height = page.height || page.t257?.[0];
        if (!width || !height || (total += width * height * 4) > 100 * 1024 * 1024) throw new Error("TIFF 解碼超過 100 MB 容量。");
        UTIF.decodeImage(data.bytes, page);
        const canvas = new OffscreenCanvas(page.width, page.height);
        canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(page)), page.width, page.height), 0, 0);
        children.push({ name: `第${index + 1}頁.png`, bytes: new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()) });
      }
      result = { text: "", status: "read", method: "TIFF 分頁圖像", children };
    } else if (/\.glb$/i.test(data.name)) {
      const view = new DataView(data.bytes);
      if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(12, true) > bytes.length - 20) throw new Error("GLB 標頭無效。");
      result = { ...boundedSpecText(new TextDecoder().decode(bytes.slice(20, 20 + view.getUint32(12, true))), "GLB 模型結構／宣告屬性"), status: "partial", note: "僅讀取模型 JSON 結構、節點名稱及宣告外框；未將網格、材質或單位推測為電氣規格。" };
    } else {
      result = readMaterialSpecText(data.name, bytes);
      if (/\.(gltf|fbx|wrl|vrml|igs|iges|dwg|dxf|svg|brd|pcb|sch|dsn|olb|dra|psm|pad|kicad_\w+|lib|gbr|gerber|drl|3mf|sldprt|sldasm|ipt|iam|prt|asm)$/i.test(data.name)) { result.status = result.text ? "partial" : "unread"; result.note = "只讀出此工程檔可辨識的文字／結構；尚未完整轉換原生幾何、外部依賴或圖面。"; }
    }
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "附件解析失敗。" }); }
};
