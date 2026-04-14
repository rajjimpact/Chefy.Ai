"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const API_BASE = "/api/recipe";
const MAX_HISTORY = 10;

async function fetchFromImageAPI(file, customKey) {
  const formData = new FormData();
  formData.append("file", file);
  
  const headers = {};
  if (customKey) headers["x-custom-gemini-key"] = customKey;

  const response = await fetch(`${API_BASE}/from-image`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(30000),
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

  const imageInputRef = useRef(null);
  const recipeResultRef = useRef(null);

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
    setErrorMsg("");
    setStatusMsg("");
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

  // Show loading screen while checking auth
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
          {/* History Button */}
          <button
            className="chef-history-btn"
            onClick={() => setHistoryOpen(true)}
            title="View Recipe History"
          >
            📖 History
            {history.length > 0 && (
              <span className="history-badge">{history.length}</span>
            )}
          </button>

          {/* Settings Button */}
          <button
            className="chef-history-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙️ Settings
          </button>

          {/* Theme Toggle */}
          <button
            className="theme-toggle chef-nav-toggle"
            aria-label="Toggle Dark/Light Mode"
            onClick={toggleTheme}
          >
            <span className="icon-sun">☀️</span>
            <span className="icon-moon">🌙</span>
          </button>

          {/* User Avatar / Menu */}
          <div className="user-menu-wrap">
            <button
              className="user-avatar-btn"
              onClick={() => setShowUserMenu((v) => !v)}
              title={user?.name}
            >
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt={user.name} className="user-avatar-img" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar-fallback">
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </span>
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
                  onClick={() => signOut({ callbackUrl: "/auth" })}
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
          <h1>
            Chefy<span className="text-gradient">.AI</span>
          </h1>
          <p>From pixels to plates — extraordinary recipes crafted by AI, just for you.</p>
        </header>

        <section className="glass-panel main-panel">
          {/* Tab Controls */}
          <div className="tab-controls">
            <button
              className={`tab-btn ${activeTab === "image-tab" ? "active" : ""}`}
              onClick={() => switchTab("image-tab")}
            >
              📸 Upload Image
            </button>
            <button
              className={`tab-btn ${activeTab === "text-tab" ? "active" : ""}`}
              onClick={() => switchTab("text-tab")}
            >
              ✍️ Enter Ingredients
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
            </div>

            {imageLoading && statusMsg && (
              <div className="status-banner">{statusMsg}</div>
            )}

            <button
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

            {textLoading && statusMsg && (
              <div className="status-banner">{statusMsg}</div>
            )}

            <button
              className={`generate-btn ${textLoading ? "loading" : ""}`}
              onClick={handleGenerateText}
              disabled={textLoading}
            >
              <span className="btn-text">✨ Generate Recipe</span>
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
              <button className="error-retry-btn" onClick={() => setErrorMsg("")}>
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* ── Recipe Result ── */}
        {recipe && (
          <section
            key={recipeKey}
            ref={recipeResultRef}
            className="recipe-result glass-panel"
          >
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
                  <button className="history-clear-btn" onClick={handleClearHistory}>
                    🗑️ Clear
                  </button>
                )}
                <button className="history-close-btn" onClick={() => setHistoryOpen(false)}>
                  ✕
                </button>
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
                    <button
                      className="history-view-btn"
                      onClick={() => handleViewHistoryRecipe(entry)}
                    >
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
                <button className="history-close-btn" onClick={() => setSettingsOpen(false)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="history-list" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Custom Gemini API Key</h3>
              <p style={{ marginBottom: "1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Add your own API key to bypass system quotas. Your key will be saved locally in your browser and sent securely to generate recipes.
              </p>
              
              <div className="input-area" style={{ marginTop: 0 }}>
                <label htmlFor="custom-api-key">API Key</label>
                <input
                  id="custom-api-key"
                  type="password"
                  placeholder="AIzaSy..."
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

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div className="menu-backdrop" onClick={() => setShowUserMenu(false)} />
      )}
    </>
  );
}
