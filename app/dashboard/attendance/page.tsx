"use client";

import RecordsView from "@/components/RecordsView";
import { menuBySlug } from "@/lib/menu";

export default function Page() {
  return <RecordsView menu={menuBySlug("attendance")!} />;
}
