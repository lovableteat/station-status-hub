declare module "utif" {
  interface TiffPage { width: number; height: number; t256?: number[]; t257?: number[] }
  export function decode(data: ArrayBuffer): TiffPage[];
  export function decodeImage(data: ArrayBuffer, page: TiffPage): void;
  export function toRGBA8(page: TiffPage): Uint8Array;
}
