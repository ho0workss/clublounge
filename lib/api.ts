import { supabase } from "./supabase";

export type Role = "master" | "member";

export interface SessionUser {
  token: string;
  username: string;
  role: Role;
  affiliation: string | null;
}

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

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_USERNAME: "아이디는 2자 이상이어야 합니다.",
  INVALID_PASSWORD: "비밀번호는 4자 이상이어야 합니다.",
  INVALID_AFFILIATION: "소속을 입력해 주세요.",
  USERNAME_TAKEN: "이미 사용 중인 아이디입니다.",
  INVALID_CREDENTIALS: "아이디 또는 비밀번호가 올바르지 않습니다.",
  NOT_AUTHENTICATED: "세션이 만료되었습니다. 다시 로그인해 주세요.",
  AFFILIATION_REQUIRED: "소속을 선택해 주세요.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
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
    rpc<SessionUser>("cl_signup", {
      p_username: username,
      p_password: password,
      p_affiliation: affiliation,
    }),

  login: (username: string, password: string) =>
    rpc<SessionUser>("cl_login", { p_username: username, p_password: password }),

  logout: (token: string) => rpc<void>("cl_logout", { p_token: token }),

  me: (token: string) =>
    rpc<{ username: string; role: Role; affiliation: string | null }>("cl_me", {
      p_token: token,
    }),

  affiliations: () => rpc<string[]>("cl_affiliations_list", {}),

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

  getBranding: (token: string, affiliation: string | null) =>
    rpc<Branding>("cl_branding_get", {
      p_token: token,
      p_affiliation: affiliation,
    }),

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
};
