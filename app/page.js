"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

const features = [
  {
    icon: "📸",
    title: "Snap & Cook",
    desc: "Upload a photo of your ingredients and our AI instantly crafts the perfect recipe tailored to what you have.",
  },
  {
    icon: "✍️",
    title: "Type & Discover",
    desc: "List your ingredients and let the AI suggest delicious, creative dishes you'd never have thought of.",
  },
  {
    icon: "📅",
    title: "Expiry Checker",
    desc: "Add your ingredients with purchase dates and let AI calculate exactly how fresh they are with storage tips.",
  },
  {
    icon: "🗓️",
    title: "AI Meal Planner",
    desc: "Get a personalised weekly meal plan with breakfast, lunch & dinner — balanced for your dietary preference.",
  },
];

const steps = [
  { num: "01", title: "Sign In", desc: "Sign in with Google to access your personal cooking space and save recipes." },
  { num: "02", title: "Choose Your Method", desc: "Upload a food photo, type ingredients, check freshness, or plan your week." },
  { num: "03", title: "AI Analyzes", desc: "Our AI vision & language model processes your input in seconds." },
  { num: "04", title: "Get Results", desc: "Receive full recipes with nutrition, freshness reports, or a weekly meal plan." },
];

export default function LandingPage() {
  const [theme, setTheme] = useState("dark");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("ai-chef-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved ? saved : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ai-chef-theme", next);
  };

  const handleMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 20,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 20,
    });
  };

  return (
    <>
      {/* Ambient background */}
      <div className={styles.ambientBg}>
        <div className={styles.orb1}></div>
        <div className={styles.orb2}></div>
        <div className={styles.orb3}></div>
      </div>

      {/* Floating foods */}
      <div className={styles.floatingFoods} aria-hidden="true">
        {["🍅","🥦","🥕","🥑","🍋","🍓","🍆","🥗","🧄","🫑"].map((f, i) => (
          <span key={i} className={`${styles.foodItem} ${styles[`fi${i}`]}`}>{f}</span>
        ))}
      </div>

      {/* ─── Navbar ─── */}
      <nav className={styles.navbar}>
        <div className={styles.navLogo}>
          <span className={styles.logoIcon}>🍳</span>
          <span className={styles.logoText}>AI <strong>Chef</strong></span>
        </div>
        <div className={styles.navRight}>
          <Link href="/chef" className={styles.navCta}>
            Launch App →
          </Link>
          <button className={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section
        className={styles.hero}
        ref={heroRef}
        onMouseMove={handleMouseMove}
      >
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>✨ Powered by AI Vision</div>
          <h1 className={styles.heroTitle}>
            Turn Ingredients Into
            <br />
            <span className={styles.gradientText}>Culinary Masterpieces</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Snap a photo or list your ingredients — Chefy.AI crafts stunning,
            personalized recipes, checks your food freshness, and plans your full week's meals. Never waste groceries again.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/chef" className={styles.primaryCta}>
              🚀 Start Cooking Now
            </Link>
            <a href="#how-it-works" className={styles.secondaryCta}>
              See How It Works ↓
            </a>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}><span className={styles.statNum}>4</span><span className={styles.statLabel}>AI Features</span></div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}><span className={styles.statNum}>⚡</span><span className={styles.statLabel}>Instant Results</span></div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}><span className={styles.statNum}>AI</span><span className={styles.statLabel}>Powered</span></div>
          </div>
        </div>

        {/* Floating mock card */}
        <div
          className={styles.heroVisual}
          style={{ transform: `perspective(1000px) rotateX(${-mousePos.y * 0.3}deg) rotateY(${mousePos.x * 0.3}deg)` }}
        >
          <div className={styles.mockCard}>
            <div className={styles.mockCardHeader}>
              <div className={styles.mockDots}>
                <span></span><span></span><span></span>
              </div>
              <span className={styles.mockTitle}>AI Chef App</span>
            </div>
            <div className={styles.mockUpload}>
              <div className={styles.mockUploadIcon}>📸</div>
              <p>Drop your food photo here</p>
            </div>
            <div className={styles.mockTabs}>
              <span className={styles.mockTabActive}>Upload Image</span>
              <span className={styles.mockTabInactive}>Ingredients</span>
            </div>
            <div className={styles.mockRecipePreview}>
              <div className={styles.mockRecipeTitle}>✨ Garlic Butter Chicken ✨</div>
              <div className={styles.mockIngredients}>
                <div className={styles.mockIngTag}>🍗 Chicken</div>
                <div className={styles.mockIngTag}>🧄 Garlic</div>
                <div className={styles.mockIngTag}>🧈 Butter</div>
              </div>
            </div>
            <div className={styles.mockBtn}>Generate Recipe</div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Features</span>
          <h2 className={styles.sectionTitle}>Everything You Need to Cook Smarter</h2>
          <p className={styles.sectionSubtitle}>From photo analysis to ingredient parsing, AI Chef does the heavy lifting.</p>
        </div>
        <div className={styles.featuresGrid}>
          {features.map((f, i) => (
            <div key={i} className={styles.featureCard}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className={styles.howSection} id="how-it-works">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Process</span>
          <h2 className={styles.sectionTitle}>Three Steps to Your Perfect Dish</h2>
        </div>
        <div className={styles.stepsRow}>
          {steps.map((s, i) => (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepNum}>{s.num}</div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
              {i < steps.length - 1 && <div className={styles.stepArrow}>→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <div className={styles.ctaEmoji}>🍽️</div>
          <h2 className={styles.ctaTitle}>Ready to Cook with AI?</h2>
          <p className={styles.ctaSubtitle}>
            Don&apos;t let your groceries go to waste. Discover incredible recipes instantly.
          </p>
          <Link href="/chef" className={styles.primaryCta}>
            🚀 Open AI Chef
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className={styles.footer}>
        <span>🍳 Chefy.AI — AI-Powered Cooking · Recipes · Meal Planning · Freshness Checking</span>
      </footer>
    </>
  );
}
