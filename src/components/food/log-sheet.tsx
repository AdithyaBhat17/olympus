"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet } from "@/components/session/sheet";
import { cn } from "@/lib/utils";
import { dayTotals, forGrams, MEALS, type Meal } from "@/domain/nutrition";
import { hapticTick } from "@/lib/haptics";
import { densityFromPortions } from "@/server/food/text-parse";
import { rememberTab } from "./last-tab";
import { BarcodeIcon, SearchIcon, SparkIcon } from "./composer-dock";
import type { FoodSummary, SavedMeal } from "@/server/food/foods";
import type { TextDraft } from "@/server/food/log-text";
import {
  barcodeAction,
  draftTextAction,
  foodDetailAction,
  logItemsAction,
  quickFoodsAction,
  saveMealAction,
  searchFoodsAction,
  toggleFavouriteAction,
  webFoodAction,
} from "@/app/(app)/food/actions";

export type LogTab = "describe" | "search" | "barcode";
type Tab = LogTab;

const MEAL_NAME: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

interface BasketItem {
  key: string;
  food: FoodSummary;
  grams: number;
  portions: Array<{ label: string; grams: number }>;
  /** From the text parser. */
  said?: string;
  estGrams?: number;
  confidence?: number;
  basis?: string;
  alternatives?: FoodSummary[];
  /** "HH:mm" from a describe: logged as its own meal at that time. */
  time?: string | null;
}

/** A supplement named in a describe ("at 9:30 thyroid tablet"): logged as a dose. */
interface DoseItem {
  key: string;
  supplement: { id: string; name: string; servingDesc: string };
  time: string | null;
}

const SOURCE_SHORT: Record<string, string> = {
  user: "Mine",
  recipe: "Recipe",
  indb: "INDB",
  usda_foundation: "USDA",
  usda_sr: "USDA",
  usda_fndds: "USDA",
  off: "OFF",
  web: "Web",
};

/** Where the grams came from, in words. */
const BASIS: Record<string, string> = {
  stated: "Amount you said",
  usual: "Your usual amount",
  portion: "Standard portion",
  estimate: "Estimated amount",
};

/** USDA survey data has portions like "Guideline amount per cup of hot cereal": not something to choose. */
const usablePortion = (p: { label: string }) => !/^(\d+(?:\.\d+)?\s+)?guideline amount|not specified/i.test(p.label.trim());

const per100 = (f: FoodSummary) => ({ kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fibre: f.fibre100g });
const isCollagen = (f: FoodSummary) => /\bcollagen\b/i.test(f.name);

let seq = 0;
const newKey = () => `b${++seq}`;

