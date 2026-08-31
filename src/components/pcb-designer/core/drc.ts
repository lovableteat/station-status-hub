import type { PcbDrcIssue, PcbPlacedComponent, PcbProject } from "../types.ts";
import { isWithinBoard, overlapsKeepout, rectanglesOverlap } from "./geometry.ts";
import { getComponentKeepout } from "./componentKeepout.ts";

function issue(
  code: PcbDrcIssue["code"],
  objectIds: string[],
  message: string,
  suffix = "",
): PcbDrcIssue {
  const stableIds = [...objectIds].sort();
  return {
    id: `drc-${code.toLowerCase().replaceAll("_", "-")}-${stableIds.map((id) => id.toLowerCase()).join("-")}${suffix}`,
    code,
    severity: "error",
    rule: code,
    message,
    objectIds: stableIds,
  };
}

function sortedComponents(project: PcbProject): PcbPlacedComponent[] {
  return [...project.components].sort((first, second) => first.instanceId.localeCompare(second.instanceId));
}

/** Runs deterministic board-boundary, same-layer collision, and keepout checks. */
export function runDrc(project: PcbProject): PcbDrcIssue[] {
  const components = sortedComponents(project);
  const issues: PcbDrcIssue[] = [];

  for (const component of components) {
    if (!isWithinBoard(component, project.board)) {
      issues.push(issue("OUT_OF_BOUNDS", [component.instanceId], `${component.reference} extends beyond the board boundary.`));
    }
    const keepout = getComponentKeepout(component);
    if (keepout && !isWithinBoard({ ...keepout, x: keepout.x + keepout.width / 2, y: keepout.y + keepout.height / 2, rotation: keepout.rotation ?? 0 }, project.board)) {
      issues.push(issue("OUT_OF_BOUNDS", [component.instanceId], `${component.reference} 的禁制區超出板框。`, "-keepout"));
    }
  }

  for (let firstIndex = 0; firstIndex < components.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex += 1) {
      const first = components[firstIndex];
      const second = components[secondIndex];
      if (first.layer === second.layer && rectanglesOverlap(first, second)) {
        issues.push(issue("COMPONENT_COLLISION", [first.instanceId, second.instanceId], `${first.reference} collides with ${second.reference}.`));
      }
    }
  }

  for (const component of components) {
    const attachedKeepout = getComponentKeepout(component);
    if (attachedKeepout) {
      for (const other of components) {
        if (other.instanceId !== component.instanceId && other.layer === component.layer && overlapsKeepout(other, attachedKeepout)) {
          issues.push(issue("KEEPOUT_COLLISION", [other.instanceId, component.instanceId], `${other.reference} 進入 ${component.reference} 的禁制區。`, `-owner-${component.instanceId}`));
        }
      }
    }
    for (const keepout of [...project.keepouts].sort((first, second) => first.id.localeCompare(second.id))) {
      if (overlapsKeepout(component, keepout)) {
        issues.push(issue("KEEPOUT_COLLISION", [component.instanceId, keepout.id], `${component.reference} intersects keepout ${keepout.name}.`));
      }
    }
  }

  return issues;
}
