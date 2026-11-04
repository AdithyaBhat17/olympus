import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firecrawlFood, labelText, otherForm, queryOverlap, rankSources, type Extract, type SearchHit } from "./firecrawl";
import type { WebFoodAnswer } from "./web-food";

// Hits copied from real Firecrawl searches, snippets included.
const starbucks: SearchHit[] = [
  { url: "https://www.eatthismuch.com/calories/caffe-latte-with-nonfat-milk-tall-1597561", title: "Starbucks Caffe Latte With Nonfat Milk, Tall Nutrition Facts - Eat This Much", description: "Tall with Nonfat Milk, Carbs 60% Protein 40% Percent Calories … contains 100 Calories." },
  { url: "https://www.getmistapp.com/starbucks-calorie-calculator/grande-caffe-latte", title: "Starbucks Grande Caffè Latte – Cals & nutrition", description: "A Starbucks Grande Caffè Latte has 190 calories, 13g protein, 18g sugar" },
  { url: "https://www.starbucks.com/menu/product/407/hot/nutrition", title: "Caffè Latte: Nutrition: Starbucks Coffee Company", description: "# Caffè Latte\n190calories\n## Nutrition\n- Calories190\n- Total Fat 7 g\n- Protein 13 g" },
  { url: "https://www.reddit.com/r/starbucks/comments/x", title: "latte calories?" },
];
const epigamia: SearchHit[] = [
  { url: "https://www.eatthismuch.com/calories/greek-yogurt-natural-1806163", title: "Epigamia Greek Yogurt, Natural Nutrition Facts - Eat This Much", description: "100 grams of Epigamia greek yogurt, natural contains 71 Calories." },
  { url: "https://epigamiastore.com/products/epigamia-natural-greek-yogurt-400gm-v-epigamia", title: "greek yogurt, natural - Epigamia", description: "packed with protein, our plain greek yogurt is as versatile as it gets. this can be used just like dahi" },
  { url: "https://www.fatsecret.co.in/calories-nutrition/epigamia/greek-yogurt-natural/100g", title: "Calories in Epigamia Greek Yogurt Natural - fatsecret", description: "There are 65 calories in 1 serving (100 g) of Epigamia Greek Yogurt Natural." },
  { url: "https://world.openfoodfacts.org/product/8906059635007/greek-yogurt-natural-epigamia", title: "GREEK YOGURT natural – epigamia – 85g - Open Food Facts", description: "Nutrition facts ; Proteins, 7.647 g, 6.074 g (+26%)" },
];

describe("rankSources", () => {
  it("puts the product's own site first, drops social pages", () => {
    const r = rankSources("starbucks tall caffe latte", starbucks).map((h) => new URL(h.url).hostname);
    expect(r[0]).toBe("www.starbucks.com");
    expect(r).not.toContain("www.reddit.com");
  });

  it("then Open Food Facts and FatSecret; the brand's shop page, with no numbers in its snippet, sinks below pages that show them", () => {
    const r = rankSources("epigamia greek yogurt natural", epigamia).map((h) => new URL(h.url).hostname);
    expect(r).toEqual(["world.openfoodfacts.org", "www.fatsecret.co.in", "www.eatthismuch.com", "epigamiastore.com"]);
  });

  it("only takes https pages", () => {
    expect(rankSources("x whey", [{ url: "http://insecure.example/whey" }])).toEqual([]);
  });
});

describe("rankSources: only the snippet is evidence of a label", () => {
  it("'Nutrition Facts' in a title does not count", () => {
    const hits: SearchHit[] = [
      { url: "https://some-aggregator.example/starbucks-latte", title: "Starbucks Latte Nutrition Facts", description: "Everything about lattes" },
      { url: "https://www.starbucks.com/menu/product/407/hot", title: "Caffè Latte", description: "190calories" },
    ];
    expect(new URL(rankSources("starbucks latte", hits)[0].url).hostname).toBe("www.starbucks.com");
  });
});

describe("rankSources: a label beats a menu page", () => {
  it("macros in the snippet outrank calories alone", () => {
    const hits: SearchHit[] = [
      { url: "https://www.starbucks.com/menu/product/407/hot", title: "Caffè Latte", description: "# Caffè Latte 190calories ## What's Included Milk" },
      { url: "https://www.starbucks.com/menu/product/407/hot/nutrition", title: "Caffè Latte: Nutrition", description: "190calories ## Nutrition - Calories190 - Total Fat 7 g - Protein 13 g" },
    ];
    expect(rankSources("starbucks caffe latte", hits)[0].url).toMatch(/\/nutrition$/);
  });
});

