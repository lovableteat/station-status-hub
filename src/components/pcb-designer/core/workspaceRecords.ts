import { createId } from "../defaults.ts";
import type { PcbLibraryComponent, PcbProject } from "../types.ts";
import type { ImportedComponent } from "./tabular.ts";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function newestProject(
  projects: readonly PcbProject[],
): PcbProject | undefined {
  return [...projects].sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  )[0];
}

export function withProjectIdentity(
  project: PcbProject,
  name = project.name,
): PcbProject {
  const now = timestamp();
  return {
    ...clone(project),
    id: createId("project"),
    name,
    createdAt: now,
    updatedAt: now,
  };
}

export function libraryIdentity(component: ImportedComponent): string {
  const manufacturer = component.manufacturer.trim().toLocaleLowerCase();
  const partNumber = component.partNumber.trim().toLocaleLowerCase();
  if (partNumber) return `${manufacturer}\u0000${partNumber}`;
  return [
    component.name.trim().toLocaleLowerCase(),
    component.width,
    component.height,
    component.maxHeight,
  ].join("\u0000");
}

export function toLibraryComponent(
  component: ImportedComponent,
  source: PcbLibraryComponent["source"] = "custom",
): PcbLibraryComponent {
  return {
    ...clone(component),
    id: createId("component"),
    source,
    createdAt: timestamp(),
  };
}

export function upsertImportedComponents(
  library: readonly PcbLibraryComponent[],
  components: readonly ImportedComponent[],
  source: PcbLibraryComponent["source"],
): PcbLibraryComponent[] {
  const next = library.map(clone);
  for (const component of components) {
    const key = libraryIdentity(component);
    const index = next.findIndex(
      (item) => item.source !== "built-in" && libraryIdentity(item) === key,
    );
    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...clone(component),
        source,
      };
    } else {
      next.push(toLibraryComponent(component, source));
    }
  }
  return next;
}
