declare module "occt-import-js" {
  interface OcctImportOptions {
    locateFile?: (path: string, scriptDirectory?: string) => string;
  }

  interface OcctFaceColor {
    first: number;
    last: number;
    color: [number, number, number] | null;
  }

  interface OcctMeshResult {
    name: string;
    color?: [number, number, number];
    brep_faces?: OcctFaceColor[];
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index: { array: number[] };
  }

  interface OcctReadResult {
    success: boolean;
    root?: unknown;
    meshes: OcctMeshResult[];
  }

  interface OcctModule {
    ReadStepFile: (
      content: Uint8Array,
      params: {
        linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
        linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
        linearDeflection?: number;
        angularDeflection?: number;
      } | null
    ) => OcctReadResult;
  }

  export default function occtimportjs(options?: OcctImportOptions): Promise<OcctModule>;
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}
