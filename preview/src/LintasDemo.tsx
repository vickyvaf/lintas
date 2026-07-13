import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Video,
  staticFile,
} from "remotion";
import React from "react";

// Slide configuration matching DEMO_VOICEOVER.md
const scenes = [
  {
    title: "1. INTRODUCTION",
    subtitle: "LINTAS",
    desc: "Seamless Crypto-to-QRIS Merchant Bridge on Stellar. Connecting On-Chain Assets to Real-World Retail Payments.",
    videoPlaceholder: "Place Scene 1 Intro / Setup Clip Here",
    videoFile: "scene1.mp4",
  },
  {
    title: "2. HOME & WALLET SYNC",
    subtitle: "Freighter Wallet Interop",
    desc: "Real-time balances of USDC and XLM. Auto-sync active network (Testnet/Mainnet) and preferred display currency (IDR/USD).",
    videoPlaceholder: "Place Wallet Connect & Balance Sync Clip Here",
    videoFile: "scene2.mp4",
  },
  {
    title: "3. DYNAMIC SCANNING",
    subtitle: "Real-Time QRIS Parser",
    desc: "Scan standard QRIS codes instantly. Lintas extracts invoice metadata and locks rates using the live exchange quote engine.",
    videoPlaceholder: "Place QRIS Scan & Nominal Quote Clip Here",
    videoFile: "scene3.mp4",
  },
  {
    title: "4. GALLERY & MY QR",
    subtitle: "Flexible Payment Options",
    desc: "Upload QRIS invoice images from your gallery. Generate personal receive QR code with optional IDR/USD amount requests.",
    videoPlaceholder: "Place Gallery Upload & Receive QR Clip Here",
    videoFile: "scene4.mp4",
  },
  {
    title: "5. STELLAR ESCROW",
    subtitle: "Anchor Off-ramp Redemptions",
    desc: "Freighter wallet signs the payment on-chain. Bridge engine executes the anchor off-ramp redemption with memo tracking.",
    videoPlaceholder: "Place freighter signing & anchor burn transaction clip here",
    videoFile: "scene5.mp4",
  },
  {
    title: "6. FIAT SETTLEMENT",
    subtitle: "Payment Polling & Success",
    desc: "Automatic creation of Mayar payment checkout link. Status polls every 5 seconds, settling IDR directly to merchant bank accounts.",
    videoPlaceholder: "Place Mayar payment checkout & green success status clip here",
    videoFile: "scene6.mp4",
  },
  {
    title: "7. HISTORY LOGS",
    subtitle: "Network Isolation",
    desc: "All transactions are recorded with their network origin. History tab filters data based on active wallet network environment.",
    videoPlaceholder: "Place History tab & mainnet/testnet filter clip here",
    videoFile: "scene7.mp4",
  },
];

interface SceneCardProps {
  title: string;
  subtitle: string;
  desc: string;
  videoPlaceholder: string;
  videoFile: string;
  index: number;
}

const SceneCard: React.FC<SceneCardProps> = ({
  title,
  subtitle,
  desc,
  videoPlaceholder,
  videoFile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animations
  const slideProgress = spring({
    frame,
    fps,
    config: { damping: 15 },
  });

  const xOffset = interpolate(slideProgress, [0, 1], [-100, 0]);
  const opacity = interpolate(slideProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "row", backgroundColor: "#0f172a" }}>
      {/* Left side: Slide Info & Pitch Details */}
      <div
        style={{
          width: "50%",
          padding: "60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          color: "white",
          transform: `translateX(${xOffset}px)`,
          opacity,
        }}
      >
        <span style={{ color: "#01AED6", fontSize: "1.2rem", fontWeight: "bold", letterSpacing: "1px", marginBottom: "10px" }}>
          {title}
        </span>
        <h1 style={{ fontSize: "3rem", margin: "0 0 20px 0", fontWeight: 800, lineHeight: 1.1 }}>
          {subtitle}
        </h1>
        <p style={{ fontSize: "1.4rem", color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
          {desc}
        </p>

        {/* Brand Accent Segment */}
        <div style={{ marginTop: "40px", display: "flex", gap: "10px" }}>
          <div style={{ width: "30px", height: "4px", backgroundColor: "#01AED6", borderRadius: "2px" }} />
          <div style={{ width: "10px", height: "4px", backgroundColor: "#334155", borderRadius: "2px" }} />
          <div style={{ width: "10px", height: "4px", backgroundColor: "#334155", borderRadius: "2px" }} />
        </div>
      </div>

      {/* Right side: iPhone Mockup Container */}
      <div
        style={{
          width: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#090d16",
        }}
      >
        {/* iPhone Shell Wrapper */}
        <div
          style={{
            width: "320px",
            height: "640px",
            borderRadius: "40px",
            border: "8px solid #1e293b",
            backgroundColor: "#000",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Dynamic Video Element or Placeholder card */}
          {videoFile ? (
            <AbsoluteFill style={{ backgroundColor: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Video
                src={staticFile(videoFile)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={() => console.log(`Video file ${videoFile} not found in public/ directory. Displaying placeholder.`)}
                startFrom={0}
              />
              {/* Fallback Label if file is missing */}
              <div
                style={{
                  position: "absolute",
                  padding: "20px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "0.85rem",
                  fontWeight: "bold",
                  pointerEvents: "none",
                }}
              >
                {videoPlaceholder}
                <span style={{ display: "block", fontSize: "0.7rem", color: "#475569", marginTop: "10px" }}>
                  (Add "{videoFile}" to public/ to replace)
                </span>
              </div>
            </AbsoluteFill>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                textAlign: "center",
                padding: "20px",
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              {videoPlaceholder}
            </div>
          )}

          {/* iPhone Top Camera Cutout Notch */}
          <div
            style={{
              position: "absolute",
              top: "0",
              left: "50%",
              transform: "translateX(-50%)",
              width: "120px",
              height: "22px",
              backgroundColor: "#1e293b",
              borderBottomLeftRadius: "15px",
              borderBottomRightRadius: "15px",
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LintasDemo: React.FC = () => {
  const fps = 30;
  const framesPerScene = 15 * fps; // 15 seconds per scene

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      {scenes.map((scene, idx) => (
        <Sequence
          key={idx}
          from={idx * framesPerScene}
          durationInFrames={framesPerScene}
        >
          <SceneCard
            title={scene.title}
            subtitle={scene.subtitle}
            desc={scene.desc}
            videoPlaceholder={scene.videoPlaceholder}
            videoFile={scene.videoFile}
            index={idx}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
