import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("size");
  const size = raw === "192" ? 192 : 512;
  const radius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.34);

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
          borderRadius: `${radius}px`,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            fontFamily: "sans-serif",
            letterSpacing: "-4px",
          }}
        >
          AF
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
