import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Upload, CheckCircle, AlertTriangle, X, RotateCcw, Plus, Star, ArrowLeft, Home, BookOpen, Search, User, ChevronRight, Package } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  surfaceAlt: "#222222",
  border: "#2a2a2a",
  red: "#E3350D",
  redDim: "#9a2108",
  gold: "#FFD700",
  green: "#22c55e",
  muted: "#4a4a4a",
  text: "#f5f5f5",
  textMuted: "#9a9a9a",
};

const COLLECTION_KEY = "collection";

const CHASE_RARITIES = new Set([
  "Rare Holo",
  "Rare Ultra",
  "Rare Secret",
  "Rare Rainbow",
  "Rare Shining",
  "Amazing Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "ACE SPEC Rare",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Rare Holo EX",
  "Rare Holo GX",
  "Trainer Gallery Rare Holo",
  "Double Rare",
  "Ultra Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
]);

// ─── Storage Utilities ────────────────────────────────────────────────────────

async function loadCollection() {
  try {
    const result = await window.storage.get(COLLECTION_KEY);
    return result
      ? JSON.parse(result.value)
      : { cards: {}, totalValue: 0, lastUpdated: null };
  } catch {
    return { cards: {}, totalValue: 0, lastUpdated: null };
  }
}

async function saveCard(tcgCard, marketPrice) {
  const collection = await loadCollection();
  const existing = collection.cards[tcgCard.id];

  if (existing) {
    existing.quantity += 1;
  } else {
    collection.cards[tcgCard.id] = {
      id: tcgCard.id,
      name: tcgCard.name,
      setId: tcgCard.set.id,
      setName: tcgCard.set.name,
      number: tcgCard.number,
      rarity: tcgCard.rarity ?? "",
      imageUrl: tcgCard.images?.small ?? "",
      marketPrice,
      scannedAt: new Date().toISOString(),
      quantity: 1,
    };
  }

  collection.totalValue = Object.values(collection.cards).reduce(
    (sum, c) => sum + (c.marketPrice ?? 0) * c.quantity,
    0
  );
  collection.lastUpdated = new Date().toISOString();

  await window.storage.set(COLLECTION_KEY, JSON.stringify(collection));
  return collection;
}

async function loadSetCache(setId) {
  try {
    const result = await window.storage.get(`setcache:${setId}`);
    if (!result) return null;
    const cache = JSON.parse(result.value);
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) return null; // Expired after 24h
    return cache;
  } catch {
    return null;
  }
}

async function saveSetCache(setId, data) {
  try {
    await window.storage.set(
      `setcache:${setId}`,
      JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
    );
  } catch (e) {
    console.warn("Set cache save failed:", e);
  }
}

// ─── API Utilities ────────────────────────────────────────────────────────────

async function identifyCardWithVision(base64) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are a Pokémon TCG card identification assistant. When given an image of a Pokémon card, identify it precisely and return ONLY a JSON object with no preamble or markdown backticks.

Return this exact structure:
{
  "name": "card name as printed",
  "setName": "set name as printed",
  "number": "card number as printed (e.g. 001/167)",
  "rarity": "rarity as printed or inferred from rarity symbol",
  "confidence": "high|medium|low",
  "notes": "any issues, ambiguity, or important observations"
}

If the image is blurry, obstructed, or not a Pokémon card, set confidence to low and explain in notes.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64,
              },
            },
            { type: "text", text: "Identify this Pokémon card." },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Vision API error ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.find((b) => b.type === "text")?.text || "";
  const clean = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function fetchCardByNameAndSet(name, setName, fallbackNumber) {
  // Normalize: lowercase for comparison
  const encodedQ = encodeURIComponent(`name:"${name}" set.name:"${setName}"`);
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=${encodedQ}&pageSize=10`
  );

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`TCG_HTTP_${res.status}`);

  const data = await res.json();
  const cards = data.data ?? [];

  if (cards.length === 0) {
    // Fallback: name-only search
    const fallbackQ = encodeURIComponent(`name:"${name}"`);
    const fallbackRes = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${fallbackQ}&pageSize=20`
    );
    if (!fallbackRes.ok) return null;
    const fallbackData = await fallbackRes.json();
    return fallbackData.data?.[0] ?? null;
  }

  if (cards.length === 1) return cards[0];

  // Multiple results — pick by number if available
  if (fallbackNumber) {
    const numOnly = fallbackNumber.split("/")[0].replace(/^0+/, "");
    const match = cards.find(
      (c) => c.number.replace(/^0+/, "") === numOnly
    );
    if (match) return match;
  }

  return cards[0];
}

