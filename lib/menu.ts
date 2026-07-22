import { RecordKind } from "./api";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  /** show in the table columns (defaults true) */
  column?: boolean;
}

export interface MenuDef {
  slug: string;
  kind: RecordKind;
  label: string;
  icon: string;
  description: string;
  fields: FieldDef[];
}

export const MENUS: MenuDef[] = [
  {
    slug: "beverages",
    kind: "beverage",
    label: "주류 및 비품",
    icon: "🍾",
    description: "주류·비품 재고를 등록하고 수량을 관리합니다.",
    fields: [
      { key: "name", label: "품목명", type: "text", placeholder: "예) 참이슬" },
      {
        key: "category",
        label: "분류",
        type: "select",
        options: ["소주", "맥주", "양주", "와인", "칵테일", "안주", "비품", "기타"],
      },
      { key: "quantity", label: "수량", type: "number", placeholder: "0" },
      {
        key: "unit",
        label: "단위",
        type: "select",
        options: ["병", "캔", "박스", "개", "잔", "kg", "L"],
      },
      { key: "note", label: "비고", type: "textarea", column: false },
    ],
  },
  {
    slug: "shifts",
    kind: "shift",
    label: "조판현황",
    icon: "🗓️",
    description: "근무 조판(스케줄) 편성 현황을 관리합니다.",
    fields: [
      { key: "date", label: "날짜", type: "date" },
      { key: "name", label: "직원명", type: "text", placeholder: "이름" },
      {
        key: "position",
        label: "포지션",
        type: "select",
        options: ["홀", "바(Bar)", "주방", "매니저", "캐셔", "기타"],
      },
      { key: "start", label: "시작", type: "time" },
      { key: "end", label: "종료", type: "time" },
      { key: "note", label: "비고", type: "textarea", column: false },
    ],
  },
  {
    slug: "attendance",
    kind: "attendance",
    label: "출근부",
    icon: "🕘",
    description: "일자별 출·퇴근과 근태 상태를 기록합니다.",
    fields: [
      { key: "date", label: "날짜", type: "date" },
      { key: "name", label: "직원명", type: "text", placeholder: "이름" },
      { key: "checkIn", label: "출근", type: "time" },
      { key: "checkOut", label: "퇴근", type: "time" },
      {
        key: "status",
        label: "상태",
        type: "select",
        options: ["정상", "지각", "조퇴", "결근", "휴무", "연차"],
      },
      { key: "note", label: "비고", type: "textarea", column: false },
    ],
  },
  {
    slug: "venues",
    kind: "venue",
    label: "업장 현황",
    icon: "🏬",
    description: "업장(룸·테이블)의 현재 상태를 관리합니다.",
    fields: [
      { key: "name", label: "업장/룸", type: "text", placeholder: "예) 1번 룸" },
      {
        key: "status",
        label: "상태",
        type: "select",
        options: ["영업중", "예약", "이용중", "정리중", "마감", "점검"],
      },
      { key: "capacity", label: "수용인원", type: "number", placeholder: "0" },
      { key: "note", label: "비고", type: "textarea", column: false },
    ],
  },
];

export function menuBySlug(slug: string): MenuDef | undefined {
  return MENUS.find((m) => m.slug === slug);
}
