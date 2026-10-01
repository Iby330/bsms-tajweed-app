import type { Category } from "@/lib/hifz/mistake-taxonomy";

/** Category → its mark colour, as Tailwind classes. Text never wears these;
 *  a dot, bar or underline beside it does. Shared by the board's server and
 *  client parts, so it lives outside either. */
export const CAT_BG: Record<Category, string> = {
  hifz: "bg-cat-hifdh",
  tajweed: "bg-cat-tajweed",
  makhraj: "bg-cat-makhraj",
};
export const CAT_BORDER: Record<Category, string> = {
  hifz: "border-cat-hifdh",
  tajweed: "border-cat-tajweed",
  makhraj: "border-cat-makhraj",
};
export const CAT_FILL: Record<Category, string> = {
  hifz: "fill-cat-hifdh",
  tajweed: "fill-cat-tajweed",
  makhraj: "fill-cat-makhraj",
};