async function fetchSetCards(setId) {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&orderBy=number`
  );
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`TCG_HTTP_${res.status}`);
  const data = await res.json();
  return data.data ?? [];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function extractPrice(card) {
  return (
    card?.tcgplayer?.prices?.holofoil?.market ??
    card?.tcgplayer?.prices?.normal?.market ??
    card?.tcgplayer?.prices?.reverseHolofoil?.market ??
    card?.cardmarket?.prices?.averageSellPrice ??
    null
  );
}

function formatPrice(value) {
  if (value == null) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function captureFrame(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

function getCardStatus(setCard, collection) {
  const owned = collection?.cards?.[setCard.id];
  return {
    isOwned: !!owned,
    quantity: owned?.quantity ?? 0,
    isChase: CHASE_RARITIES.has(setCard.rarity),
  };
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Toast({ message, type = "info", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg =
    type === "error"
      ? COLORS.red
      : type === "warning"
      ? "#b45309"
      : "#1d4ed8";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        zIndex: 1000,
        maxWidth: "90vw",
        textAlign: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {message}
    </div>
  );
}

function LoadingSpinner({ label }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 32,
        color: COLORS.textMuted,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: `3px solid ${COLORS.border}`,
          borderTop: `3px solid ${COLORS.red}`,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      {label && <span style={{ fontSize: 14 }}>{label}</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ConfidenceBadge({ confidence }) {
  if (confidence === "high") return null;
  const isLow = confidence === "low";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: isLow ? "rgba(227,53,13,0.15)" : "rgba(180,83,9,0.15)",
        border: `1px solid ${isLow ? COLORS.red : "#b45309"}`,
        borderRadius: 8,
        padding: "10px 14px",
        color: isLow ? "#fca5a5" : "#fcd34d",
        fontSize: 13,
      }}
    >
      <AlertTriangle size={16} />
      <span>
        {isLow
          ? "Low confidence — please verify the details below"
          : "Please verify card details"}
      </span>
    </div>
  );
}

function CardTile({ card, isOwned, quantity, isChase }) {
  return (
    <div style={{ position: "relative" }}>
      <img
        src={card.imageUrl}
        alt={card.name}
        style={{
          width: "100%",
          borderRadius: 6,
          display: "block",
          filter: isOwned ? "none" : "grayscale(100%)",
          opacity: isOwned ? 1 : 0.3,
        }}
      />
      {isOwned && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            background: COLORS.green,
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle size={14} color="#fff" fill={COLORS.green} />
        </div>
      )}
      {isChase && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: COLORS.gold,
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Star size={12} color="#000" fill="#000" />
        </div>
      )}
      {isOwned && quantity > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            padding: "2px 5px",
          }}
        >
          ×{quantity}
        </div>
      )}
    </div>
  );
}

function SetProgress({ owned, total, value }) {
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 14, color: COLORS.textMuted }}>
          {owned} / {total} cards ({pct}%)
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.green }}>
          {formatPrice(value)}
        </span>
      </div>
      <div style={{ background: COLORS.muted, borderRadius: 4, height: 8 }}>
        <div
          style={{
            width: `${pct}%`,
            background: COLORS.red,
            height: 8,
            borderRadius: 4,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── ScanScreen ───────────────────────────────────────────────────────────────

function ScanScreen({ onScanComplete }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState(null);
  const [capturedBase64, setCapturedBase64] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") =>
    setToast({ message, type });

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (e) {
      const msg =
        e.name === "NotAllowedError"
          ? "Camera permission denied"
          : e.name === "NotFoundError"
          ? "No camera found"
          : "Camera unavailable";
      setCameraError(msg);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      setStream((s) => {
        if (s) s.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, [startCamera]);

  async function handleIdentify(base64) {
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const visionResult = await identifyCardWithVision(base64);
      onScanComplete({ visionResult, capturedBase64: base64 });
    } catch (e) {
      const msg = e.message.includes("RATE_LIMITED")
        ? "Rate limited — try again in a moment"
        : "Identification failed — try again";
      setIdentifyError(msg);
      showToast(msg, "error");
    } finally {
      setIdentifying(false);
    }
  }

  function handleCapture() {
    if (!videoRef.current || !cameraReady) return;
    const base64 = captureFrame(videoRef.current);
    setCapturedBase64(base64);
    handleIdentify(base64);
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      handleIdentify(base64);
    };
    reader.readAsDataURL(file);
  }

  const showFallback = !!cameraError;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Exo 2', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: COLORS.red,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Camera size={18} color="#fff" />
        </div>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Scan Card</span>
      </div>

      {/* Camera / Fallback area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {!showFallback ? (
          <>
            <div style={{ position: "relative", background: "#000", flex: 1 }}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  maxHeight: "65vh",
                }}
              />
              {/* Viewfinder overlay */}
              {cameraReady && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      width: "62%",
                      aspectRatio: "2.5 / 3.5",
                      border: `2px solid rgba(255,255,255,0.5)`,
                      borderRadius: 12,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                    }}
                  />
                </div>
              )}
              {!cameraReady && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.7)",
                  }}
                >
                  <LoadingSpinner label="Starting camera…" />
                </div>
              )}
            </div>

            {/* Capture bar */}
            <div
              style={{
                padding: "24px 20px",
                background: COLORS.surface,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              {identifying ? (
                <LoadingSpinner label="Analyzing card…" />
              ) : (
                <>
                  <button
                    onClick={handleCapture}
                    disabled={!cameraReady}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: COLORS.red,
                      border: "4px solid #fff",
                      cursor: cameraReady ? "pointer" : "not-allowed",
                      opacity: cameraReady ? 1 : 0.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 20px rgba(227,53,13,0.5)",
                    }}
                  >
                    <Camera size={28} color="#fff" />
                  </button>
                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Center the card in the frame and tap
                  </span>

                  {/* Upload fallback link */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: COLORS.textMuted,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "6px 12px",
                    }}
                  >
                    <Upload size={14} />
                    Upload image instead
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </>
              )}
              {identifyError && !identifying && (
                <span style={{ color: "#fca5a5", fontSize: 13 }}>
                  {identifyError}
                </span>
              )}
            </div>
          </>
        ) : (
          /* File upload fallback (camera unavailable) */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              gap: 24,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                background: COLORS.surfaceAlt,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={36} color={COLORS.muted} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Camera Unavailable
              </p>
              <p style={{ color: COLORS.textMuted, fontSize: 14 }}>
                {cameraError} — upload a photo instead
              </p>
            </div>

            {identifying ? (
              <LoadingSpinner label="Analyzing card…" />
            ) : (
              <>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: COLORS.red,
                    color: "#fff",
                    padding: "14px 28px",
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                >
                  <Upload size={20} />
                  Choose Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </label>
                {identifyError && (
                  <span style={{ color: "#fca5a5", fontSize: 13 }}>
                    {identifyError}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── ConfirmScreen ────────────────────────────────────────────────────────────

function ConfirmScreen({ visionResult, capturedBase64, onDiscard, onAdd }) {
  const [tcgCard, setTcgCard] = useState(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [collection, setCollection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Editable fields, pre-filled from Vision
  const [name, setName] = useState(visionResult?.name ?? "");
  const [setName, setSetName] = useState(visionResult?.setName ?? "");
  const [number, setNumber] = useState(visionResult?.number ?? "");

  const showToast = (message, type = "info") =>
    setToast({ message, type });

  useEffect(() => {
    async function init() {
      const col = await loadCollection();
      setCollection(col);
      await lookupCard(visionResult?.name, visionResult?.setName, visionResult?.number);
    }
    init();
  }, []);

  async function lookupCard(cardName, cardSetName, cardNumber) {
    setLoadingCard(true);
    setFetchError(null);
    try {
      const card = await fetchCardByNameAndSet(cardName, cardSetName, cardNumber);
      setTcgCard(card);
      if (!card) setFetchError("Card not found in TCG database");
    } catch (e) {
      if (e.message === "RATE_LIMITED") {
        setFetchError("Rate limited — try again in a moment");
        showToast("Too many requests — try again in a moment", "warning");
      } else {
        setFetchError("Could not fetch card data");
      }
    } finally {
      setLoadingCard(false);
    }
  }

  function handleRetryLookup() {
    lookupCard(name, setName, number.split("/")[0]);
  }

  const marketPrice = extractPrice(tcgCard);
  const existingCard = collection?.cards?.[tcgCard?.id];
  const isDuplicate = !!existingCard;
  const currentTotal = collection?.totalValue ?? 0;
  const newTotal = currentTotal + (marketPrice ?? 0);

  async function handleAddToCollection() {
    if (!tcgCard) return;
    setSaving(true);
    try {
      const updated = await saveCard(tcgCard, marketPrice);
      setCollection(updated);
      showToast(
        isDuplicate
          ? `Added another copy! You now have ${(existingCard?.quantity ?? 0) + 1}×`
          : "Card added to collection!",
        "info"
      );
      // Navigate to binder for this set after short delay
      setTimeout(() => onAdd(tcgCard.set.id), 1200);
    } catch {
      showToast("Failed to save card — please try again", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.text,
    padding: "10px 12px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'Exo 2', sans-serif",
    outline: "none",
  };

  const labelStyle = {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700 }}>Confirm Card</span>
        <button
          onClick={() => onDiscard()}
          style={{
            background: "none",
            border: "none",
            color: COLORS.textMuted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            padding: "4px 8px",
          }}
        >
          <RotateCcw size={16} />
          Rescan
        </button>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {/* Captured image + TCG card preview */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            alignItems: "flex-start",
          }}
        >
          {capturedBase64 && (
            <img
              src={`data:image/jpeg;base64,${capturedBase64}`}
              alt="Captured card"
              style={{
                width: 90,
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                flexShrink: 0,
              }}
            />
          )}
          {tcgCard?.images?.small && (
            <div style={{ position: "relative" }}>
              <img
                src={tcgCard.images.small}
                alt={tcgCard.name}
                style={{
                  width: 90,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                }}
              />
              {CHASE_RARITIES.has(tcgCard.rarity) && (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: COLORS.gold,
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Star size={12} color="#000" fill="#000" />
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: COLORS.textMuted,
                marginBottom: 4,
              }}
            >
              Captured → Official
            </div>
            {loadingCard ? (
              <LoadingSpinner label="Looking up card…" />
            ) : tcgCard ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {tcgCard.name}
                </div>
                <div
                  style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}
                >
                  {tcgCard.set?.name} · #{tcgCard.number}
                </div>
                {tcgCard.rarity && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: CHASE_RARITIES.has(tcgCard.rarity)
                        ? COLORS.gold
                        : COLORS.textMuted,
                      fontWeight: CHASE_RARITIES.has(tcgCard.rarity) ? 700 : 400,
                    }}
                  >
                    {tcgCard.rarity}
                    {CHASE_RARITIES.has(tcgCard.rarity) && " ⭐"}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
                {fetchError || "Not found"}
              </div>
            )}
          </div>
        </div>

        {/* Confidence badge */}
        {visionResult?.confidence && (
          <div style={{ marginBottom: 16 }}>
            <ConfidenceBadge confidence={visionResult.confidence} />
          </div>
        )}

        {/* Duplicate warning */}
        {isDuplicate && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,215,0,0.1)",
              border: `1px solid ${COLORS.gold}`,
              borderRadius: 8,
              padding: "10px 14px",
              color: COLORS.gold,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={16} />
            <span>
              You already have {existingCard.quantity}× this card. Adding will
              make {existingCard.quantity + 1}×.
            </span>
          </div>
        )}

        {/* Editable fields */}
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Card Name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Set Name</label>
            <input
              style={inputStyle}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Card Number</label>
            <input
              style={inputStyle}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          {fetchError && (
            <button
              onClick={handleRetryLookup}
              style={{
                marginTop: 12,
                background: "none",
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textMuted,
                padding: "8px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "'Exo 2', sans-serif",
              }}
            >
              Retry lookup with edited fields
            </button>
          )}
        </div>

        {/* Price + collection total */}
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: loadingCard ? 0 : 12,
            }}
          >
            <span style={{ color: COLORS.textMuted, fontSize: 14 }}>
              Market Price
            </span>
            {loadingCard ? (
              <span style={{ color: COLORS.textMuted, fontSize: 14 }}>…</span>
            ) : (
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color:
                    marketPrice != null ? COLORS.green : COLORS.textMuted,
                }}
              >
                {formatPrice(marketPrice)}
              </span>
            )}
          </div>
          {!loadingCard && (
            <>
              <div
                style={{
                  height: 1,
                  background: COLORS.border,
                  marginBottom: 12,
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ color: COLORS.textMuted, fontSize: 13 }}>
                  Collection after adding
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: COLORS.text,
                  }}
                >
                  {formatPrice(newTotal)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action buttons — fixed at bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 20px",
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          display: "flex",
          gap: 12,
        }}
      >
        <button
          onClick={() => onDiscard()}
          style={{
            flex: 1,
            padding: "14px",
            background: "none",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            color: COLORS.text,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Exo 2', sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <X size={18} />
          Discard
        </button>
        <button
          onClick={handleAddToCollection}
          disabled={!tcgCard || saving}
          style={{
            flex: 2,
            padding: "14px",
            background: !tcgCard || saving ? COLORS.muted : COLORS.red,
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: !tcgCard || saving ? "not-allowed" : "pointer",
            fontFamily: "'Exo 2', sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "background 0.2s",
          }}
        >
          {saving ? (
            <LoadingSpinner />
          ) : (
            <>
              <Plus size={18} />
              {isDuplicate ? "Add Another Copy" : "Add to Collection"}
            </>
          )}
        </button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── BinderScreen ─────────────────────────────────────────────────────────────

function BinderScreen({ setId, onBack }) {
  const [setCards, setSetCards] = useState([]);
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setName, setSetName] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const [col, cache] = await Promise.all([
          loadCollection(),
          loadSetCache(setId),
        ]);
        setCollection(col);

        let cards;
        if (cache) {
          cards = cache.cards;
          setSetName(cache.setName);
        } else {
          const raw = await fetchSetCards(setId);
          cards = raw.map((c) => ({
            id: c.id,
            name: c.name,
            number: c.number,
            rarity: c.rarity ?? "",
            imageUrl: c.images?.small ?? "",
          }));
          const inferredSetName = raw[0]?.set?.name ?? setId;
          setSetName(inferredSetName);
          await saveSetCache(setId, {
            setId,
            setName: inferredSetName,
            totalCards: cards.length,
            cards,
          });
        }
        setSetCards(cards);
      } catch (e) {
        setError(
          e.message === "RATE_LIMITED"
            ? "Too many requests — try again in a moment"
            : "Failed to load set data"
        );
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [setId]);

  const ownedCards = setCards.filter((c) => collection?.cards?.[c.id]);
  const ownedCount = ownedCards.length;
  const totalCount = setCards.length;
  const setValue = ownedCards.reduce((sum, c) => {
    const stored = collection?.cards?.[c.id];
    return sum + (stored?.marketPrice ?? 0) * (stored?.quantity ?? 1);
  }, 0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => onBack()}
          style={{
            background: "none",
            border: "none",
            color: COLORS.textMuted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {setName || setId}
          </div>
          {!loading && !error && (
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              {ownedCount} / {totalCount} cards owned
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {loading ? (
          <LoadingSpinner label="Loading set…" />
        ) : error ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: COLORS.textMuted,
            }}
          >
            <AlertTriangle
              size={32}
              color={COLORS.red}
              style={{ marginBottom: 12 }}
            />
            <div style={{ fontSize: 14 }}>{error}</div>
          </div>
        ) : (
          <>
            <SetProgress owned={ownedCount} total={totalCount} value={setValue} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {setCards.map((card) => {
                const { isOwned, quantity, isChase } = getCardStatus(
                  card,
                  collection
                );
                return (
                  <CardTile
                    key={card.id}
                    card={card}
                    isOwned={isOwned}
                    quantity={quantity}
                    isChase={isChase}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

    </div>
  );
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────

function DashboardScreen({ onViewSet }) {
  const [collection, setCollection] = useState(null);
  const [setCaches, setSetCaches] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const col = await loadCollection();
      setCollection(col);
      const setIds = [
        ...new Set(Object.values(col.cards).map((c) => c.setId)),
      ];
      if (setIds.length > 0) {
        const caches = await Promise.all(setIds.map((id) => loadSetCache(id)));
        const cacheMap = {};
        setIds.forEach((id, i) => {
          if (caches[i]) cacheMap[id] = caches[i];
        });
        setSetCaches(cacheMap);
      }
      setLoading(false);
    }
    init();
  }, []);

  const cards = collection ? Object.values(collection.cards) : [];
  const totalCount = cards.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
  const totalValue = collection?.totalValue ?? 0;

  // Per-set grouping
  const sets = {};
  for (const card of cards) {
    if (!sets[card.setId]) {
      sets[card.setId] = {
        setId: card.setId,
        setName: card.setName,
        owned: 0,
        value: 0,
      };
    }
    sets[card.setId].owned += 1;
    sets[card.setId].value += (card.marketPrice ?? 0) * (card.quantity ?? 1);
  }
  const setList = Object.values(sets).sort((a, b) => b.value - a.value);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 100,
      }}
    >
      {/* Minimal header */}
      <div
        style={{
          padding: "20px 20px 16px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: COLORS.text,
          }}
        >
          Home
        </span>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {loading ? (
          <LoadingSpinner label="Loading collection…" />
        ) : (
          <>
            {/* Primary stat — collection value */}
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: "24px 20px",
                marginBottom: 12,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Subtle red accent bar on left edge */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  background: COLORS.green,
                  borderRadius: "16px 0 0 16px",
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                  marginBottom: 8,
                }}
              >
                Collection Value
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 900,
                  color: COLORS.green,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {formatPrice(totalValue)}
              </div>
            </div>

            {/* Secondary stats — two tiles */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 28,
              }}
            >
              {[
                { label: "Total Cards", value: totalCount },
                { label: "Sets Started", value: setList.length },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: COLORS.surfaceAlt,
                    borderRadius: 12,
                    padding: "14px 16px",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: COLORS.text,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      marginBottom: 6,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Sets list */}
            {setList.length > 0 ? (
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 12,
                  }}
                >
                  My Sets
                </div>
                {setList.map((set) => {
                  const cache = setCaches[set.setId];
                  const total = cache?.totalCards ?? null;
                  const pct = total ? Math.min(100, Math.round((set.owned / total) * 100)) : null;
                  const logoUrl = cache?.images?.symbol ?? cache?.symbolUrl ?? null;

                  return (
                    <div
                      key={set.setId}
                      onClick={() => onViewSet(set.setId)}
                      style={{
                        background: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 14,
                        padding: "16px 16px 14px",
                        marginBottom: 10,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                      }}
                    >
                      {/* Set symbol / fallback icon */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: COLORS.surfaceAlt,
                          border: `1px solid ${COLORS.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt=""
                            style={{ width: 26, height: 26, objectFit: "contain" }}
                          />
                        ) : (
                          <Package size={18} color={COLORS.muted} />
                        )}
                      </div>

                      {/* Text + progress */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 3,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 15,
                              color: COLORS.text,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {set.setName}
                          </div>
                          {pct !== null && (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: pct === 100 ? COLORS.green : COLORS.gold,
                                background:
                                  pct === 100
                                    ? "rgba(34,197,94,0.12)"
                                    : "rgba(255,215,0,0.1)",
                                border: `1px solid ${pct === 100 ? "rgba(34,197,94,0.25)" : "rgba(255,215,0,0.2)"}`,
                                borderRadius: 6,
                                padding: "2px 7px",
                                flexShrink: 0,
                                letterSpacing: "0.03em",
                              }}
                            >
                              {pct}%
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: COLORS.textMuted,
                            marginBottom: total ? 8 : 0,
                          }}
                        >
                          {set.owned}
                          {total ? ` / ${total}` : ""} cards
                          {" · "}
                          {formatPrice(set.value)}
                        </div>

                        {/* Progress bar — 8px tall */}
                        {total && (
                          <div
                            style={{
                              background: COLORS.muted,
                              borderRadius: 4,
                              height: 8,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                background:
                                  pct === 100
                                    ? COLORS.green
                                    : `linear-gradient(90deg, ${COLORS.red}, #ff6b3d)`,
                                height: "100%",
                                borderRadius: 4,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <ChevronRight size={18} color={COLORS.muted} style={{ flexShrink: 0 }} />
                    </div>
                  );
                })}
              </>
            ) : (
              /* Empty state */
              <div
                style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 16,
                  padding: "40px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Package size={26} color={COLORS.muted} />
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: COLORS.text,
                    textAlign: "center",
                  }}
                >
                  No cards yet
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.textMuted,
                    textAlign: "center",
                    lineHeight: 1.5,
                    maxWidth: 240,
                  }}
                >
                  Scan or search for a card to start building your collection.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