describe("otherForm", () => {
  it("ambiguous words count against the extracted name only, not the page address", () => {
    expect(otherForm("protein bar", "Protein Bar", "https://brand.example/products/zero-sugar-protein-bar")).toBe(false);
    expect(otherForm("honey", "Honey", "https://x.example/raw-honey")).toBe(false);
    expect(otherForm("protein bar", "Zero Sugar Protein Bar", "https://brand.example/protein-bar")).toBe(true);
    // ...but a combo is a combo even when the page's own name leaves it out (seen live: "Zinger Burger" at /KFC-Zinger-Burger-with-Fries)
    expect(otherForm("kfc zinger burger", "Zinger Burger", "https://www.arise-app.com/dish/KFC-Zinger-Burger-with-Fries")).toBe(true);
  });

  it("rejects a combo meal for the item alone, but allows it when asked for", () => {
    expect(otherForm("kfc zinger burger", "Zinger Burger with Fries", "https://www.arise-app.com/dish/KFC-Zinger-Burger-with-Fries")).toBe(true);
    expect(otherForm("kfc zinger burger meal", "Zinger Burger Meal", "https://kfc.example/zinger-burger-meal")).toBe(false);
    expect(otherForm("french fries", "French Fries", "https://x.example/french-fries")).toBe(false);
  });

  it("rejects the iced latte for a hot one", () => {
    expect(otherForm("starbucks tall caffe latte", "Iced Caffè Latte", "https://www.starbucks.com/menu/product/407/iced/nutrition")).toBe(true);
    expect(otherForm("starbucks iced caffe latte", "Iced Caffè Latte", "https://www.starbucks.com/menu/product/407/iced/nutrition")).toBe(false);
  });
  it("rejects dry tea leaves for a cup of chai, allows a powder when asked for", () => {
    expect(otherForm("chaayos masala chai", "Masala Chai", "https://chaayos.com/products/masala-chai-patti-flavoured-black-tea")).toBe(true);
    expect(otherForm("whey protein powder", "Whey Protein Powder", "https://x.example/whey-protein-powder")).toBe(false);
    expect(otherForm("starbucks caffe latte", "Caffè Latte", "https://www.starbucks.com/menu/product/407/hot")).toBe(false);
  });
});

describe("queryOverlap", () => {
  it("accepts a page that is the product, rejects another one", () => {
    expect(queryOverlap("starbucks tall caffe latte", "Caffè Latte", "Starbucks")).toBe(true);
    expect(queryOverlap("starbucks tall caffe latte", "Mocha Frappuccino", "Starbucks")).toBe(false);
    expect(queryOverlap("", "anything")).toBe(false);
  });
});

describe("labelText: finds the label, not marketing copy", () => {
  it("anchors on calories followed by a number, even when 'energy' and 'calories' appear earlier", () => {
    const md = "Burn calories and get high energy!\n" + "navigation ".repeat(600) + "\n## Nutrition Facts\nCalories 190\nProtein 13 g";
    expect(labelText(md)).toContain("Calories 190");
  });
});

describe("labelText", () => {
  it("keeps the part of the page around the first mention of calories, without images", () => {
    const md = "x".repeat(5000) + "\n![logo](https://x/y.png)\n## Nutrition Facts\nCalories 190\nProtein 13 g" + "y".repeat(6000);
    const t = labelText(md);
    expect(t).toContain("Calories 190");
    expect(t).not.toContain("logo");
    expect(t.length).toBeLessThan(4500);
  });
  it("falls back to the start of the page when nothing mentions calories", () => {
    expect(labelText("hello world ".repeat(1000)).length).toBeLessThanOrEqual(3000);
  });
});

