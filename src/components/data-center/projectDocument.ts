import type { DataCenterProjectDocument } from "./useSharedDataCenterProjects";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === "string");
const numbers = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
const rows = (value: unknown, validate: (row: Record<string, unknown>) => boolean) =>
  Array.isArray(value) && value.every((row) => record(row) && validate(row));

/** Only the migration's explicit empty object is an uninitialized placeholder.
 * Unsupported or damaged existing documents must never be replaced by defaults. */
export function isUninitializedDataCenterDocument(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 0;
}

export function parseDataCenterDocument(value: unknown): DataCenterProjectDocument | null {
  if (!record(value) || (value.schemaVersion !== undefined && value.schemaVersion !== 1)) return null;
  const sites = value.sites;
  const facilities = value.facilityPlans;
  if (!Array.isArray(sites) || !sites.length || !record(facilities)) return null;
  const validSites = rows(sites, (site) => strings(site, ["id", "label", "country", "phase", "targetDate", "networkReady", "siteManager"])
    && numbers(site, ["powerBudgetKw", "coolingBudgetKw"])
    && rows(site.checklist, (item) => strings(item, ["id", "label"]) && typeof item.done === "boolean")
    && Array.isArray(site.racks) && site.racks.length > 0
    && rows(site.racks, (rack) => strings(rack, ["id", "zone", "row", "cabinet", "modelId", "l10ModelId", "owner", "coordinates", "aisle"])
      && ["allocated", "reserved", "available", "blocked"].includes(String(rack.status))
      && numbers(rack, ["l10Count", "l10StartU", "powerKw", "coolingKw", "temperatureC", "utilizationPercent", "uplinks", "positionX", "positionZ", "rotation", "capacityU"])
      && rows(rack.devices, (device) => strings(device, ["id", "name", "type", "health", "serial", "assetTag", "model", "role", "network", "powerFeed", "bmc", "redfish", "note"])
        && numbers(device, ["slotStart", "slotSpan"]))
      && Array.isArray(rack.sop) && rack.sop.every((step) => typeof step === "string")
      && rows(rack.deploymentSteps, (step) => strings(step, ["id", "title", "owner", "status"]))
      && rows(rack.maintenance, (item) => strings(item, ["id", "title", "owner", "status", "updatedAt", "detail"]))));
  if (!validSites) return null;
  for (const facility of Object.values(facilities)) {
    if (!record(facility) || !numbers(facility, ["width", "depth", "wallHeight"])
      || typeof facility.showWalls !== "boolean" || typeof facility.showGrid !== "boolean"
      || !rows(facility.aisles, (aisle) => strings(aisle, ["id", "label", "kind"])
        && numbers(aisle, ["x", "z", "width", "depth", "rotation"]))
      || !rows(facility.powerFeeds, (feed) => strings(feed, ["id", "label", "color"])
        && numbers(feed, ["x", "z"]) && typeof feed.enabled === "boolean")) return null;
  }
  if (value.modelOverrides !== undefined && !record(value.modelOverrides)) return null;
  // Preserve all existing fields; validation does not rewrite source documents.
  return { ...value, schemaVersion: 1, modelOverrides: value.modelOverrides ?? {} } as unknown as DataCenterProjectDocument;
}
