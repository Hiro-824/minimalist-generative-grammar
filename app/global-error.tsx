"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          background: "#fff",
          color: "#181816",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
          <title>Merge Lab — Error</title>
          <h1 style={{ margin: "0 0 12px", fontSize: 28 }}>
            Merge Lab could not load
          </h1>
          <p style={{ margin: "0 0 24px", color: "#6f6d67" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              minHeight: 44,
              padding: "0 18px",
              border: 0,
              borderRadius: 8,
              background: "#181816",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
