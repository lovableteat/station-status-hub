import { normalizeMaterialSearchText, splitRefDesignators } from "./materialRequestUtils";

export function isMaterialReferenceQuery(value: string) {
  return /^[a-z]{1,8}\d+(?:_[a-z0-9]+)*$/i.test(normalizeMaterialSearchText(value));
}

export function matchesMaterialReference(value: string, query: string) {
  const token = normalizeMaterialSearchText(query);
  return splitRefDesignators(value).some(value => {
    const ref = normalizeMaterialSearchText(value);
    // A complete designator may have a board suffix, but never a different prefix or number.
    return isMaterialReferenceQuery(token)
      ? ref === token || ref.startsWith(`${token}_`)
      : ref.startsWith(token);
  });
}