const TAB_DEFS = [
  { id: "home",   label: "Home",   Icon: Home },
  { id: "binder", label: "Binder", Icon: BookOpen },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "search", label: "Search", Icon: Search },
  { id: "user",   label: "User",   Icon: User },
];

function TabBar({ activeTab, onSelect }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        zIndex: 100,
      }}
    >
      {TAB_DEFS.map(({ id, label, Icon }) => {
        const active = id === activeTab;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: active ? COLORS.red : COLORS.textMuted,
              fontFamily: "'Exo 2', sans-serif",
            }}
          >
            <Icon size={22} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── BinderTabScreen ──────────────────────────────────────────────────────────

async function fetchAllSets() {
  const res = await fetch("https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250");
  if (!res.ok) throw new Error("Failed to load sets");
  const data = await res.json();
  return data.data ?? [];
}

function BinderTabScreen({ onOpenSet }) {
  const [collection, setCollection] = useState(null);
  const [allSets, setAllSets] = useState([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function init() {
      const [col, sets] = await Promise.all([
        loadCollection(),
        fetchAllSets().catch(() => []),
      ]);
      setCollection(col);
      setAllSets(sets);
      setLoadingAll(false);
    }
    init();
  }, []);

  const mySetIds = collection
    ? new Set(Object.values(collection.cards).map((c) => c.setId))
    : new Set();

  const mySets = allSets.filter((s) => mySetIds.has(s.id));
  const filtered = allSets.filter(
    (s) =>
      !mySetIds.has(s.id) &&
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 80,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 20px 16px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 900 }}>Binder</span>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {loadingAll ? (
          <LoadingSpinner label="Loading sets…" />
        ) : (
          <>
            {/* My Sets */}
            {mySets.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    marginBottom: 10,
                  }}
                >
                  My Sets
                </div>
                {mySets.map((set) => {
                  const ownedCount = Object.values(collection?.cards ?? {}).filter(
                    (c) => c.setId === set.id
                  ).length;
                  return (
                    <div
                      key={set.id}
                      onClick={() => onOpenSet(set.id)}
                      style={{
                        background: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        padding: "12px 16px",
                        marginBottom: 10,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      {set.images?.symbol && (
                        <img src={set.images.symbol} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{set.name}</div>
                        <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                          {ownedCount} card{ownedCount !== 1 ? "s" : ""} owned · {set.total} total
                        </div>
                      </div>
                      <ChevronRight size={16} color={COLORS.textMuted} />
                    </div>
                  );
                })}
                <div style={{ height: 20 }} />
              </>
            )}

            {/* All Sets */}
            <div
              style={{
                fontSize: 11,
                color: COLORS.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              All Sets
            </div>
            <input
              type="text"
              placeholder="Search sets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                color: COLORS.text,
                padding: "10px 14px",
                fontSize: 14,
                width: "100%",
                fontFamily: "'Exo 2', sans-serif",
                outline: "none",
                marginBottom: 14,
              }}
            />
            {filtered.map((set) => (
              <div
                key={set.id}
                onClick={() => onOpenSet(set.id)}
                style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  marginBottom: 10,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {set.images?.symbol && (
                  <img src={set.images.symbol} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{set.name}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    {set.series} · {set.total} cards
                  </div>
                </div>
                <ChevronRight size={16} color={COLORS.textMuted} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── SearchScreen ─────────────────────────────────────────────────────────────

function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [collection, setCollection] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadCollection().then(setCollection);
  }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const q = encodeURIComponent(`name:"${query.trim()}"`);
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=20&orderBy=-set.releaseDate`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.data ?? []);
    } catch {
      setToast({ message: "Search failed — try again", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(card) {
    const price = extractPrice(card);
    try {
      const updated = await saveCard(card, price);
      setCollection(updated);
      setToast({ message: `${card.name} added!`, type: "info" });
    } catch {
      setToast({ message: "Failed to save", type: "error" });
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          padding: "20px 20px 16px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 900 }}>Search</span>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {/* Search bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search card name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{
              flex: 1,
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              color: COLORS.text,
              padding: "12px 14px",
              fontSize: 15,
              fontFamily: "'Exo 2', sans-serif",
              outline: "none",
            }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              background: COLORS.red,
              border: "none",
              borderRadius: 10,
              color: "#fff",
              padding: "12px 18px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Exo 2', sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Search size={16} />
          </button>
        </div>

        {loading && <LoadingSpinner label="Searching…" />}

        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: "center", color: COLORS.textMuted, padding: 32 }}>
            No cards found
          </div>
        )}

        {results.map((card) => {
          const price = extractPrice(card);
          const owned = !!collection?.cards?.[card.id];
          return (
            <div
              key={card.id}
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: "12px",
                marginBottom: 10,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              {card.images?.small && (
                <img
                  src={card.images.small}
                  alt={card.name}
                  style={{ width: 52, borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{card.name}</div>
                <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {card.set?.name} · #{card.number}
                </div>
                <div style={{ color: COLORS.green, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                  {formatPrice(price)}
                </div>
              </div>
              <button
                onClick={() => handleAdd(card)}
                style={{
                  background: owned ? COLORS.muted : COLORS.red,
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: owned ? "default" : "pointer",
                  fontFamily: "'Exo 2', sans-serif",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {owned ? <CheckCircle size={14} /> : <Plus size={14} />}
                {owned ? "Owned" : "Add"}
              </button>
            </div>
          );
        })}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── UserScreen ───────────────────────────────────────────────────────────────

function UserScreen() {
  const [collection, setCollection] = useState(null);

  useEffect(() => {
    loadCollection().then(setCollection);
  }, []);

  const cards = collection ? Object.values(collection.cards) : [];
  const uniqueCount = cards.length;
  const totalCount = cards.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
  const totalValue = collection?.totalValue ?? 0;
  const setCount = new Set(cards.map((c) => c.setId)).size;

  async function handleClearCollection() {
    try {
      await window.storage.set("collection", JSON.stringify({ cards: {}, totalValue: 0, lastUpdated: new Date().toISOString() }));
      setCollection({ cards: {}, totalValue: 0 });
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Exo 2', sans-serif",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          padding: "20px 20px 16px",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 900 }}>Profile</span>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        {/* Stats summary */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: "20px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>
            COLLECTION SUMMARY
          </div>
          {[
            ["Unique Cards", uniqueCount],
            ["Total Cards", totalCount],
            ["Sets Started", setCount],
            ["Total Value", formatPrice(totalValue)],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: 10,
                marginBottom: 10,
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <span style={{ color: COLORS.textMuted, fontSize: 14 }}>{label}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* App info */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: "20px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>
            ABOUT
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: COLORS.red,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              ⬡
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>PokéBinder</div>
              <div style={{ color: COLORS.textMuted, fontSize: 12 }}>Your digital card collection</div>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.red}`,
            borderRadius: 14,
            padding: "20px",
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.red, marginBottom: 12, fontWeight: 700 }}>
            DANGER ZONE
          </div>
          <button
            onClick={handleClearCollection}
            style={{
              background: "none",
              border: `1px solid ${COLORS.red}`,
              borderRadius: 10,
              color: COLORS.red,
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Exo 2', sans-serif",
            }}
          >
            Clear Collection
          </button>
          <p style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>
            This will permanently delete all your saved cards.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── App (Root Router) ────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [binderSetId, setBinderSetId] = useState(null);
  const [confirmData, setConfirmData] = useState(null); // { visionResult, capturedBase64 }

  const showConfirm = !!confirmData;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0f0f; }
        input:focus { border-color: #E3350D !important; }
        button:active { opacity: 0.85; }
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;900&display=swap');
      `}</style>

      {/* Main tab content */}
      <div style={{ paddingBottom: 64 }}>
        {activeTab === "home" && (
          <DashboardScreen
            onViewSet={(setId) => {
              setBinderSetId(setId);
              setActiveTab("binder");
            }}
          />
        )}
        {activeTab === "binder" && !binderSetId && (
          <BinderTabScreen onOpenSet={(setId) => setBinderSetId(setId)} />
        )}
        {activeTab === "binder" && binderSetId && (
          <BinderScreen
            setId={binderSetId}
            onBack={() => setBinderSetId(null)}
          />
        )}
        {activeTab === "camera" && (
          <ScanScreen
            onScanComplete={(data) => setConfirmData(data)}
          />
        )}
        {activeTab === "search" && <SearchScreen />}
        {activeTab === "user" && <UserScreen />}
      </div>

      {/* Tab bar — hidden when confirm overlay is open */}
      {!showConfirm && (
        <TabBar
          activeTab={activeTab}
          onSelect={(tab) => {
            setActiveTab(tab);
            if (tab !== "binder") setBinderSetId(null);
          }}
        />
      )}

      {/* Confirm overlay */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: COLORS.bg }}>
          <ConfirmScreen
            visionResult={confirmData.visionResult}
            capturedBase64={confirmData.capturedBase64}
            onDiscard={() => setConfirmData(null)}
            onAdd={(setId) => {
              setConfirmData(null);
              setBinderSetId(setId);
              setActiveTab("binder");
            }}
          />
        </div>
      )}
    </>
  );
}
