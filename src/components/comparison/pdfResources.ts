// Vite emits only static package assets; font/CMap requests never send a PDF to another service.
const resources = import.meta.glob<string>([
  "../../../node_modules/pdfjs-dist/cmaps/*.bcmap",
  "../../../node_modules/pdfjs-dist/standard_fonts/*.pfb",
  "../../../node_modules/pdfjs-dist/standard_fonts/*.ttf",
  "../../../node_modules/pdfjs-dist/wasm/*.wasm",
], { eager: true, query: "?url", import: "default" });

async function readResource(folder: string, filename: string): Promise<Uint8Array> {
  const entry = Object.entries(resources).find(([path]) => path.endsWith(`/${folder}/${filename}`));
  if (!entry) throw new Error(`PDF 資源不存在：${filename}`);
  const response = await fetch(entry[1]);
  if (!response.ok) throw new Error(`無法載入 PDF 資源：${filename}`);
  return new Uint8Array(await response.arrayBuffer());
}

export class LocalCMapReaderFactory {
  async fetch({ name }: { name: string }) { return { cMapData: await readResource("cmaps", `${name}.bcmap`), isCompressed: true }; }
}
export class LocalStandardFontDataFactory {
  async fetch({ filename }: { filename: string }) { return readResource("standard_fonts", filename); }
}
export class LocalWasmFactory {
  async fetch({ filename }: { filename: string }) { return readResource("wasm", filename); }
}