describe("firecrawlFood", () => {
  const OLD = process.env.FIRECRAWL_API_KEY;
  beforeEach(() => { process.env.FIRECRAWL_API_KEY = "test-key"; });
  afterEach(() => { process.env.FIRECRAWL_API_KEY = OLD; });

  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const page = (markdown: string) => reply({ success: true, data: { markdown, metadata: { creditsUsed: 1 } } });
  const LABEL = "## Nutrition Facts\nCalories 190\nTotal Fat 7 g\nProtein 13 g\nCarbohydrates 19 g";
  const answer = (over: Partial<WebFoodAnswer> = {}): WebFoodAnswer => ({
    found: true, name: "Caffè Latte", brand: "Starbucks", amount: 473, unit: "ml", gramsPerMl: 1.03, kcal: 190, protein: 13, carbs: 19, fat: 7, fibre: 0,
    servingLabel: "Grande 16 fl oz", servingG: 487, sourceUrl: "", ...over,
  });
  /** A fake Firecrawl: one search response, then one page read per call. */
  const fake = (pages: Response[], search: unknown = { success: true, creditsUsed: 2, data: { web: starbucks } }) => {
    const calls: string[] = [];
    let i = 0;
    const f = (async (url: string) => {
      calls.push(url.replace("https://api.firecrawl.dev/v2", ""));
      return url.endsWith("/search") ? reply(search) : (pages[i++] ?? reply({}, 500));
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  const extracting = (...answers: Array<WebFoodAnswer | Error>): { fn: Extract; seen: string[] } => {
    const seen: string[] = [];
    let i = 0;
    const fn: Extract = async ({ url }) => {
      seen.push(url);
      const a = answers[i++];
      if (a instanceof Error || !a) throw new Error("model down");
      return { answer: a, costUsd: 0.0005 };
    };
    return { fn, seen };
  };

  it("searches, reads the best page, converts to per 100 g, and counts credits and model cost", async () => {
    const { f, calls } = fake([page(LABEL)]);
    const { fn, seen } = extracting(answer());
    const r = await firecrawlFood("starbucks tall caffe latte", fn, f);
    expect(calls).toEqual(["/search", "/scrape"]);
    expect(seen[0]).toBe("https://www.starbucks.com/menu/product/407/hot/nutrition");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.credits).toBe(3);
      expect(r.usd).toBeCloseTo(0.0005);
      expect(r.food).toMatchObject({ name: "Caffè Latte", brand: "Starbucks", sourceUrl: r.url, servingLabel: "Grande 16 fl oz" });
      expect(r.food.kcal100g).toBeCloseTo(39, 0); // 190 kcal / (473 ml x 1.03)
    }
  });

  it("moves on when a page has no label or is a different product, up to three pages", async () => {
    const { f, calls } = fake([page(LABEL), page(LABEL), page(LABEL)]);
    const { fn } = extracting(answer({ found: false }), answer({ name: "Mocha Frappuccino" }), answer());
    const r = await firecrawlFood("starbucks tall caffe latte", fn, f);
    expect(calls).toEqual(["/search", "/scrape", "/scrape", "/scrape"]);
    expect(r.ok && r.credits).toBe(5);
  });

  it("gives up after three pages, with the last reason", async () => {
    const { f, calls } = fake([page(LABEL), page(LABEL), page(LABEL), page(LABEL)]);
    const { fn } = extracting(answer({ found: false }), answer({ found: false }), answer({ found: false }), answer());
    const r = await firecrawlFood("starbucks tall caffe latte", fn, f);
    expect(calls.filter((c) => c === "/scrape")).toHaveLength(3);
    expect(r).toMatchObject({ ok: false, reason: "no label on the page", credits: 5 });
  });

  it("refuses a label whose macros don't match its calories, the iced latte for a hot one, and tea leaves for chai", async () => {
    const bad = answer({ kcal: 60 });
    const iced = answer({ name: "Iced Caffè Latte" });
    const { f } = fake([page(LABEL), page(LABEL)]);
    expect((await firecrawlFood("starbucks tall caffe latte", extracting(bad, iced).fn, f)).ok).toBe(false);
    const chai = fake([page(LABEL)], { success: true, data: { web: [{ url: "https://chaayos.com/products/masala-chai-patti-flavoured-black-tea", title: "Masala Chai", description: "Calories 361 Protein 17 g" }] } });
    expect((await firecrawlFood("chaayos masala chai", extracting(answer({ name: "Masala Chai", brand: "Chaayos" })).fn, chai.f)).ok).toBe(false);
  });

  it("skips a page with no text without calling the model, and survives a model error", async () => {
    const { f } = fake([page(""), page(LABEL), page(LABEL)]);
    const { fn, seen } = extracting(new Error("x"), answer());
    const r = await firecrawlFood("starbucks tall caffe latte", fn, f);
    expect(seen).toHaveLength(2); // the empty page never reached the model
    expect(r.ok).toBe(true);
  });

  it("waits out a rate limit (429) and retries once", async () => {
    let first = true;
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url.replace("https://api.firecrawl.dev/v2", ""));
      if (url.endsWith("/search")) {
        if (first) { first = false; return reply({ success: false, error: "Rate limit exceeded", retry_after_seconds: 0 }, 429); }
        return reply({ success: true, creditsUsed: 2, data: { web: starbucks } });
      }
      return page(LABEL);
    }) as unknown as typeof fetch;
    const r = await firecrawlFood("starbucks tall caffe latte", extracting(answer()).fn, f);
    expect(calls).toEqual(["/search", "/search", "/scrape"]);
    expect(r.ok).toBe(true);
  });

  it("stops at its overall time limit even when every step is slow", async () => {
    // The model call never returns; the lookup must still end inside its (here 2 s) budget, not after 40 s.
    const { f } = fake([page(LABEL), page(LABEL), page(LABEL)]);
    const hang: Extract = () => new Promise(() => {});
    const started = Date.now();
    const r = await firecrawlFood("starbucks tall caffe latte", hang, f, 2_000);
    expect(Date.now() - started).toBeLessThan(3_500);
    expect(r).toMatchObject({ ok: false });
  });

  it("is a failure, not an error, when Firecrawl is down", async () => {
    const down = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect(await firecrawlFood("x whey", extracting().fn, down)).toEqual({ ok: false, reason: "search failed", credits: 0, usd: 0 });
    const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect((await firecrawlFood("x whey", extracting().fn, offline)).ok).toBe(false);
  });
});
