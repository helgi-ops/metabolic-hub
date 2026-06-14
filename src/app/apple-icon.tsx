import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon (Add to Home Screen).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f97316",
          color: "#0a0a0a",
          fontSize: 124,
          fontWeight: 700,
          fontFamily: "monospace",
        }}
      >
        M
      </div>
    ),
    { ...size },
  );
}
