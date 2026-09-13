"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRIES, countryByCode, type Country } from "@/lib/applications/countries";

/**
 * The dialling-code picker that sits in front of the phone box.
 *
 * A searchable listbox rather than a native `<select>`: 248 options is far
 * past what a native dropdown is usable for on a phone, where it becomes a
 * full-screen wheel you scroll through by name with no way to jump. Typing
 * two letters is the whole point.
 *
 * Written out rather than taken from a library because the ones that do this
 * arrive with a phone-number parser attached, which is a large dependency for
 * a picker. What is here is a plain listbox with the ARIA it needs.
 */

/**
 * Fold a string for searching: lower-cased, and with diacritics removed so
 * that "turkiye" finds Türkiye and "cote" finds Côte d'Ivoire. Without this
 * the countries whose names carry marks are reachable only by scrolling,
 * which is exactly the ones a keyboard makes hardest to type.
 */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Pre-folded once, at module load, rather than on every keystroke. */
const SEARCHABLE: readonly { c: Country; hay: string }[] = COUNTRIES.map((c) => ({
  c,
  // The ISO code is in the haystack too, so "gb" and "ae" work as shortcuts.
  hay: `${fold(c.name)} ${c.dial} ${fold(c.cc)}`,
}));

export function CountrySelect({
  value, onChange, disabled,
}: {
  /** ISO 3166-1 alpha-2. */
  value: string;
  onChange: (cc: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const wrap = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = countryByCode(value) ?? COUNTRIES[0];

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return COUNTRIES;
    // A leading + is how people type a dial code; the haystack holds it too,
    // so only the bare digits case needs helping along.
    const bare = needle.replace(/^\+/, "");
    return SEARCHABLE.filter(({ hay }) => hay.includes(needle) || hay.includes(`+${bare}`))
      .map(({ c }) => c);
  }, [q]);

  /**
   * Shut the panel and forget the search.
   *
   * Every path that closes goes through here rather than through an effect
   * watching `open`: resetting state in an effect means a second render pass
   * after every close, and React's lint rule rightly objects. Closing is
   * always something the user did, so it always has an event to hang off.
   */
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(0);
  }, []);

  // Close on a click anywhere else. Pointerdown rather than click so the
  // panel is gone before a tap lands on whatever was behind it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, close]);

  // Focusing the search box is a DOM call, not state, so it belongs in an
  // effect — it can only happen once the input is actually mounted.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-at="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (c: Country) => {
    onChange(c.cc);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // The picker lives inside the funnel's <form>; without this, Enter here
      // would submit the step instead of choosing the highlighted country.
      e.preventDefault();
      const c = shown[active];
      if (c) pick(c);
    }
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Country dialling code: ${selected.name} ${selected.dial}. Change`}
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-lg border border-line bg-background px-3",
          "text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50",
        )}
      >
        <span aria-hidden className="text-base leading-none">{selected.flag}</span>
        <span className="tabular-nums">{selected.dial}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-3rem))]",
            "overflow-hidden rounded-xl border border-line bg-popover shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search country or code"
              aria-label="Search for a country"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${shown[active].cc}` : undefined}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Country"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {shown.map((c, at) => {
              const isSelected = c.cc === selected.cc;
              return (
                <li key={c.cc} id={`${listId}-${c.cc}`} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    data-at={at}
                    // Pointerdown, not click: the search box has focus, and a
                    // click would fire only after a blur that closes the panel.
                    onPointerDown={(e) => { e.preventDefault(); pick(c); }}
                    onMouseEnter={() => setActive(at)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                      at === active && "bg-foreground/5",
                    )}
                  >
                    <span aria-hidden className="text-base leading-none">{c.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{c.dial}</span>
                    {isSelected && <Check className="size-3.5 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No country matches “{q}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
