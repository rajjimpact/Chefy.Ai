"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/chef");
    }
  }, [status, router]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/chef" });
  };

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loader-ring"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <>
      {/* Ambient background */}
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1"></div>
        <div className="auth-orb auth-orb-2"></div>
        <div className="auth-orb auth-orb-3"></div>
      </div>

      {/* Floating food emojis */}
      <div className="auth-floating-foods" aria-hidden="true">
        {["🍅","🥦","🥕","🥑","🍋","🍓","🍆","🥗","🧄","🫑","🍳","🥘"].map((f, i) => (
          <span key={i} className={`auth-fi auth-fi-${i}`}>{f}</span>
        ))}
      </div>

      <main className="auth-container">
        <div className="auth-card">
          {/* Logo */}
          <div className="auth-logo">
            <span className="auth-logo-icon">🍳</span>
            <span className="auth-logo-text">Chefy<span className="auth-logo-dot">.AI</span></span>
          </div>

          <h1 className="auth-title">Welcome Back, Chef!</h1>
          <p className="auth-subtitle">Sign in to generate AI recipes & access your cooking history.</p>

          {/* Features teaser */}
          <div className="auth-features">
            <div className="auth-feature-chip">📸 Snap & Cook</div>
            <div className="auth-feature-chip">✍️ Type & Discover</div>
            <div className="auth-feature-chip">📖 Recipe History</div>
          </div>

          {/* Google Sign In Button */}
          <button
            id="google-signin-btn"
            className={`auth-google-btn ${loading ? "loading" : ""}`}
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              <div className="auth-btn-spinner"></div>
            ) : (
              <>
                <svg className="auth-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <p className="auth-disclaimer">
            By signing in, you agree to our{" "}
            <span className="auth-link">Terms of Service</span> and{" "}
            <span className="auth-link">Privacy Policy</span>.
          </p>
        </div>
      </main>
    </>
  );
}
