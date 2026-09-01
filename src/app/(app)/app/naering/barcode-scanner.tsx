"use client";

import { useEffect, useRef, useState } from "react";

// Normalized food shape (matches the search route + naering-form's SearchResult).
type ScannedFood = {
  code: string | null;
  name: string;
  brand: string | null;
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  serving_g: number | null;
};

type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector ?? null
  );
}

async function lookup(code: string): Promise<ScannedFood | null> {
  try {
    const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`);
    const json = await res.json();
    return json.product ?? null;
  } catch {
    return null;
  }
}

export function BarcodeScanner({
  onClose,
  onFound,
}: {
  onClose: () => void;
  onFound: (p: ScannedFood) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported] = useState(() => getDetectorCtor() !== null);
  const [status, setStatus] = useState<string>("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  // Refs so the camera effect can run once (not restart on every render).
  const busyRef = useRef(false);
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);

  const setBusyBoth = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const Ctor = getDetectorCtor();
    if (!Ctor) return;

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const detector = new Ctor({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("Beindu myndavélinni að strikamerkinu…");

        timer = setInterval(async () => {
          if (!videoRef.current || busyRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue;
            if (raw) {
              setBusyBoth(true);
              setStatus("Fletti upp…");
              const food = await lookup(raw);
              if (food) {
                onFoundRef.current(food);
              } else {
                setStatus(`Fann ekki vöru (${raw}). Reyndu aftur eða sláðu inn.`);
                setBusyBoth(false);
              }
            }
          } catch {
            /* transient detn error — keep scanning */
          }
        }, 500);
      } catch {
        setStatus("Fékk ekki aðgang að myndavél.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // Run once: camera setup shouldn't restart on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookupManual() {
    const code = manual.trim();
    if (!/^\d{6,14}$/.test(code)) {
      setStatus("Sláðu inn gilt strikamerki (6–14 tölur).");
      return;
    }
    setBusyBoth(true);
    setStatus("Fletti upp…");
    const food = await lookup(code);
    if (food) onFoundRef.current(food);
    else {
      setStatus("Fann ekki vöru.");
      setBusyBoth(false);
    }
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Skanna strikamerki</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {supported ? (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
            {status && (
              <p className="mt-2 text-xs text-muted-foreground">{status}</p>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 text-xs text-muted-foreground">
                Eða sláðu inn strikamerkið:
              </p>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="t.d. 5690184001010"
                  className={field}
                />
                <button
                  type="button"
                  onClick={lookupManual}
                  disabled={busy}
                  className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
                >
                  Fletta upp
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              Þessi vafri styður ekki strikamerkja-skönnun. Sláðu inn
              strikamerkið handvirkt:
            </p>
            <div className="mt-2 flex gap-2">
              <input
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="t.d. 5690184001010"
                className={field}
              />
              <button
                type="button"
                onClick={lookupManual}
                disabled={busy}
                className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
              >
                Fletta upp
              </button>
            </div>
            {status && (
              <p className="mt-2 text-xs text-muted-foreground">{status}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
