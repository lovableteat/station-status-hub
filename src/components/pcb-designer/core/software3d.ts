import type { PcbBoard, PcbPlacedComponent } from "../types.ts";

export interface SoftwarePoint3 {
  x: number;
  y: number;
  z: number;
}

export interface SoftwareViewState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface SoftwareViewport {
  width: number;
  height: number;
}

export interface SoftwareCamera {
  eye: SoftwarePoint3;
  forward: SoftwarePoint3;
  right: SoftwarePoint3;
  up: SoftwarePoint3;
  focalLength: number;
  centerX: number;
  centerY: number;
  near: number;
}

export interface SoftwareProjectedPoint {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}

export const DEFAULT_SOFTWARE_VIEW: SoftwareViewState = {
  yaw: -0.72,
  pitch: 0.58,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const MAX_SOFTWARE_MODEL_TRIANGLES = 8_000;

function subtract(a: SoftwarePoint3, b: SoftwarePoint3): SoftwarePoint3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: SoftwarePoint3, b: SoftwarePoint3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: SoftwarePoint3, b: SoftwarePoint3): SoftwarePoint3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(point: SoftwarePoint3): SoftwarePoint3 {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

export function createSoftwareCamera(
  board: Pick<PcbBoard, "width" | "height">,
  viewport: SoftwareViewport,
  view: SoftwareViewState,
): SoftwareCamera {
  const sceneSize = Math.max(board.width, board.height, 40);
  const distance = sceneSize * 1.9;
  const horizontalDistance = Math.cos(view.pitch) * distance;
  const eye = {
    x: Math.sin(view.yaw) * horizontalDistance,
    y: Math.sin(view.pitch) * distance,
    z: Math.cos(view.yaw) * horizontalDistance,
  };
  const target = { x: 0, y: 0, z: 0 };
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  const fieldOfView = (40 * Math.PI) / 180;
  const focalLength = (Math.min(viewport.width, viewport.height) / 2) / Math.tan(fieldOfView / 2);

  return {
    eye,
    forward,
    right,
    up,
    focalLength: focalLength * view.zoom,
    centerX: viewport.width / 2 + view.panX,
    centerY: viewport.height / 2 + view.panY,
    near: 0.1,
  };
}

export function projectSoftwarePoint(
  point: SoftwarePoint3,
  camera: SoftwareCamera,
): SoftwareProjectedPoint {
  const relative = subtract(point, camera.eye);
  const depth = dot(relative, camera.forward);
  if (depth <= camera.near) {
    return { x: camera.centerX, y: camera.centerY, depth, visible: false };
  }
  const scale = camera.focalLength / depth;
  return {
    x: camera.centerX + dot(relative, camera.right) * scale,
    y: camera.centerY - dot(relative, camera.up) * scale,
    depth,
    visible: true,
  };
}

export function createSoftwareBoxVertices(
  width: number,
  height: number,
  depth: number,
): SoftwarePoint3[] {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  return [
    { x: -x, y: -y, z: -z },
    { x, y: -y, z: -z },
    { x, y: -y, z },
    { x: -x, y: -y, z },
    { x: -x, y, z: -z },
    { x, y, z: -z },
    { x, y, z },
    { x: -x, y, z },
  ];
}

export function transformPcbComponentPoint(
  localPoint: SoftwarePoint3,
  component: Pick<PcbPlacedComponent, "x" | "y" | "width" | "height" | "maxHeight" | "rotation" | "layer">,
  board: Pick<PcbBoard, "width" | "height">,
  boardThickness = 1.6,
): SoftwarePoint3 {
  const angle = -(component.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const raisedPoint = {
    x: localPoint.x,
    y: localPoint.y + boardThickness / 2 + component.maxHeight / 2,
    z: localPoint.z,
  };
  const rotated = {
    x: raisedPoint.x * cos + raisedPoint.z * sin,
    y: raisedPoint.y,
    z: -raisedPoint.x * sin + raisedPoint.z * cos,
  };
  if (component.layer === "bottom") {
    rotated.x *= -1;
    rotated.y *= -1;
  }

  return {
    x: component.x + component.width / 2 - board.width / 2 + rotated.x,
    y: rotated.y,
    z: board.height / 2 - component.y - component.height / 2 + rotated.z,
  };
}

export function sampleTriangleOffsets(indexCount: number, budget: number): number[] {
  const triangleCount = Math.floor(indexCount / 3);
  if (triangleCount <= 0 || budget <= 0) return [];
  const stride = Math.max(1, Math.ceil(triangleCount / budget));
  const offsets: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    offsets.push(triangle * 3);
  }
  return offsets;
}

export function getSoftwareFaceNormal(
  a: SoftwarePoint3,
  b: SoftwarePoint3,
  c: SoftwarePoint3,
): SoftwarePoint3 {
  return normalize(cross(subtract(b, a), subtract(c, a)));
}

export function getSoftwareLightLevel(normal: SoftwarePoint3): number {
  const light = normalize({ x: -0.35, y: 0.85, z: 0.4 });
  return 0.46 + Math.abs(dot(normal, light)) * 0.54;
}
