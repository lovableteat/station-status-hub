const key = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase();

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
