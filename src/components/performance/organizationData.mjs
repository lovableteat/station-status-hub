const key = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase();

// The roster includes every site account; only an actual organization row has
// an updated_at value. A root director has no manager but is still assigned.
export const isOrganizationAssigned = (member) => member.updated_at != null;
export const availableOrganizationMembers = (members) =>
  members.filter(
    (member) =>
      member.account_status === "active" && !isOrganizationAssigned(member),
  );

// Acting sections are presentation groups, not duplicate employee accounts.
// The saved manager_id remains the director for permissions and review routing.
export function organizationActingSections(parent, reports) {
  if (parent.org_level !== "director") return [];
  const sections = new Map();
  for (const member of reports) {
    if (
      member.org_level !== "member" ||
      member.manager_id !== parent.employee_id
    )
      continue;
    const section = member.section.trim();
    if (!sections.has(section))
      sections.set(section, {
        key: JSON.stringify(["acting-section", parent.employee_id, section]),
        section,
        members: [],
      });
    sections.get(section).members.push(member);
  }
  return [...sections.values()];
}

export function findOrganizationReview(member, reviews, cycle) {
  const candidates = reviews.filter((review) => review.cycleId === cycle);
  return (
    candidates.find((review) => review.employeeId === member.employee_id) ||
    candidates.find(
      (review) => key(review.employeeId) === key(member.username),
    ) ||
    candidates.find(
      (review) => key(review.employeeId) === key(member.display_name),
    ) ||
    null
  );
}

export function validateOrganizationManager(members, employeeId, managerId) {
  if (!managerId) return "";
  const manager = members.find((member) => member.employee_id === managerId);
  if (!manager?.is_manager || manager.account_status !== "active")
    return "請選擇啟用中的績效主管或管理員。";
  const byId = new Map(members.map((member) => [member.employee_id, member]));
  const visited = new Set([employeeId]);
  let current = managerId;
  while (current) {
    if (visited.has(current)) return "直屬主管不可是本人，也不可形成循環隸屬。";
    visited.add(current);
    current = byId.get(current)?.manager_id;
  }
  return "";
}

export function organizationTreeMembers(members, matchingIds) {
  const byId = new Map(members.map((member) => [member.employee_id, member]));
  const included = new Set(matchingIds);
  for (const id of matchingIds) {
    const visited = new Set([id]);
    let parent = byId.get(id)?.manager_id;
    while (parent && byId.has(parent) && !visited.has(parent)) {
      included.add(parent);
      visited.add(parent);
      parent = byId.get(parent)?.manager_id;
    }
  }
  return members.filter((member) => included.has(member.employee_id));
}
