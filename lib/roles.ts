import { Role } from "./api";

export const ROLE_LABEL: Record<Role, string> = {
  master: "마스터",
  chief_admin: "정관리자",
  operator: "운영진",
  deputy: "부운영진",
  member: "회원",
};

export const ROLE_RANK: Record<Role, number> = {
  master: 4,
  chief_admin: 3,
  operator: 2,
  deputy: 1,
  member: 0,
};

export const ROLE_BADGE: Record<Role, string> = {
  master: "bg-brand-600",
  chief_admin: "bg-emerald-600",
  operator: "bg-sky-600",
  deputy: "bg-teal-500",
  member: "bg-slate-400",
};

export const canManageMembers = (r: Role) => ROLE_RANK[r] >= ROLE_RANK.operator;
export const canEditBranding = (r: Role) => r === "master" || r === "chief_admin";
export const canManageAffiliations = (r: Role) => r === "master";

/** 주류구성(가격·세트) 편집 — 운영진 이상 */
export const canEditLiquorConfig = (r: Role) => ROLE_RANK[r] >= ROLE_RANK.operator;
/** 비품대 편집 — 부운영진 이상 */
export const canEditSupplies = (r: Role) => ROLE_RANK[r] >= ROLE_RANK.deputy;
/** 조판 테이블 생성·이동 — 운영진 이상(정관리자·운영진) */
export const canManageTables = (r: Role) => ROLE_RANK[r] >= ROLE_RANK.operator;

/** Which roles this actor may ASSIGN to a target of role `targetRole`. */
export function assignableRoles(actor: Role, targetRole: Role): Role[] {
  if (actor === "master" || actor === "chief_admin")
    return ["chief_admin", "operator", "deputy", "member"];
  if (actor === "operator") {
    if (ROLE_RANK[targetRole] > ROLE_RANK.operator) return [];
    return ["operator", "deputy", "member"];
  }
  return [];
}

/** Can actor delete (탈퇴) a target of role `targetRole` (same-affiliation assumed by caller)? */
export function canDeleteUser(actor: Role, targetRole: Role): boolean {
  if (targetRole === "master") return false;
  if (actor === "master") return true;
  if (actor === "chief_admin") return ROLE_RANK[targetRole] < ROLE_RANK.chief_admin;
  if (actor === "operator") return ROLE_RANK[targetRole] < ROLE_RANK.operator;
  return false;
}
