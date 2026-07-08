import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1a4731",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "36px",
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: "68px",
            fontWeight: 800,
            fontFamily: "sans-serif",
            letterSpacing: "-3px",
          }}
        >
          AF
        </span>
      </div>
    ),
    size
  );
}
