const GENERATED_OBJECT_NAME = /^(?:(?:mesh|node)(?:_|$|\d)|_?instance(?:_|$|\d))/i;

function cleanObjectName(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getInspectablePartName(object) {
  const fallback = cleanObjectName(object?.name);
  let current = object;

  while (current) {
    const name = cleanObjectName(current.name);
    if (name && !GENERATED_OBJECT_NAME.test(name)) return name;
    current = current.parent;
  }

  return fallback;
}

export function collectInspectablePartNames(root) {
  const names = new Set();

  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const name = getInspectablePartName(object);
    if (name) names.add(name);
  });

  return [...names].sort((left, right) => left.localeCompare(right));
}
