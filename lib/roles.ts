import { Role } from "./api";

export const ROLE_LABEL: Record<Role, string> = {
  master: "마스터",
  chief_admin: "정관리자",
  operator: "운영자",
  member: "회원",
};

export const ROLE_RANK: Record<Role, number> = {
  master: 3,
  chief_admin: 2,
  operator: 1,
  member: 0,
};

export const canManageMembers = (r: Role) =>
  r === "master" || r === "chief_admin" || r === "operator";

export const canEditBranding = (r: Role) => r === "master" || r === "chief_admin";

export const canManageAffiliations = (r: Role) => r === "master";

/** Which roles this actor may ASSIGN to a target of role `targetRole`. */
export function assignableRoles(actor: Role, targetRole: Role): Role[] {
  if (actor === "master") return ["chief_admin", "operator", "member"];
  if (actor === "chief_admin") return ["chief_admin", "operator", "member"];
  if (actor === "operator") {
    // operator manages members/operators only (never chief_admin)
    if (ROLE_RANK[targetRole] > ROLE_RANK.operator) return [];
    return ["operator", "member"];
  }
  return [];
}

/** Can actor delete (탈퇴) a target of role `targetRole` (same-affiliation assumed by caller)? */
export function canDeleteUser(actor: Role, targetRole: Role): boolean {
  if (targetRole === "master") return false;
  if (actor === "master") return true;
  if (actor === "chief_admin") return ROLE_RANK[targetRole] < ROLE_RANK.chief_admin;
  if (actor === "operator") return targetRole === "member";
  return false;
}
