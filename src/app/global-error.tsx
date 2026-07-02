"use client";

/**
 * Global error boundary (P1-UX-1).
 *
 * Catches errors that escape the root layout itself (e.g. a throw in
 * layout.tsx). Per Next.js convention, this MUST include its own <html>
 * and <body> tags because the root layout is bypassed when this renders.
 */
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fff",
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            border: "1px solid rgba(220, 38, 38, 0.3)",
            background: "rgba(220, 38, 38, 0.05)",
            borderRadius: "0.5rem",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            textAlign: "center",
          }}
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle size={40} color="#dc2626" aria-hidden="true" />
          <div>
            <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
              Une erreur inattendue est survenue
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              L&apos;application a rencontré un problème. Veuillez réessayer.
            </p>
          </div>
          {error.digest ? (
            <p
              style={{
                fontSize: "0.625rem",
                fontFamily: "monospace",
                color: "#999",
                margin: 0,
              }}
            >
              Réf. {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              minHeight: "44px",
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
