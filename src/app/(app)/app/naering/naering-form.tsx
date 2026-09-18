"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CustomFood, RecentFood } from "./page";
import { BarcodeScanner } from "./barcode-scanner";

const MEALS: { value: string; label: string }[] = [
  { value: "breakfast", label: "Morgunmatur" },
  { value: "lunch", label: "Hádegi" },
  { value: "dinner", label: "Kvöldmatur" },
  { value: "snack", label: "Snarl" },
];

type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
type SearchResult = {
  code: string | null;
  name: string;
  brand: string | null;
  per100g: Per100;
  serving_g: number | null;
};

const round = (n: number) => Math.round(n * 10) / 10;
function scale(per100: Per100, grams: number) {
  const f = grams / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    protein_g: round(per100.protein * f),
    carbs_g: round(per100.carbs * f),
    fat_g: round(per100.fat * f),
  };
}

export function NaeringForm({
  userId,
  loggedOn,
  customFoods,
  recentFoods = [],
}: {
  userId: string;
  loggedOn: string;
  customFoods: CustomFood[];
  recentFoods?: RecentFood[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<
    "search" | "custom" | "manual" | "photo" | "product"
  >("search");
  const [meal, setMeal] = useState("breakfast");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Search state
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [saveToMine, setSaveToMine] = useState(false);

  // Custom state
  const [customId, setCustomId] = useState("");
  const [amount, setAmount] = useState("");

  // Manual state
  const [mName, setMName] = useState("");
  const [mKcal, setMKcal] = useState("");
  const [mProtein, setMProtein] = useState("");
  const [mCarbs, setMCarbs] = useState("");
  const [mFat, setMFat] = useState("");

  const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const kcalFromMacros = (protein: string, carbs: string, fat: string) =>
    String(Math.round(num(protein) * 4 + num(carbs) * 4 + num(fat) * 9));

  // Photo (meal) state — the list of foods Claude found, editable before logging.
  type PhotoItem = {
    name: string;
    grams: string;
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
    note: string;
  };
  const emptyPhotoItem = (): PhotoItem => ({
    name: "",
    grams: "",
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
    note: "",
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pItems, setPItems] = useState<PhotoItem[]>([]);
  const [pReady, setPReady] = useState(false);

  // Edit one meal item; recompute kcal (Atwater 4/4/9) when a macro changes.
  function setPItem(i: number, patch: Partial<PhotoItem>) {
    setPItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, ...patch };
        if (
          patch.protein !== undefined ||
          patch.carbs !== undefined ||
          patch.fat !== undefined
        ) {
          next.kcal = kcalFromMacros(next.protein, next.carbs, next.fat);
        }
        return next;
      }),
    );
  }
  const addPhotoItem = () => setPItems((p) => [...p, emptyPhotoItem()]);
  const removePhotoItem = (i: number) =>
    setPItems((p) => p.filter((_, idx) => idx !== i));

  // Product (label) state — per-100g, saved into "mín matvæli".
  const [prodBusy, setProdBusy] = useState(false);
  const [prodReady, setProdReady] = useState(false);
  const [prodSaved, setProdSaved] = useState(false);
  const [prodName, setProdName] = useState("");
  const [prodBrand, setProdBrand] = useState("");
  const [prodKcal, setProdKcal] = useState("");
  const [prodProtein, setProdProtein] = useState("");
  const [prodCarbs, setProdCarbs] = useState("");
  const [prodFat, setProdFat] = useState("");

  // Downscale an image file to keep the upload small, return base64 (no prefix).
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read error"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("image error"));
        img.onload = () => {
          const max = 1024;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas error"));
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve(dataUrl.split(",")[1] ?? "");
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    setError(null);
    setPReady(false);
    setPhotoBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: "image/jpeg", mode: "meal" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gat ekki metið myndina.");
        setPhotoBusy(false);
        return;
      }
      const items = (json.items ?? []) as {
        name?: string;
        quantity_g?: number | null;
        kcal?: number;
        protein_g?: number;
        carbs_g?: number;
        fat_g?: number;
        note?: string | null;
      }[];
      setPItems(
        items.map((e) => ({
          name: String(e.name ?? "Matur"),
          grams: e.quantity_g != null ? String(e.quantity_g) : "",
          kcal: String(e.kcal ?? 0),
          protein: String(e.protein_g ?? 0),
          carbs: String(e.carbs_g ?? 0),
          fat: String(e.fat_g ?? 0),
          note: e.note ? String(e.note) : "",
        })),
      );
      setPReady(true);
    } catch {
      setError("Gat ekki lesið myndina.");
    }
    setPhotoBusy(false);
  }

  // Log every (named) item from the photo as its own entry for the day/meal.
  async function addAllPhotoItems() {
    const items = pItems.filter((it) => it.name.trim());
    if (!items.length) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const rows = items.map((it) => ({
      user_id: userId,
      logged_on: loggedOn,
      meal,
      name: it.name.trim(),
      brand: null,
      source: "photo",
      off_code: null,
      quantity_g: it.grams.trim() ? Math.round(num(it.grams)) : null,
      kcal: Math.round(num(it.kcal)),
      protein_g: round(num(it.protein)),
      carbs_g: round(num(it.carbs)),
      fat_g: round(num(it.fat)),
    }));
    const { error: e } = await supabase.from("nutrition_entries").insert(rows);
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setPItems([]);
    setPReady(false);
    router.refresh();
  }

  async function onProductPhoto(file: File | null) {
    if (!file) return;
    setError(null);
    setProdReady(false);
    setProdSaved(false);
    setProdBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: "image/jpeg", mode: "product" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gat ekki lesið vöruna.");
        setProdBusy(false);
        return;
      }
      const p = json.product ?? {};
      setProdName(String(p.name ?? "Vara"));
      setProdBrand(p.brand ? String(p.brand) : "");
      setProdKcal(String(p.per100g?.kcal ?? 0));
      setProdProtein(String(p.per100g?.protein_g ?? 0));
      setProdCarbs(String(p.per100g?.carbs_g ?? 0));
      setProdFat(String(p.per100g?.fat_g ?? 0));
      setProdReady(true);
    } catch {
      setError("Gat ekki lesið myndina.");
    }
    setProdBusy(false);
  }

  // Save the scanned product into "mín matvæli" (custom_foods, per 100 g).
  async function saveProduct() {
    if (!prodName.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("custom_foods").insert({
      user_id: userId,
      name: prodName.trim(),
      brand: prodBrand.trim() || null,
      basis: "per_100g",
      kcal: Math.round(num(prodKcal)),
      protein_g: round(num(prodProtein)),
      carbs_g: round(num(prodCarbs)),
      fat_g: round(num(prodFat)),
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setProdReady(false);
    setProdSaved(true);
    setProdName("");
    setProdBrand("");
    setProdKcal("");
    setProdProtein("");
    setProdCarbs("");
    setProdFat("");
    router.refresh();
  }

  async function runSearch() {
    if (q.trim().length < 2) return;
    setSearching(true);
    setPicked(null);
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } catch {
      setError("Leit mistókst — reyndu aftur.");
    }
    setSearching(false);
  }

  async function insert(row: {
    name: string;
    brand: string | null;
    source: string;
    off_code: string | null;
    quantity_g: number | null;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("nutrition_entries").insert({
      user_id: userId,
      logged_on: loggedOn,
      meal,
      ...row,
    });
    if (e) {
      setError(e.message);
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  }

  async function addFromSearch() {
    if (!picked) return;
    const g = num(grams);
    if (g <= 0) return;
    const macros = scale(picked.per100g, g);
    const ok = await insert({
      name: picked.name,
      brand: picked.brand,
      source: "off",
      off_code: picked.code,
      quantity_g: g,
      ...macros,
    });
    if (!ok) return;
    if (saveToMine) {
      const supabase = createClient();
      await supabase.from("custom_foods").insert({
        user_id: userId,
        name: picked.name,
        brand: picked.brand,
        basis: "per_100g",
        kcal: picked.per100g.kcal,
        protein_g: picked.per100g.protein,
        carbs_g: picked.per100g.carbs,
        fat_g: picked.per100g.fat,
      });
    }
    setPicked(null);
    setQ("");
    setResults([]);
    setSaveToMine(false);
    router.refresh();
  }

  async function addFromCustom() {
    const food = customFoods.find((f) => f.id === customId);
    if (!food) return;
    const amt = num(amount) || (food.basis === "per_serving" ? 1 : 100);
    let macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    let quantity: number | null;
    if (food.basis === "per_serving") {
      macros = {
        kcal: Math.round((food.kcal ?? 0) * amt),
        protein_g: round((food.protein_g ?? 0) * amt),
        carbs_g: round((food.carbs_g ?? 0) * amt),
        fat_g: round((food.fat_g ?? 0) * amt),
      };
      quantity = food.serving_g != null ? food.serving_g * amt : null;
    } else {
      macros = scale(
        {
          kcal: food.kcal ?? 0,
          protein: food.protein_g ?? 0,
          carbs: food.carbs_g ?? 0,
          fat: food.fat_g ?? 0,
        },
        amt,
      );
      quantity = amt;
    }
    const ok = await insert({
      name: food.name,
      brand: food.brand,
      source: "custom",
      off_code: null,
      quantity_g: quantity,
      ...macros,
    });
    if (!ok) return;
    setCustomId("");
    setAmount("");
    router.refresh();
  }

  async function addManual() {
    if (!mName.trim()) {
      setError("Sláðu inn heiti.");
      return;
    }
    const ok = await insert({
      name: mName.trim(),
      brand: null,
      source: "manual",
      off_code: null,
      quantity_g: null,
      kcal: Math.round(num(mKcal)),
      protein_g: round(num(mProtein)),
      carbs_g: round(num(mCarbs)),
      fat_g: round(num(mFat)),
    });
    if (!ok) return;
    setMName("");
    setMKcal("");
    setMProtein("");
    setMCarbs("");
    setMFat("");
    router.refresh();
  }

  async function quickAdd(food: RecentFood) {
    const ok = await insert({
      name: food.name,
      brand: food.brand,
      source: food.source,
      off_code: null,
      quantity_g: food.quantity_g,
      kcal: Math.round(Number(food.kcal) || 0),
      protein_g: round(Number(food.protein_g) || 0),
      carbs_g: round(Number(food.carbs_g) || 0),
      fat_g: round(Number(food.fat_g) || 0),
    });
    if (ok) router.refresh();
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  const preview = picked ? scale(picked.per100g, num(grams) || 0) : null;

  return (
    <div className="rounded-lg border border-border bg-muted p-5">
      <h2 className="font-semibold">Bæta við mat</h2>

      {/* Meal */}
      <div className="mt-3 flex flex-wrap gap-2">
        {MEALS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMeal(m.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              meal === m.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Recent foods — one-tap re-log into the selected meal */}
      {recentFoods.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted-foreground">Nýlegt</div>
          <div className="flex flex-wrap gap-1.5">
            {recentFoods.map((f, i) => (
              <button
                key={`${f.name}-${i}`}
                type="button"
                onClick={() => quickAdd(f)}
                disabled={saving}
                title={`${Math.round(Number(f.kcal) || 0)} kcal`}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                + {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mode */}
      <div className="mt-4 flex gap-2 border-b border-border">
        {([
          ["search", "Leita"],
          ["photo", "📷 Máltíð"],
          ["product", "📷 Vara"],
          ["custom", "Mín matvæli"],
          ["manual", "Handvirkt"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              mode === v
                ? "border-accent font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {mode === "search" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="t.d. Hleðsla, Skyr, banani"
                className={field}
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching}
                className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
              >
                {searching ? "Leita…" : "Leita"}
              </button>
              <button
                type="button"
                onClick={() => setScanning(true)}
                title="Skanna strikamerki"
                className="shrink-0 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                📷
              </button>
            </div>

            {!picked && results.length > 0 && (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {results.map((r, i) => (
                  <li key={`${r.code ?? "x"}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(r);
                        setGrams(r.serving_g ? String(r.serving_g) : "100");
                      }}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-accent"
                    >
                      <span className="font-medium">{r.name}</span>
                      {r.brand && (
                        <span className="text-muted-foreground"> · {r.brand}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {Math.round(r.per100g.kcal)} kcal / 100g · P{" "}
                        {round(r.per100g.protein)} · K {round(r.per100g.carbs)} · F{" "}
                        {round(r.per100g.fat)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {picked && (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-sm font-medium">
                  {picked.name}
                  {picked.brand && (
                    <span className="text-muted-foreground"> · {picked.brand}</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    className="w-24 rounded-md border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="text-sm text-muted-foreground">grömm</span>
                </div>
                {preview && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {preview.kcal} kcal · P {preview.protein_g} · K{" "}
                    {preview.carbs_g} · F {preview.fat_g}
                  </div>
                )}
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveToMine}
                    onChange={(e) => setSaveToMine(e.target.checked)}
                  />
                  Vista í „mín matvæli"
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={addFromSearch}
                    disabled={saving}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving ? "Bæti við…" : "Bæta við"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Til baka
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "custom" && (
          <div className="space-y-3">
            {customFoods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Engin vistuð matvæli enn. Vistaðu úr leitinni (hakaðu í „Vista í
                mín matvæli") eða sláðu inn handvirkt.
              </p>
            ) : (
              <>
                <select
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className={field}
                >
                  <option value="">Veldu matvæli…</option>
                  {customFoods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.brand ? ` · ${f.brand}` : ""}
                    </option>
                  ))}
                </select>
                {customId && (
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={
                        customFoods.find((f) => f.id === customId)?.basis ===
                        "per_serving"
                          ? "skammtar"
                          : "grömm"
                      }
                      className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-sm text-muted-foreground">
                      {customFoods.find((f) => f.id === customId)?.basis ===
                      "per_serving"
                        ? "skammtar"
                        : "grömm"}
                    </span>
                    <button
                      type="button"
                      onClick={addFromCustom}
                      disabled={saving}
                      className="ml-auto rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
                    >
                      {saving ? "Bæti við…" : "Bæta við"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-3">
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="Heiti (t.d. Hafragrautur)"
              className={field}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Kaloríur</span>
                <input inputMode="decimal" value={mKcal} onChange={(e) => setMKcal(e.target.value)} placeholder="kcal" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Prótein (g)</span>
                <input inputMode="decimal" value={mProtein} onChange={(e) => setMProtein(e.target.value)} placeholder="g" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Kolvetni (g)</span>
                <input inputMode="decimal" value={mCarbs} onChange={(e) => setMCarbs(e.target.value)} placeholder="g" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Fita (g)</span>
                <input inputMode="decimal" value={mFat} onChange={(e) => setMFat(e.target.value)} placeholder="g" className={field} />
              </label>
            </div>
            <button
              type="button"
              onClick={addManual}
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Bæti við…" : "Bæta við"}
            </button>
          </div>
        )}

        {mode === "photo" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground">
              {/* No `capture` attribute: on a phone this lets iOS/Android offer
                  BOTH "Take Photo" and "Photo Library", so a member can upload a
                  meal photo they snapped earlier offline — not only shoot live. */}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
              />
              {photoBusy ? "Greini mynd…" : "📷 Taktu mynd eða veldu mynd af matnum"}
            </label>
            <p className="text-xs text-muted-foreground">
              Claude sundurliðar máltíðina í einstaka rétti og áætlar macros.
              Þetta er ágiskun — yfirfarðu, lagaðu, eyddu röngu og bættu við því
              sem vantar (t.d. kjúklingaskinku) áður en þú skráir. Þú getur tekið
              mynd núna eða valið eldri mynd úr albúminu.
            </p>

            {pReady && (
              <div className="space-y-3">
                {pItems.map((it, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        value={it.name}
                        onChange={(e) => setPItem(i, { name: e.target.value })}
                        placeholder="Heiti réttar"
                        className={field}
                      />
                      <button
                        type="button"
                        onClick={() => removePhotoItem(i)}
                        aria-label="Fjarlægja"
                        className="shrink-0 rounded-md border border-border px-2 py-2 text-xs text-muted-foreground hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                    {it.note && (
                      <p className="text-xs text-muted-foreground">{it.note}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Magn (g)</span>
                        <input inputMode="decimal" value={it.grams} onChange={(e) => setPItem(i, { grams: e.target.value })} placeholder="g" className={field} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Kaloríur</span>
                        <input inputMode="decimal" value={it.kcal} onChange={(e) => setPItem(i, { kcal: e.target.value })} placeholder="kcal" className={field} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Prótein (g)</span>
                        <input inputMode="decimal" value={it.protein} onChange={(e) => setPItem(i, { protein: e.target.value })} placeholder="g" className={field} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Kolvetni (g)</span>
                        <input inputMode="decimal" value={it.carbs} onChange={(e) => setPItem(i, { carbs: e.target.value })} placeholder="g" className={field} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Fita (g)</span>
                        <input inputMode="decimal" value={it.fat} onChange={(e) => setPItem(i, { fat: e.target.value })} placeholder="g" className={field} />
                      </label>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPhotoItem}
                  className="text-sm text-accent hover:underline"
                >
                  + Bæta við mat (t.d. kjúklingaskinku)
                </button>
                <div>
                  <button
                    type="button"
                    onClick={addAllPhotoItems}
                    disabled={saving || !pItems.some((it) => it.name.trim())}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving
                      ? "Skrái…"
                      : `Skrá ${pItems.filter((it) => it.name.trim()).length} atriði`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "product" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground transition hover:border-accent hover:text-foreground">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onProductPhoto(e.target.files?.[0] ?? null)}
              />
              {prodBusy
                ? "Les næringartöflu…"
                : "📷 Taktu mynd af næringartöflunni á vörunni"}
            </label>
            <p className="text-xs text-muted-foreground">
              Claude les næringartöfluna (per 100 g) og vistar vöruna undir „mín
              matvæli" svo þú getir skráð hana aftur síðar. Yfirfarðu tölurnar
              áður en þú vistar.
            </p>
            {prodSaved && !prodReady && (
              <p className="text-sm text-accent">
                ✓ Vistað í „mín matvæli". Þú finnur það undir flipanum Mín
                matvæli.
              </p>
            )}
            {prodReady && (
              <div className="space-y-3 rounded-md border border-border bg-background p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Heiti</span>
                    <input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="Heiti vöru" className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Framleiðandi</span>
                    <input value={prodBrand} onChange={(e) => setProdBrand(e.target.value)} placeholder="(valfrjálst)" className={field} />
                  </label>
                </div>
                <span className="block text-xs text-muted-foreground">
                  Gildi per 100 g
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Kaloríur</span>
                    <input inputMode="decimal" value={prodKcal} onChange={(e) => setProdKcal(e.target.value)} placeholder="kcal" className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Prótein (g)</span>
                    <input inputMode="decimal" value={prodProtein} onChange={(e) => { setProdProtein(e.target.value); setProdKcal(kcalFromMacros(e.target.value, prodCarbs, prodFat)); }} placeholder="g" className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Kolvetni (g)</span>
                    <input inputMode="decimal" value={prodCarbs} onChange={(e) => { setProdCarbs(e.target.value); setProdKcal(kcalFromMacros(prodProtein, e.target.value, prodFat)); }} placeholder="g" className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Fita (g)</span>
                    <input inputMode="decimal" value={prodFat} onChange={(e) => { setProdFat(e.target.value); setProdKcal(kcalFromMacros(prodProtein, prodCarbs, e.target.value)); }} placeholder="g" className={field} />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={saveProduct}
                  disabled={saving || !prodName.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
                >
                  {saving ? "Vista…" : "Vista í mín matvæli"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onFound={(p) => {
            setMode("search");
            setPicked(p);
            setGrams(p.serving_g ? String(p.serving_g) : "100");
            setResults([]);
            setScanning(false);
          }}
        />
      )}
    </div>
  );
}
