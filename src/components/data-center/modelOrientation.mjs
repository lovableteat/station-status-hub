export function getModelAxisRotation(upAxis) {
  if (upAxis === "x") return [0, 0, Math.PI / 2];
  if (upAxis === "z") return [-Math.PI / 2, 0, 0];
  return [0, 0, 0];
}
