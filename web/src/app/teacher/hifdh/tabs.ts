import type { HifzTab } from "@/components/app/hifz-tabs";

/** The register's tabs; `?tab=<id>` for every one but the first. */
export const HIFDH_TABS: HifzTab[] = [
  { id: "overview", label: "Overview" },
  { id: "hear", label: "Hear" },
];

/**
 * The ustadhs' teacher also has Murāja'ah. HifzTabs links it as
 * `?tab=murajaah`, which the register page redirects to its own route.
 */
export const MURAJAAH_TABS: HifzTab[] = [...HIFDH_TABS, { id: "murajaah", label: "Murāja'ah" }];