export function LogSheet({
  open,
  onClose,
  date,
  isToday,
  defaultMeal,
  initialTab = "describe",
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  isToday: boolean;
  defaultMeal: Meal;
  initialTab?: LogTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  // Finding foods and checking amounts are two steps: the sheet never shows both at once.
  const [step, setStep] = useState<"find" | "review">("find");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [doses, setDoses] = useState<DoseItem[]>([]);
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [time, setTime] = useState("13:00");
  const [draftMeta, setDraftMeta] = useState<{ text: string; model: string; cost: number | null; draftIds: string[] } | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [mealName, setMealName] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMeal(defaultMeal);
    setTab(initialTab);
    setStep("find");
  }, [open, defaultMeal, initialTab]);

  const reset = () => {
    setBasket([]);
    setDoses([]);
    setDraftMeta(null);
    setFromSaved(false);
    setStep("find");
  };

  const add = async (food: FoodSummary, grams?: number) => {
    const key = newKey();
    const g = grams ?? food.servingG ?? 100;
    setBasket((b) => [...b, { key, food, grams: g, portions: [] }]);
    const r = await foodDetailAction(food.id);
    if (r.ok) setBasket((b) => b.map((i) => (i.key === key ? { ...i, portions: r.data.portions.filter(usablePortion) } : i)));
  };

  const addMeal = (m: SavedMeal) => {
    setBasket((b) => [...b, ...m.items.map((i) => ({ key: newKey(), food: i.food, grams: i.grams, portions: [] }))]);
    setFromSaved(true);
  };

  const saveAsMeal = async () => {
    const name = mealName?.trim();
    if (!name) return;
    const r = await saveMealAction(name, basket.map((i) => ({ foodId: i.food.id, grams: i.grams })));
    if (r.ok) {
      toast.success(`Saved "${name}"`);
      setMealName(null);
    } else toast.error(r.error);
  };

  const fromDraft = (d: TextDraft, text: string) => {
    const named = d.items.filter((i) => i.supplement).map((i) => ({ key: newKey(), supplement: i.supplement!, time: i.time }));
    setDoses((ds) => [...ds, ...named.filter((n) => !ds.some((x) => x.supplement.id === n.supplement.id))]);
    const items: BasketItem[] = d.items
      .filter((i) => i.match && !i.supplement)
      .map((i) => ({
        key: newKey(),
        food: i.match!,
        grams: i.grams,
        portions: i.match!.portions.filter(usablePortion),
        said: i.said,
        estGrams: i.estGrams,
        confidence: i.confidence,
        basis: i.basis,
        alternatives: i.alternatives,
        time: i.time,
      }));
    const missed = d.items.filter((i) => !i.match && !i.supplement).map((i) => i.said);
    setBasket((b) => [...b, ...items]);
    // Several describes in one sheet: keep every draft id; the last text/model stand for the log.
    setDraftMeta((m) => ({ text: m ? `${m.text}; ${text}` : text, model: d.model, cost: (m?.cost ?? 0) + (d.costUsd ?? 0), draftIds: [...(m?.draftIds ?? []), ...(d.draftId ? [d.draftId] : [])] }));
    if (items.length || named.length) setStep("review");
    if (missed.length) toast.warning(`No match for ${missed.join(", ")}. Search for ${missed.length > 1 ? "them" : "it"} instead.`);
  };

  const totals = useMemo(
    () =>
      dayTotals(
        basket.map((i) => ({ ...forGrams(per100(i.food), i.grams), countsToProtein: !isCollagen(i.food) }))
      ),
    [basket]
  );

  const save = () =>
    startSave(async () => {
      const r = await logItemsAction({
        meal,
        ...(isToday ? {} : { date, time }),
        inputMode: draftMeta ? "text" : fromSaved ? "saved" : basket.length === 1 && tab === "barcode" ? "barcode" : "search",
        rawText: draftMeta?.text ?? null,
        model: draftMeta?.model ?? null,
        costUsd: draftMeta?.cost ?? null,
        draftIds: draftMeta?.draftIds ?? [],
        items: basket.map((i) => ({ foodId: i.food.id, grams: i.grams, estGrams: i.estGrams ?? null, confidence: i.confidence ?? null, time: i.time ?? null })),
        doses: doses.map((d) => ({ supplementId: d.supplement.id, time: d.time })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const parts = [
        basket.length ? `${Math.round(totals.kcal)} kcal, ${Math.round(totals.proteinCounted)} g protein` : null,
        doses.length ? doses.map((d) => d.supplement.name).join(", ") : null,
      ].filter(Boolean);
      toast.success(`Logged ${parts.join(" and ")}`);
      for (const n of r.data.nudges) toast.info(n, { duration: 9000 });
      reset();
      onClose();
      router.refresh();
    });

  const count = basket.length + doses.length;
  const reviewing = step === "review" && count > 0;
  const chooseTab = (t: Tab) => {
    hapticTick();
    setTab(t);
    rememberTab(t);
  };

  return (
    <Sheet open={open} onClose={onClose} label="Log food" variant="full">
      <div className="flex flex-col h-full max-w-lg mx-auto w-full">
        {reviewing ? (
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <button type="button" onClick={() => setStep("find")} aria-label="Back to adding food" className="btn-round">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <h2 className="m-0 mx-auto text-[17px] font-extrabold">Review</h2>
            <span className="w-11" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pt-4 pb-3">
              <button type="button" onClick={onClose} aria-label="Close" className="btn-round">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <h2 className="m-0 mx-auto text-[17px] font-extrabold">Add to {MEAL_NAME[meal]}</h2>
              <span className="w-11" aria-hidden="true" />
            </div>

            <div className="seg px-4 pb-4" role="tablist" aria-label="How to log">
              {(
                [
                  ["search", "Search", <SearchIcon key="i" size={16} />],
                  ["describe", "Describe", <SparkIcon key="i" size={15} />],
                  ["barcode", "Barcode", <BarcodeIcon key="i" size={16} />],
                ] as const
              ).map(([t, label, icon]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => chooseTab(t)}
                  className={cn("seg-btn inline-flex items-center justify-center gap-1.5", tab === t && "seg-on")}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* Kept mounted while reviewing, so "back" returns to the same search. */}
          <div className={reviewing ? "hidden" : undefined}>
            {tab === "describe" && <DescribeTab onDraft={fromDraft} />}
            {tab === "search" && <SearchTab onPick={(f, g) => add(f, g)} onPickMeal={addMeal} />}
            {tab === "barcode" && <BarcodeTab onFound={(f) => add(f)} />}
          </div>

          {reviewing && (
            <section>
              <div className="flex gap-2 mb-4 overflow-x-auto scroller" role="group" aria-label="Meal">
                {MEALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={meal === m}
                    onClick={() => setMeal(m)}
                    className={cn("h-10 px-4 rounded-full text-[15px] font-semibold whitespace-nowrap shrink-0", meal === m ? "bg-fg text-bg" : "bg-surface text-fg-2")}
                  >
                    {MEAL_NAME[m]}
                  </button>
                ))}
              </div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="section-label m-0">Check the amounts</h3>
                <span className="text-[13px] text-muted tabular-nums">
                  <span className="num text-[15px] text-accent">{Math.round(totals.proteinCounted)} g</span> · {Math.round(totals.kcal)} kcal
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
                {doses.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 rounded-[24px] bg-surface pl-3 pr-1 py-2">
                    <span aria-hidden="true" className="size-10 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                        <path d="m8.5 8.5 7 7" />
                      </svg>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-semibold truncate">{d.supplement.name}</span>
                      <span className="flex items-center gap-1.5 mt-1">
                        <span className="tag h-6 text-[12px] bg-fg text-bg tabular-nums">{d.time ? `At ${d.time}` : "Now"}</span>
                        <span className="text-[13px] text-muted truncate">{d.supplement.servingDesc}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDoses((ds) => ds.filter((x) => x.key !== d.key))}
                      aria-label={`Don't log ${d.supplement.name}`}
                      className="size-11 rounded-full flex items-center justify-center text-fg-2"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {basket.map((i) => (
                  <BasketRow
                    key={i.key}
                    item={i}
                    onChange={(patch) => setBasket((b) => b.map((x) => (x.key === i.key ? { ...x, ...patch } : x)))}
                    onRemove={() => setBasket((b) => b.filter((x) => x.key !== i.key))}
                  />
                ))}
              </ul>
              {totals.proteinExcluded > 0 && (
                <p className="text-[13px] text-muted mt-2 mb-0">
                  {totals.proteinExcluded} g collagen protein isn&apos;t counted toward your protein target.
                </p>
              )}
              {basket.length > 1 &&
                (mealName === null ? (
                  <button type="button" onClick={() => setMealName("")} className="btn-ghost w-full mt-3">
                    Save these as a meal
                  </button>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <input
                      autoFocus
                      value={mealName}
                      onChange={(e) => setMealName(e.target.value)}
                      placeholder="Usual breakfast"
                      aria-label="Meal name"
                      className="input-base flex-1 rounded-full"
                    />
                    <button type="button" onClick={saveAsMeal} disabled={!mealName.trim()} className="h-12 px-5 rounded-full bg-fg text-bg text-[15px] font-bold disabled:opacity-40">
                      Save
                    </button>
                  </div>
                ))}
              {!isToday && basket.some((i) => !i.time) && (
                <label className="flex items-center justify-between mt-4 h-14 px-5 rounded-[20px] bg-surface">
                  <span className="text-[16px] font-semibold">Time eaten</span>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 px-3 rounded-full bg-surface-2 text-fg num text-[15px]" />
                </label>
              )}
            </section>
          )}
        </div>

        {count > 0 && (
          <div className="shrink-0 px-4 pt-3 border-t border-line bg-bg" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
            <button
              type="button"
              onClick={reviewing ? save : () => setStep("review")}
              disabled={saving}
              className="w-full h-14 rounded-full bg-accent text-accent-ink text-[17px] font-extrabold disabled:opacity-60"
            >
              {reviewing
                ? saving
                  ? "Adding…"
                  : basket.length
                    ? `Log ${Math.round(totals.kcal)} kcal · ${Math.round(totals.proteinCounted)} g protein`
                    : "Log"
                : `Review ${count} · ${Math.round(totals.kcal)} kcal`}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Stepper({ grams, onChange, label }: { grams: number; onChange: (g: number) => void; label: string }) {
  const step = (d: number) => {
    hapticTick();
    onChange(Math.max(5, Math.round((grams + d) / 5) * 5));
  };
  return (
    <div className="flex items-center h-11 rounded-full bg-bg shrink-0">
      <button type="button" onClick={() => step(-10)} aria-label="10 g less" className="w-11 h-11 rounded-full flex items-center justify-center text-fg-2">
        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <label className="flex items-baseline">
        <span className="sr-only">Grams of {label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={5000}
          value={grams || ""}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-14 bg-transparent num text-[17px] text-center focus:outline-none"
        />
        <span className="text-[13px] font-semibold text-muted -ml-1">g</span>
      </label>
      <button type="button" onClick={() => step(10)} aria-label="10 g more" className="w-11 h-11 rounded-full flex items-center justify-center text-fg-2">
        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

function BasketRow({
  item,
  onChange,
  onRemove,
}: {
  item: BasketItem;
  onChange: (patch: Partial<BasketItem>) => void;
  onRemove: () => void;
}) {
  const [swapping, setSwapping] = useState(false);
  const [fav, setFav] = useState(item.food.favourite);
  const m = forGrams(per100(item.food), item.grams);
  const lowConfidence = item.confidence != null && item.confidence < 0.6;
  const said = item.said && item.said.toLowerCase() !== item.food.name.toLowerCase() ? item.said : null;
  const basis = item.basis ? (BASIS[item.basis] ?? null) : null;
  return (
    <li className="rounded-[24px] bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {said && <div className="text-[13px] text-muted truncate">You said &ldquo;{said}&rdquo;</div>}
          <div className="text-[16px] font-semibold leading-snug">
            {item.food.name}
            {item.food.brand ? <span className="text-muted font-normal"> · {item.food.brand}</span> : null}
          </div>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {item.time && <span className="tag h-6 text-[12px] bg-fg text-bg tabular-nums">At {item.time}</span>}
            <span className="tag h-6 text-[12px]">{SOURCE_SHORT[item.food.source] ?? item.food.source}</span>
            {item.food.source === "web" && item.food.sourceUrl && host(item.food.sourceUrl) && (
              <a href={item.food.sourceUrl} target="_blank" rel="noreferrer noopener" className="tag h-6 text-[12px] bg-transparent px-0 text-accent font-semibold underline underline-offset-2">
                {host(item.food.sourceUrl)}
              </a>
            )}
            {!item.food.verified && <span className="tag h-6 text-[12px] bg-danger-bg text-danger-text">Unverified</span>}
            {lowConfidence ? (
              <span className="tag h-6 text-[12px] tag-apricot">Check the amount</span>
            ) : (
              basis && <span className="tag h-6 text-[12px] bg-transparent px-0 text-muted font-semibold">{basis}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div>
            <span className="num text-[22px] text-accent">{Math.round(m.protein)}</span>
            <span className="text-[13px] font-bold text-accent"> g</span>
          </div>
          <div className="text-[13px] text-muted tabular-nums">{Math.round(m.kcal)} kcal</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Stepper grams={item.grams} onChange={(g) => onChange({ grams: g })} label={item.food.name} />
        <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scroller">
          {item.portions.slice(0, 5).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ grams: p.grams })}
              aria-pressed={Math.round(p.grams) === Math.round(item.grams)}
              className={cn(
                "h-9 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0",
                Math.round(p.grams) === Math.round(item.grams) ? "bg-fg text-bg" : "bg-bg text-fg-2"
              )}
            >
              {p.label}
              <span className={cn("ml-1 font-medium", Math.round(p.grams) === Math.round(item.grams) ? "text-bg/60" : "text-faint")}>{Math.round(p.grams)} g</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 -mx-1 -mb-1">
        {item.alternatives && item.alternatives.length > 0 && (
          <button type="button" onClick={() => setSwapping((s) => !s)} aria-expanded={swapping} className="h-9 px-2.5 rounded-full text-[13px] font-bold text-fg-2">
            {swapping ? "Keep this" : "Not this?"}
          </button>
        )}
        <button
          type="button"
          aria-pressed={fav}
          onClick={() => {
            setFav(!fav);
            toggleFavouriteAction(item.food.id, !fav).then((r) => !r.ok && (setFav(fav), toast.error(r.error)));
          }}
          className={cn("h-9 px-2.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1", fav ? "text-accent" : "text-fg-2")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
          </svg>
          Favourite
        </button>
        <button type="button" onClick={onRemove} className="h-9 px-2.5 rounded-full text-[13px] font-bold text-danger ml-auto">
          Remove
        </button>
      </div>

      {swapping && item.alternatives && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5 animate-fade-in">
          {item.alternatives.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ food: a, alternatives: [item.food, ...item.alternatives!.filter((x) => x.id !== a.id)], basis: undefined });
                  setSwapping(false);
                  foodDetailAction(a.id).then((r) => r.ok && onChange({ portions: r.data.portions.filter(usablePortion) }));
                }}
                className="press-soft w-full text-left px-4 py-3 rounded-[16px] bg-bg"
              >
                <span className="block text-[15px] font-semibold">{a.name}</span>
                <span className="block text-[13px] text-muted">
                  {SOURCE_SHORT[a.source]} · {Math.round(a.protein100g ?? 0)} g protein, {Math.round(a.kcal100g)} kcal per 100 g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DescribeTab({ onDraft }: { onDraft: (d: TextDraft, text: string) => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await draftTextAction(text);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onDraft(r.data, text);
      setText("");
    });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="rounded-[24px] bg-surface p-1.5 focus-within:ring-[2.5px] focus-within:ring-inset focus-within:ring-accent transition-shadow">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim().length >= 2) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          aria-label="What you ate"
          placeholder="2 rotis and dal, at 4 coffee with milk"
          className="w-full px-3.5 pt-3 bg-transparent text-fg text-[17px] leading-snug resize-none focus:outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between gap-2 pl-3.5">
          <span className="text-[13px] text-muted">Say amounts and times if you know them</span>
          <button
            type="submit"
            disabled={pending || text.trim().length < 2}
            className="h-11 px-5 rounded-full bg-fg text-bg text-[15px] font-bold inline-flex items-center gap-2 disabled:opacity-30"
          >
            {pending ? (
              "Reading…"
            ) : (
              <>
                <SparkIcon size={15} /> Find foods
              </>
            )}
          </button>
        </div>
      </div>
      <p className="m-0 px-1 text-[13px] leading-snug text-muted">
        Nutrients come from the food database. The AI only reads what you ate and estimates grams, so check the amounts before adding.
      </p>
    </form>
  );
}

interface UnitOpt {
  label: string;
  /** Grams in one of this unit. */
  per: number;
}

/** g, ml when the food has a volume portion, then each portion ("1 roti" → roti). */
function unitOptions(portions: Array<{ label: string; grams: number }>): UnitOpt[] {
  const out: UnitOpt[] = [{ label: "g", per: 1 }];
  const d = densityFromPortions(portions);
  if (d) out.push({ label: "ml", per: d });
  for (const p of portions.filter(usablePortion)) {
    const m = p.label.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    const n = m ? Number(m[1]) : 1;
    const label = (m ? m[2] : p.label).trim();
    if (n > 0 && label && !out.some((o) => o.label === label)) out.push({ label, per: p.grams / n });
  }
  return out;
}

/** Set the amount before adding, as in MyFitnessPal: a number, a unit, and what it comes to. */
function AmountEditor({ food, onAdd }: { food: FoodSummary; onAdd: (grams: number) => void }) {
  const [opts, setOpts] = useState<UnitOpt[]>([{ label: "g", per: 1 }]);
  const [unit, setUnit] = useState("g");
  const [qty, setQty] = useState(food.servingG ?? 100);
  useEffect(() => {
    let live = true;
    foodDetailAction(food.id).then((r) => {
      if (!live || !r.ok) return;
      const o = unitOptions(r.data.portions);
      setOpts(o);
      // Start on the portion that is the food's own serving ("1 roti" for roti); otherwise grams.
      const serving = food.servingG ? o.find((x) => x.label !== "g" && x.label !== "ml" && Math.abs(x.per - food.servingG!) < 0.5) : undefined;
      if (serving) {
        setUnit(serving.label);
        setQty(1);
      }
    });
    return () => {
      live = false;
    };
  }, [food.id, food.servingG]);
  const per = opts.find((o) => o.label === unit)?.per ?? 1;
  const grams = Math.round(qty * per * 10) / 10;
  const m = forGrams(per100(food), grams);
  const changeUnit = (u: string) => {
    const next = opts.find((o) => o.label === u);
    if (!next) return;
    setQty(Math.round((grams / next.per) * 10) / 10);
    setUnit(u);
  };
  return (
    <div className="px-4 pb-4 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={qty || ""}
          onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
          aria-label={`Amount of ${food.name}`}
          className="input-base w-24 h-11 rounded-full text-center num"
        />
        <label>
          <span className="sr-only">Unit</span>
          <select value={unit} onChange={(e) => changeUnit(e.target.value)} className="h-11 px-3 max-w-[10rem] truncate rounded-full bg-bg text-[15px] font-semibold text-fg focus:outline-none focus-visible:ring-[2.5px] focus-visible:ring-accent">
            {opts.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {unit !== "g" && <span className="text-[13px] text-muted tabular-nums">= {Math.round(grams)} g</span>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted tabular-nums">
          <span className="num text-[17px] text-accent">{Math.round(m.protein)} g</span> protein · {Math.round(m.kcal)} kcal
        </span>
        <button type="button" disabled={!grams} onClick={() => onAdd(grams)} className="h-11 px-5 rounded-full bg-fg text-bg text-[15px] font-bold disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}

const host = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

/** Tap a row to set its amount; the + adds it at the usual amount. */
function FoodList({ foods, onPick }: { foods: FoodSummary[]; onPick: (f: FoodSummary, grams?: number) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const mark = (id: string) => setAdded((a) => new Set(a).add(id));
  return (
    <ul className="m-0 p-0 list-none rounded-[24px] bg-surface overflow-hidden">
      {foods.map((f) => {
        const isOpen = open === f.id;
        const src = f.source === "web" ? (host(f.sourceUrl) ?? "Web") : SOURCE_SHORT[f.source];
        return (
          <li key={f.id} className="border-t border-line first:border-t-0">
            <div className="flex items-center">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.id)} className="press-soft flex-1 min-w-0 text-left pl-4 py-3">
                <span className="block text-[16px] font-semibold leading-snug truncate">
                  {f.favourite && <span className="text-accent" aria-label="Favourite">★ </span>}
                  {f.name}
                  {f.brand ? <span className="text-muted font-normal"> · {f.brand}</span> : null}
                </span>
                <span className="block text-[13px] text-muted tabular-nums mt-0.5 truncate">
                  {f.protein100g != null ? `${Math.round(f.protein100g)} g protein` : "Protein unknown"} · {Math.round(f.kcal100g)} kcal per 100 g · {f.source === "web" ? "✦ " : ""}
                  {src}
                </span>
              </button>
              <button
                type="button"
                aria-label={added.has(f.id) ? `${f.name} added` : `Add ${f.name}`}
                onClick={() => {
                  hapticTick();
                  onPick(f);
                  mark(f.id);
                }}
                className={cn("w-10 h-10 mx-2 rounded-full flex items-center justify-center shrink-0", added.has(f.id) ? "bg-fg text-bg" : "bg-bg text-fg")}
              >
                {added.has(f.id) ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
            </div>
            {isOpen && (
              <AmountEditor
                food={f}
                onAdd={(g) => {
                  hapticTick();
                  onPick(f, g);
                  mark(f.id);
                  setOpen(null);
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SearchTab({ onPick, onPickMeal }: { onPick: (f: FoodSummary, grams?: number) => void; onPickMeal: (m: SavedMeal) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSummary[]>([]);
  const [quick, setQuick] = useState<{ recent: FoodSummary[]; frequent: FoodSummary[]; favourites: FoodSummary[]; meals: SavedMeal[] } | null>(null);
  const [view, setView] = useState<"recent" | "frequent" | "favourites" | "meals">("recent");
  const [loading, setLoading] = useState(false);
  const [web, setWeb] = useState<{ q: string; state: "loading" | "none" } | null>(null);
  const latest = useRef(0);
  /** Bumped when the query changes or the tab closes: a slow web lookup for an old query must not add its food. */
  const webSeq = useRef(0);

  useEffect(() => {
    quickFoodsAction().then((r) => r.ok && setQuick(r.data));
    return () => {
      webSeq.current = -1; // unmounted: any lookup still running is ignored
    };
  }, []);

  useEffect(() => {
    webSeq.current++;
    setWeb(null);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchFoodsAction(term);
      if (id !== latest.current) return;
      setLoading(false);
      if (r.ok) setResults(r.data);
      else toast.error(r.error);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim();
  const searchWeb = async () => {
    const seq = ++webSeq.current;
    setWeb({ q: term, state: "loading" });
    const r = await webFoodAction(term);
    if (seq !== webSeq.current) return;
    if (!r.ok) {
      setWeb(null);
      toast.error(r.error);
      return;
    }
    if (r.data.food) {
      onPick(r.data.food);
      setWeb(null);
      const h = r.data.food.source === "off" ? "Open Food Facts" : host(r.data.food.sourceUrl);
      toast.success(r.data.cached ? `Added ${r.data.food.name}` : `Found on ${h ?? "the web"}, saved for next time`);
    } else setWeb({ q: term, state: "none" });
  };

  const webRow =
    term.length >= 3 &&
    !loading &&
    (web?.q === term && web.state === "loading" ? (
      <div className="flex items-center gap-3 px-1 py-3 text-[15px] text-muted" role="status">
        <span className="size-4 rounded-full border-2 border-line border-t-accent animate-spin" aria-hidden="true" />
        Reading a nutrition label for &ldquo;{term}&rdquo;…
      </div>
    ) : web?.q === term && web.state === "none" ? (
      <p className="m-0 px-1 py-3 text-[15px] text-muted">No reliable label found. Try the brand and product name, or add it under My foods.</p>
    ) : results.length ? (
      // Results exist: a slim line, always in view under the search field, not buried below 25 rows.
      <button type="button" onClick={searchWeb} className="press-soft self-start max-w-full inline-flex items-center gap-2 px-1 h-9 text-[15px] font-bold text-accent">
        <SparkIcon size={14} />
        <span className="truncate">Not finding it? Search the web for &ldquo;{term}&rdquo;</span>
      </button>
    ) : (
      <button type="button" onClick={searchWeb} className="press-soft w-full text-left flex items-center gap-3 px-4 py-3 rounded-[20px] bg-accent/10">
        <span className="text-accent shrink-0">
          <SparkIcon />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-semibold truncate">No match. Search the web for &ldquo;{term}&rdquo;</span>
          <span className="block text-[13px] text-muted">Looks it up on Open Food Facts, then the web, and saves it for next time</span>
        </span>
      </button>
    ));

  return (
    <div className="flex flex-col gap-4">
      <label className="search-field">
        <span className="text-muted">
          <SearchIcon size={18} />
        </span>
        <span className="sr-only">Search foods</span>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Foods, recipes, brands"
          className="flex-1 min-w-0 bg-transparent text-[17px] focus:outline-none placeholder:text-faint"
        />
      </label>
      {term.length >= 2 ? (
        <>
          {webRow}
          {loading && !results.length ? <p className="text-muted text-[15px] m-0 px-1">Searching…</p> : results.length ? <FoodList foods={results} onPick={onPick} /> : null}
        </>
      ) : (
        <>
          <div className="flex gap-2" role="group" aria-label="Show">
            {(
              [
                ["recent", "Recent"],
                ["frequent", "Frequent"],
                ["favourites", "Favourites"],
                ["meals", "Meals"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={cn("h-10 px-4 rounded-full text-[15px] font-semibold", view === k ? "bg-fg text-bg" : "bg-surface text-fg-2")}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "recent" && (quick?.recent.length ? <FoodList foods={quick.recent} onPick={onPick} /> : <p className="text-muted text-[15px] m-0 px-1">Foods you log show up here.</p>)}
          {view === "frequent" && (quick?.frequent.length ? <FoodList foods={quick.frequent} onPick={onPick} /> : <p className="text-muted text-[15px] m-0 px-1">Foods you log twice or more show up here, most often first.</p>)}
          {view === "favourites" && (quick?.favourites.length ? <FoodList foods={quick.favourites} onPick={onPick} /> : <p className="text-muted text-[15px] m-0 px-1">Star a food when you check its amount to keep it here.</p>)}
          {view === "meals" &&
            (quick?.meals.length ? (
              <ul className="m-0 p-0 list-none rounded-[24px] bg-surface overflow-hidden">
                {quick.meals.map((m) => (
                  <li key={m.id} className="border-t border-line first:border-t-0">
                    <button type="button" onClick={() => onPickMeal(m)} className="press-soft w-full text-left pl-4 pr-2 py-3 flex gap-3 items-center">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[16px] font-semibold">{m.name}</span>
                        <span className="block text-[13px] text-muted truncate tabular-nums mt-0.5">
                          {m.protein} g protein · {m.kcal} kcal · {m.items.map((i) => i.food.name).join(", ")}
                        </span>
                      </span>
                      <span className="w-10 h-10 rounded-full bg-bg text-fg flex items-center justify-center shrink-0" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-[15px] m-0 px-1">Save a few foods as a meal when you review them.</p>
            ))}
        </>
      )}
    </div>
  );
}

function BarcodeTab({ onFound }: { onFound: (f: FoodSummary) => void }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await barcodeAction(code);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          onFound(r.data);
          setCode("");
        });
      }}
    >
      <label className="search-field h-14">
        <span className="text-muted">
          <BarcodeIcon size={20} />
        </span>
        <span className="sr-only">Barcode number</span>
        <input
          autoFocus
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="EAN or UPC number"
          className="flex-1 min-w-0 bg-transparent num text-[19px] tracking-[1px] focus:outline-none placeholder:text-faint placeholder:font-sans placeholder:font-normal placeholder:text-[17px] placeholder:tracking-normal"
        />
        <button type="submit" disabled={pending || code.length < 8} className="h-10 -mr-1.5 px-4 rounded-full bg-fg text-bg text-[15px] font-bold disabled:opacity-30">
          {pending ? "…" : "Look up"}
        </button>
      </label>
      <p className="m-0 px-1 text-[13px] leading-snug text-muted">
        Looked up on Open Food Facts, which covers Indian and UAE packaged foods. On iPhone, the camera scans it for you.
      </p>
    </form>
  );
}
