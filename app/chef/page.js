"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const API_BASE = "/api/recipe";
const MAX_HISTORY = 10;

/** Resize an image File to max 800px on longest side, JPEG @75% quality. */
async function resizeImageFile(file, maxPx = 800, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(new File([blob], "image.jpg", { type: "image/jpeg" })),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function fetchFromImageAPI(file, customKey) {
  const compressed = await resizeImageFile(file);
  const formData = new FormData();
  formData.append("file", compressed);
  const headers = {};
  if (customKey) headers["x-custom-gemini-key"] = customKey;
  const response = await fetch(`${API_BASE}/from-image`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to generate recipe");
  return data;
}

async function fetchFromTextAPI(ingredientsList, customKey) {
  const headers = { "Content-Type": "application/json" };
  if (customKey) headers["x-custom-gemini-key"] = customKey;
  const response = await fetch(`${API_BASE}/from-text`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ingredients: ingredientsList }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to generate recipe");
  return data;
}

async function fetchExpiryInfo(items, customKey) {
  const headers = { "Content-Type": "application/json" };
  if (customKey) headers["x-custom-gemini-key"] = customKey;
  const response = await fetch("/api/ingredient-expiry", {
    method: "POST",
    headers,
    body: JSON.stringify({ ingredients: items }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to get expiry info");
  return data;
}

const ANALYSIS_MESSAGES = [
  "🔍 Scanning image...",
  "🧠 Identifying ingredients...",
  "👨‍🍳 Crafting your recipe...",
];

const TEXT_ANALYSIS_MESSAGES = [
  "🧠 Analysing ingredients...",
  "✨ Asking Gemini AI...",
  "🍽️ Preparing your recipe...",
];

const EXPIRY_MESSAGES = [
  "🔍 Checking your ingredients...",
  "📅 Calculating shelf life...",
  "💡 Finding storage tips...",
  "✅ Almost done...",
];

function getHistoryKey(userId) {
  return `chefy-history-${userId}`;
}

function loadHistory(userId) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(getHistoryKey(userId)) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(userId, history) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getHistoryKey(userId), JSON.stringify(history));
}

function addToHistory(userId, recipe, method) {
  const history = loadHistory(userId);
  const entry = {
    id: Date.now(),
    title: recipe.title,
    method,
    timestamp: new Date().toISOString(),
    recipe,
  };
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  saveHistory(userId, updated);
  return updated;
}

// ── Nutrition Card Component ────────────────────────────────────
function NutritionCard({ nutrition }) {
  if (!nutrition) return null;
  const stats = [
    { icon: "🔥", label: "Calories", value: nutrition.calories, color: "#f97316" },
    { icon: "💪", label: "Protein",  value: nutrition.protein,  color: "#8b5cf6" },
    { icon: "🌾", label: "Carbs",    value: nutrition.carbs,    color: "#06b6d4" },
    { icon: "🧈", label: "Fat",      value: nutrition.fat,      color: "#f59e0b" },
    { icon: "🌿", label: "Fiber",    value: nutrition.fiber,    color: "#10b981" },
  ];
  return (
    <div className="nutrition-card cascade-anim delay-2">
      <h3 className="nutrition-title">🥗 Nutritional Info <span className="nutrition-subtitle">(per serving)</span></h3>
      <div className="nutrition-grid">
        {stats.map((s) => (
          <div key={s.label} className="nutrition-stat" style={{ "--stat-color": s.color }}>
            <span className="nutrition-stat-icon">{s.icon}</span>
            <span className="nutrition-stat-value">{s.value || "—"}</span>
            <span className="nutrition-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
      {nutrition.keyNutrients && nutrition.keyNutrients.length > 0 && (
        <div className="nutrition-chips-wrap">
          <span className="nutrition-chips-label">✨ Key Nutrients:</span>
          <div className="nutrition-chips">
            {nutrition.keyNutrients.map((n, i) => (
              <span key={i} className="nutrition-chip">{n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expiry Urgency Badge ────────────────────────────────────────
function UrgencyBadge({ urgency }) {
  const map = {
    "use-now":  { label: "Use Now!",  cls: "urgency-now"  },
    "use-soon": { label: "Use Soon",  cls: "urgency-soon" },
    "can-wait": { label: "Can Wait",  cls: "urgency-wait" },
  };
  const info = map[urgency] || map["can-wait"];
  return <span className={`urgency-badge ${info.cls}`}>{info.label}</span>;
}

// ── Category Icon ───────────────────────────────────────────────
function categoryIcon(cat) {
  const icons = {
    Fruit: "🍎", Vegetable: "🥦", Meat: "🥩", Dairy: "🧀",
    Grain: "🌾", Spice: "🌶️", Other: "🥄",
  };
  return icons[cat] || "🥄";
}

export default function AiChef() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [theme, setTheme] = useState("dark");
  const [activeTab, setActiveTab] = useState("image-tab");
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [ingredients, setIngredients] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [recipeKey, setRecipeKey] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Expiry checker state
  const [expiryItems, setExpiryItems] = useState([]);
  const [expiryForm, setExpiryForm] = useState({ name: "", purchaseDate: "", quantity: "", type: "fresh" });
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryData, setExpiryData] = useState(null);
  const [expiryError, setExpiryError] = useState("");
  const [expiryStatus, setExpiryStatus] = useState("");
  const [expandedExpiry, setExpandedExpiry] = useState({});

  const imageInputRef = useRef(null);
  const recipeResultRef = useRef(null);
  const expiryResultRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth");
    }
  }, [status, router]);

  // Load theme and custom key
  useEffect(() => {
    const saved = localStorage.getItem("ai-chef-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved ? saved : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    const savedKey = localStorage.getItem("chefy-custom-api-key");
    if (savedKey) setCustomKey(savedKey);
  }, []);

  // Load history when user is ready
  useEffect(() => {
    if (session?.user?.id) {
      setHistory(loadHistory(session.user.id));
    }
  }, [session?.user?.id]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ai-chef-theme", next);
  };

  const saveCustomKey = (key) => {
    setCustomKey(key);
    localStorage.setItem("chefy-custom-api-key", key);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setRecipe(null);
    setExpiryData(null);
    setErrorMsg("");
    setExpiryError("");
    setStatusMsg("");
    setExpiryStatus("");
    setExpiryItems([]);
    setExpiryForm({ name: "", purchaseDate: "", quantity: "", type: "fresh" });
  };

  const handleFile = useCallback((file) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }
    setCurrentFile(file);
    setRecipe(null);
    setErrorMsg("");
    const reader = new FileReader();
    reader.onload = (e) => setPreviewSrc(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  // Remove uploaded image
  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setPreviewSrc(null);
    setCurrentFile(null);
    setRecipe(null);
    setErrorMsg("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  };

  const runStatusMessages = (messages, intervalMs = 900) => {
    let i = 0;
    setStatusMsg(messages[0]);
    const id = setInterval(() => {
      i = (i + 1) % messages.length;
      setStatusMsg(messages[i]);
    }, intervalMs);
    return () => clearInterval(id);
  };

  const runExpiryStatusMessages = (messages, intervalMs = 1100) => {
    let i = 0;
    setExpiryStatus(messages[0]);
    const id = setInterval(() => {
      i = (i + 1) % messages.length;
      setExpiryStatus(messages[i]);
    }, intervalMs);
    return () => clearInterval(id);
  };

  const handleGenerateImage = async () => {
    if (!currentFile || !previewSrc) return;
    setImageLoading(true);
    setRecipe(null);
    setErrorMsg("");
    const clearStatus = runStatusMessages(ANALYSIS_MESSAGES);
    try {
      const data = await fetchFromImageAPI(currentFile, customKey);
      setRecipe(data);
      setRecipeKey((k) => k + 1);
      if (session?.user?.id) {
        const updated = addToHistory(session.user.id, data, "📸 Image");
        setHistory(updated);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      clearStatus();
      setStatusMsg("");
      setImageLoading(false);
    }
  };

  const handleGenerateText = async () => {
    const textStr = ingredients.trim();
    if (!textStr) {
      alert("Please enter ingredients first.");
      return;
    }
    const ingredientsArr = textStr.split(",").map((i) => i.trim()).filter((i) => i);
    setTextLoading(true);
    setRecipe(null);
    setErrorMsg("");
    const clearStatus = runStatusMessages(TEXT_ANALYSIS_MESSAGES);
    try {
      const data = await fetchFromTextAPI(ingredientsArr, customKey);
      setRecipe(data);
      setRecipeKey((k) => k + 1);
      if (session?.user?.id) {
        const updated = addToHistory(session.user.id, data, "✍️ Text");
        setHistory(updated);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      clearStatus();
      setStatusMsg("");
      setTextLoading(false);
    }
  };

  const handleAddExpiryItem = () => {
    if (!expiryForm.name.trim()) {
      alert("Please enter an ingredient name.");
      return;
    }
    setExpiryItems((prev) => [...prev, { ...expiryForm, id: Date.now() }]);
    setExpiryForm({ name: "", purchaseDate: "", quantity: "", type: "fresh" });
  };

  const handleRemoveExpiryItem = (id) => {
    setExpiryItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCheckExpiry = async () => {
    if (expiryItems.length === 0) {
      alert("Please add at least one ingredient to check.");
      return;
    }
    setExpiryLoading(true);
    setExpiryData(null);
    setExpiryError("");
    setExpandedExpiry({});
    const clearStatus = runExpiryStatusMessages(EXPIRY_MESSAGES);
    try {
      const data = await fetchExpiryInfo(expiryItems, customKey);
      setExpiryData(data);
    } catch (error) {
      setExpiryError(error.message);
    } finally {
      clearStatus();
      setExpiryStatus("");
      setExpiryLoading(false);
    }
  };

  const toggleExpiryItem = (idx) => {
    setExpandedExpiry((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleViewHistoryRecipe = (entry) => {
    setRecipe(entry.recipe);
    setRecipeKey((k) => k + 1);
    setHistoryOpen(false);
    setErrorMsg("");
  };

  const handleClearHistory = () => {
    if (!session?.user?.id) return;
    saveHistory(session.user.id, []);
    setHistory([]);
  };

  useEffect(() => {
    if (recipe && recipeResultRef.current) {
      recipeResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [recipe, recipeKey]);

  useEffect(() => {
    if (expiryData && expiryResultRef.current) {
      expiryResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [expiryData]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loader-ring"></div>
        <p>Loading...</p>
      </div>
    );
  }

  const user = session?.user;
  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Dynamic Background Decor */}
      <div className="background-decor">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="floating-food f1">🍅</div>
        <div className="floating-food f2">🥦</div>
        <div className="floating-food f3">🥕</div>
        <div className="floating-food f4">🥑</div>
        <div className="floating-food f5">🍋</div>
        <div className="floating-food f6">🍓</div>
        <div className="floating-food f7">🍆</div>
        <div className="floating-food f8">🥗</div>
      </div>

      {/* Nav Bar */}
      <nav className="chef-nav">
        <Link href="/" className="chef-nav-logo">
          🍳 Chefy.AI
        </Link>

        <div className="chef-nav-right">
          <button className="chef-history-btn" onClick={() => setHistoryOpen(true)} title="View Recipe History">
            📖 History
            {history.length > 0 && <span className="history-badge">{history.length}</span>}
          </button>

          <button className="chef-history-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙️ Settings
          </button>

          <button className="theme-toggle chef-nav-toggle" aria-label="Toggle Dark/Light Mode" onClick={toggleTheme}>
            <span className="icon-sun">☀️</span>
            <span className="icon-moon">🌙</span>
          </button>

          <div className="user-menu-wrap">
            <button className="user-avatar-btn" onClick={() => setShowUserMenu((v) => !v)} title={user?.name}>
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt={user.name} className="user-avatar-img" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar-fallback">{user?.name?.[0]?.toUpperCase() || "U"}</span>
              )}
            </button>
            {showUserMenu && (
              <div className="user-dropdown">
                <div className="user-dropdown-info">
                  <p className="user-dropdown-name">{user?.name}</p>
                  <p className="user-dropdown-email">{user?.email}</p>
                </div>
                <button
                  className="user-dropdown-signout"
                  onClick={async () => {
                    setShowUserMenu(false);
                    await signOut({ redirect: false });
                    window.location.href = "/auth";
                  }}
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container">
        <header className="hero">
          <h1>Chefy<span className="text-gradient">.AI</span></h1>
          <p>From pixels to plates — extraordinary recipes crafted by AI, just for you.</p>
        </header>

        <section className="glass-panel main-panel">
          {/* Tab Controls */}
          <div className="tab-controls">
            <button
              id="tab-image"
              className={`tab-btn ${activeTab === "image-tab" ? "active" : ""}`}
              onClick={() => switchTab("image-tab")}
            >
              📸 Upload Image
            </button>
            <button
              id="tab-text"
              className={`tab-btn ${activeTab === "text-tab" ? "active" : ""}`}
              onClick={() => switchTab("text-tab")}
            >
              ✍️ Enter Ingredients
            </button>
            <button
              id="tab-expiry"
              className={`tab-btn ${activeTab === "expiry-tab" ? "active" : ""}`}
              onClick={() => switchTab("expiry-tab")}
            >
              📅 Expiry Checker
            </button>
          </div>

          {/* ── Image Tab ── */}
          <div className={`tab-content ${activeTab === "image-tab" ? "active" : ""}`}>
            <div
              className={`upload-area ${isDragOver ? "dragover" : ""}`}
              onClick={() => imageInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { if (e.target.files.length) handleFile(e.target.files[0]); }}
              />
              {!previewSrc && (
                <>
                  <div className="upload-icon">📸</div>
                  <h3>Drag &amp; Drop or Click to Upload</h3>
                  <p>Supported: JPG, PNG, WEBP</p>
                </>
              )}
              {previewSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt="Recipe Image Preview" className="image-preview" />
              )}

              {/* ── Remove Image Button ── */}
              {previewSrc && (
                <button
                  id="remove-image-btn"
                  className="remove-image-btn"
                  onClick={handleRemoveImage}
                  title="Remove image"
                  aria-label="Remove uploaded image"
                >
                  🗑️
                </button>
              )}
            </div>

            {imageLoading && statusMsg && <div className="status-banner">{statusMsg}</div>}

            <button
              id="generate-image-btn"
              className={`generate-btn ${imageLoading ? "loading" : ""}`}
              onClick={handleGenerateImage}
              disabled={!currentFile || imageLoading}
            >
              <span className="btn-text">✨ Generate Recipe</span>
              <div className="spinner"></div>
            </button>
          </div>

          {/* ── Text Tab ── */}
          <div className={`tab-content ${activeTab === "text-tab" ? "active" : ""}`}>
            <div className="input-area">
              <label htmlFor="ingredients-input">What&apos;s in your fridge?</label>
              <textarea
                id="ingredients-input"
                placeholder="e.g. chicken breast, garlic, olive oil, thyme, mushrooms..."
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
              />
            </div>

            {textLoading && statusMsg && <div className="status-banner">{statusMsg}</div>}

            <button
              id="generate-text-btn"
              className={`generate-btn ${textLoading ? "loading" : ""}`}
              onClick={handleGenerateText}
              disabled={textLoading}
            >
              <span className="btn-text">✨ Generate Recipe</span>
              <div className="spinner"></div>
            </button>
          </div>

          {/* ── Expiry Checker Tab ── */}
          <div className={`tab-content ${activeTab === "expiry-tab" ? "active" : ""}`}>
            <div className="expiry-hero">
              <div className="expiry-hero-icon">📅</div>
              <h2 className="expiry-hero-title">Ingredient Freshness Checker</h2>
              <p className="expiry-hero-desc">
                Add your ingredients with purchase details — our AI will calculate exactly how fresh they are and the best time to use them.
              </p>
            </div>

            {/* ── Add Ingredient Form ── */}
            <div className="expiry-form-card">
              <h3 className="expiry-form-title">➕ Add Ingredient</h3>
              <div className="expiry-form-grid">
                <div className="expiry-form-field">
                  <label className="expiry-form-label">Ingredient Name *</label>
                  <input
                    type="text"
                    className="expiry-form-input"
                    placeholder="e.g. Tomatoes, Chicken..."
                    value={expiryForm.name}
                    onChange={(e) => setExpiryForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAddExpiryItem()}
                  />
                </div>
                <div className="expiry-form-field">
                  <label className="expiry-form-label">📅 Date of Purchase</label>
                  <input
                    type="date"
                    className="expiry-form-input"
                    value={expiryForm.purchaseDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setExpiryForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                  />
                </div>
                <div className="expiry-form-field">
                  <label className="expiry-form-label">⚖️ Quantity</label>
                  <input
                    type="text"
                    className="expiry-form-input"
                    placeholder="e.g. 500g, 2 pieces, 1 litre"
                    value={expiryForm.quantity}
                    onChange={(e) => setExpiryForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div className="expiry-form-field">
                  <label className="expiry-form-label">🏷️ Type</label>
                  <select
                    className="expiry-form-input expiry-form-select"
                    value={expiryForm.type}
                    onChange={(e) => setExpiryForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="fresh">🌿 Fresh</option>
                    <option value="frozen">🧊 Frozen</option>
                    <option value="dried">🌾 Dried / Dehydrated</option>
                    <option value="canned">🥫 Canned / Packaged</option>
                    <option value="cooked">🍳 Cooked / Leftover</option>
                  </select>
                </div>
              </div>
              <button className="expiry-add-btn" onClick={handleAddExpiryItem}>
                ➕ Add to List
              </button>
            </div>

            {/* ── Added Ingredients List ── */}
            {expiryItems.length > 0 && (
              <div className="expiry-items-list">
                <div className="expiry-items-list-header">
                  <span>🧺 Your Ingredients <strong>({expiryItems.length})</strong></span>
                  <button className="expiry-clear-all-btn" onClick={() => setExpiryItems([])}>✕ Clear All</button>
                </div>
                {expiryItems.map((item) => (
                  <div key={item.id} className="expiry-item-row">
                    <div className="expiry-item-info">
                      <span className="expiry-item-name">{item.name}</span>
                      <div className="expiry-item-meta">
                        {item.purchaseDate && (
                          <span className="expiry-item-tag">📅 {new Date(item.purchaseDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        )}
                        {item.quantity && <span className="expiry-item-tag">⚖️ {item.quantity}</span>}
                        <span className={`expiry-item-type-badge type-${item.type}`}>
                          {item.type === "fresh" ? "🌿 Fresh"
                            : item.type === "frozen" ? "🧊 Frozen"
                            : item.type === "dried" ? "🌾 Dried"
                            : item.type === "canned" ? "🥫 Canned"
                            : "🍳 Cooked"}
                        </span>
                      </div>
                    </div>
                    <button
                      className="expiry-item-remove"
                      onClick={() => handleRemoveExpiryItem(item.id)}
                      title="Remove ingredient"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {expiryLoading && expiryStatus && <div className="status-banner">{expiryStatus}</div>}

            {expiryError && (
              <div className="error-card glass-panel" style={{ marginTop: "1rem" }}>
                <div className="error-icon">⚠️</div>
                <div className="error-body">
                  <h3>Could not fetch expiry info</h3>
                  <p>{expiryError}</p>
                  <button className="error-retry-btn" onClick={() => setExpiryError("")}>Dismiss</button>
                </div>
              </div>
            )}

            <button
              id="check-expiry-btn"
              className={`generate-btn expiry-btn ${expiryLoading ? "loading" : ""}`}
              onClick={handleCheckExpiry}
              disabled={expiryLoading || expiryItems.length === 0}
            >
              <span className="btn-text">🔍 Check Freshness</span>
              <div className="spinner"></div>
            </button>
          </div>
        </section>

        {/* ── Error Card ── */}
        {errorMsg && (
          <section className="error-card glass-panel">
            <div className="error-icon">⚠️</div>
            <div className="error-body">
              <h3>Could not generate recipe</h3>
              <p>{errorMsg}</p>
              <button className="error-retry-btn" onClick={() => setErrorMsg("")}>Dismiss</button>
            </div>
          </section>
        )}

        {/* ── Recipe Result ── */}
        {recipe && (
          <section key={recipeKey} ref={recipeResultRef} className="recipe-result glass-panel">
            <div className="result-header">
              <h2 className="recipe-title-shimmer">✨ {recipe.title} ✨</h2>
            </div>
            <div className="result-body">
              <div className="ingredients-list cascade-anim">
                <h3>Ingredients</h3>
                <ul>
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i}>{ing}</li>
                  ))}
                </ul>
              </div>
              <div className="instructions-list cascade-anim delay-1">
                <h3>Instructions</h3>
                <ol>
                  {recipe.instructions.map((inst, i) => (
                    <li key={i}>{inst}</li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Nutrition Section */}
            <NutritionCard nutrition={recipe.nutrition} />
          </section>
        )}

        {/* ── Expiry Result ── */}
        {expiryData && (
          <section ref={expiryResultRef} className="expiry-result glass-panel">
            <div className="result-header">
              <h2 className="recipe-title-shimmer">📅 Freshness Report</h2>
            </div>

            {expiryData.summary && (
              <div className="expiry-summary cascade-anim">
                <span className="expiry-summary-icon">💡</span>
                <p>{expiryData.summary}</p>
              </div>
            )}

            <div className="expiry-items-grid cascade-anim delay-1">
              {expiryData.items?.map((item, idx) => (
                <div key={idx} className={`expiry-card ${expandedExpiry[idx] ? "expanded" : ""}`}>
                  <div className="expiry-card-header" onClick={() => toggleExpiryItem(idx)}>
                    <div className="expiry-card-left">
                      <span className="expiry-cat-icon">{categoryIcon(item.category)}</span>
                      <div>
                        <h4 className="expiry-item-name">{item.name}</h4>
                        <span className="expiry-category">{item.category}</span>
                      </div>
                    </div>
                    <div className="expiry-card-right">
                      <UrgencyBadge urgency={item.urgency} />
                      <span className="expiry-chevron">{expandedExpiry[idx] ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedExpiry[idx] && (
                    <div className="expiry-card-body">
                      {/* Shelf life pills */}
                      <div className="shelf-life-row">
                        <div className="shelf-pill">
                          <span className="shelf-pill-icon">🌡️</span>
                          <div>
                            <span className="shelf-pill-label">Room Temp</span>
                            <span className="shelf-pill-val">{item.shelfLife?.roomTemp || "—"}</span>
                          </div>
                        </div>
                        <div className="shelf-pill">
                          <span className="shelf-pill-icon">❄️</span>
                          <div>
                            <span className="shelf-pill-label">Fridge</span>
                            <span className="shelf-pill-val">{item.shelfLife?.fridge || "—"}</span>
                          </div>
                        </div>
                        <div className="shelf-pill">
                          <span className="shelf-pill-icon">🧊</span>
                          <div>
                            <span className="shelf-pill-label">Freezer</span>
                            <span className="shelf-pill-val">{item.shelfLife?.freezer || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Remaining Life Banner */}
                      {item.remainingLife && (
                        <div className="expiry-remaining-row">
                          <span className="expiry-remaining-icon">⏳</span>
                          <span><strong>Time Remaining:</strong> {item.remainingLife}</span>
                        </div>
                      )}

                      {item.storageMethod && (
                        <div className="expiry-info-row">
                          <span className="expiry-info-icon">📦</span>
                          <div>
                            <strong>Storage:</strong> {item.storageMethod}
                          </div>
                        </div>
                      )}

                      {item.usageTip && (
                        <div className="expiry-info-row tip-row">
                          <span className="expiry-info-icon">✅</span>
                          <div>
                            <strong>Usage Tip:</strong> {item.usageTip}
                          </div>
                        </div>
                      )}

                      {item.spoilageSigns && item.spoilageSigns.length > 0 && (
                        <div className="spoilage-section">
                          <strong className="spoilage-title">⚠️ Signs of Spoilage:</strong>
                          <ul className="spoilage-list">
                            {item.spoilageSigns.map((sign, si) => (
                              <li key={si}>{sign}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── History Drawer ── */}
      {historyOpen && (
        <div className="history-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="history-drawer-header">
              <h2>📖 Recipe History</h2>
              <div className="history-header-actions">
                {history.length > 0 && (
                  <button className="history-clear-btn" onClick={handleClearHistory}>🗑️ Clear</button>
                )}
                <button className="history-close-btn" onClick={() => setHistoryOpen(false)}>✕</button>
              </div>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="history-empty">
                  <div className="history-empty-icon">🍽️</div>
                  <p>No recipes yet!</p>
                  <p className="history-empty-sub">Generate your first recipe to see it here.</p>
                </div>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="history-card">
                    <div className="history-card-top">
                      <span className="history-method-badge">{entry.method}</span>
                      <span className="history-date">{formatDate(entry.timestamp)}</span>
                    </div>
                    <h3 className="history-card-title">{entry.title}</h3>
                    <p className="history-card-meta">
                      {entry.recipe.ingredients.length} ingredients · {entry.recipe.instructions.length} steps
                    </p>
                    <button className="history-view-btn" onClick={() => handleViewHistoryRecipe(entry)}>
                      View Recipe →
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Drawer ── */}
      {settingsOpen && (
        <div className="history-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="history-drawer-header">
              <h2>⚙️ API Settings</h2>
              <div className="history-header-actions">
                <button className="history-close-btn" onClick={() => setSettingsOpen(false)}>✕</button>
              </div>
            </div>
            <div className="history-list" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Custom API Key</h3>
              <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Add your own key to bypass system quota limits. Both key types are supported:
              </p>
              <p style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                🟢 <strong>Groq</strong> (Recommended — FREE, 14,400 req/day): Get key at{" "}
                <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>console.groq.com</a>
              </p>
              <p style={{ marginBottom: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                🔵 <strong>Gemini</strong> (1,500 req/day): Get key at{" "}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>aistudio.google.com</a>
              </p>
              <div className="input-area" style={{ marginTop: 0 }}>
                <label htmlFor="custom-api-key">API Key</label>
                <input
                  id="custom-api-key"
                  type="password"
                  placeholder="gsk_... (Groq) or AIzaSy... (Gemini)"
                  value={customKey}
                  onChange={(e) => saveCustomKey(e.target.value)}
                  style={{
                    width: "100%", padding: "0.8rem", borderRadius: "12px",
                    border: "1px solid var(--border-color)", background: "var(--bg-card)",
                    color: "var(--text-primary)", outline: "none", fontSize: "0.9rem"
                  }}
                />
              </div>
              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="generate-btn"
                  style={{ width: "auto", padding: "0.8rem 1.5rem", borderRadius: "10px", fontSize: "0.9rem" }}
                  onClick={() => setSettingsOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUserMenu && (
        <div className="menu-backdrop" onClick={() => setShowUserMenu(false)} />
      )}
    </>
  );
}
