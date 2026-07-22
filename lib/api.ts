import { supabase } from "./supabase";

export type Role = "master" | "chief_admin" | "operator" | "member";

export interface SessionUser {
  token: string;
  username: string;
  role: Role;
  affiliation: string | null;
}

export type SignupResult =
  | ({ pending: false } & SessionUser)
  | { pending: true; affiliation: string };

export type RecordKind = "beverage" | "shift" | "attendance" | "venue";

export interface Rec {
  id: string;
  data: Record<string, any>;
  updated_at: string;
}

export interface Branding {
  affiliation: string;
  display_name: string;
  logo_url: string | null;
}

export interface AdminAffiliation {
  name: string;
  status: "pending" | "approved";
  members: number;
  created_by: string | null;
}

export interface ManagedUser {
  id: string;
  username: string;
  role: Role;
  active: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_USERNAME: "아이디는 2자 이상이어야 합니다.",
  INVALID_PASSWORD: "비밀번호는 4자 이상이어야 합니다.",
  INVALID_AFFILIATION: "소속을 입력해 주세요.",
  USERNAME_TAKEN: "이미 사용 중인 아이디입니다.",
  INVALID_CREDENTIALS: "아이디 또는 비밀번호가 올바르지 않습니다.",
  NOT_AUTHENTICATED: "세션이 만료되었습니다. 다시 로그인해 주세요.",
  AFFILIATION_REQUIRED: "소속을 선택해 주세요.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  PENDING_APPROVAL: "소속 승인 대기 중입니다. 마스터 승인 후 로그인할 수 있습니다.",
  ACCOUNT_INACTIVE: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  FORBIDDEN: "권한이 없습니다.",
  CANNOT_DELETE_SELF: "본인 계정은 삭제할 수 없습니다.",
  AFFILIATION_TAKEN: "이미 존재하는 소속명입니다.",
  INVALID_ROLE: "잘못된 권한입니다.",
  INVALID_STATE: "이미 처리된 소속입니다.",
};

function friendly(message: string | undefined): string {
  if (!message) return "요청을 처리하지 못했습니다.";
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(key)) return ERROR_MESSAGES[key];
  }
  return message;
}

async function rpc<T>(fn: string, args: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
}

export const api = {
  signup: (username: string, password: string, affiliation: string) =>
    rpc<SignupResult>("cl_signup", {
      p_username: username,
      p_password: password,
      p_affiliation: affiliation,
    }),

  login: (username: string, password: string) =>
    rpc<{ pending: false } & SessionUser>("cl_login", {
      p_username: username,
      p_password: password,
    }),

  logout: (token: string) => rpc<void>("cl_logout", { p_token: token }),

  me: (token: string) =>
    rpc<{ username: string; role: Role; affiliation: string | null }>("cl_me", {
      p_token: token,
    }),

  affiliations: () => rpc<string[]>("cl_affiliations_list", {}),

  changePassword: (token: string, oldPw: string, newPw: string) =>
    rpc<void>("cl_change_password", { p_token: token, p_old: oldPw, p_new: newPw }),

  // records
  listRecords: (token: string, kind: RecordKind, affiliation: string | null) =>
    rpc<Rec[]>("cl_records_list", {
      p_token: token,
      p_kind: kind,
      p_affiliation: affiliation,
    }),

  upsertRecord: (
    token: string,
    id: string | null,
    kind: RecordKind,
    affiliation: string | null,
    data: Record<string, any>
  ) =>
    rpc<Rec>("cl_records_upsert", {
      p_token: token,
      p_id: id,
      p_kind: kind,
      p_affiliation: affiliation,
      p_data: data,
    }),

  deleteRecord: (token: string, id: string) =>
    rpc<void>("cl_records_delete", { p_token: token, p_id: id }),

  // branding
  getBranding: (token: string, affiliation: string | null) =>
    rpc<Branding>("cl_branding_get", { p_token: token, p_affiliation: affiliation }),

  setBranding: (
    token: string,
    affiliation: string | null,
    displayName: string,
    logoUrl: string | null
  ) =>
    rpc<Branding>("cl_branding_set", {
      p_token: token,
      p_affiliation: affiliation,
      p_display_name: displayName,
      p_logo_url: logoUrl,
    }),

  renameAffiliation: (token: string, affiliation: string | null, newName: string) =>
    rpc<{ affiliation: string }>("cl_rename_affiliation", {
      p_token: token,
      p_affiliation: affiliation,
      p_new_name: newName,
    }),

  // master: affiliations
  adminAffiliations: (token: string) =>
    rpc<AdminAffiliation[]>("cl_admin_affiliations", { p_token: token }),

  approveAffiliation: (token: string, name: string) =>
    rpc<void>("cl_admin_approve_affiliation", { p_token: token, p_name: name }),

  rejectAffiliation: (token: string, name: string) =>
    rpc<void>("cl_admin_reject_affiliation", { p_token: token, p_name: name }),

  deleteAffiliation: (token: string, name: string) =>
    rpc<void>("cl_admin_delete_affiliation", { p_token: token, p_name: name }),

  // member management
  listUsers: (token: string, affiliation: string | null) =>
    rpc<ManagedUser[]>("cl_list_users", { p_token: token, p_affiliation: affiliation }),

  setUserRole: (token: string, targetId: string, role: Role) =>
    rpc<void>("cl_set_user_role", { p_token: token, p_target: targetId, p_role: role }),

  deleteUser: (token: string, targetId: string) =>
    rpc<void>("cl_delete_user", { p_token: token, p_target: targetId }),
};
