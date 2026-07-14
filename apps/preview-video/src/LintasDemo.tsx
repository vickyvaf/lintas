import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Video,
  Audio,
  staticFile,
} from "remotion";
import React from "react";

// Slide configuration matching DEMO_VOICEOVER.md
export const scenes = [
  {
    title: "1. INTRODUCTION",
    subtitle: "LINTAS",
    desc: "Seamless Crypto-to-QRIS Merchant Bridge on Stellar. Connecting On-Chain Assets to Real-World Retail Payments.",
    placeholder: "Place Scene 1 Intro / Setup Image Here",
    mediaFile: "1-introduction.png",
    audioFile: "1.mp3",
    durationFrames: 453,
  },
  {
    title: "2. HOME & WALLET SYNC",
    subtitle: "Freighter Wallet Interop",
    desc: "Real-time balances of USDC and XLM. Auto-sync active network (Testnet/Mainnet) and preferred display currency (IDR/USD).",
    placeholder: "Place Wallet Connect & Balance Sync Image Here",
    mediaFile: "2-freighter-wallet-interop.png",
    audioFile: "2.mp3",
    durationFrames: 762,
  },
  {
    title: "3. DYNAMIC SCANNING",
    subtitle: "Real-Time QRIS Parser",
    desc: "Scan standard QRIS codes instantly. Lintas extracts invoice metadata and locks rates using the live exchange quote engine.",
    placeholder: "Place QRIS Scan & Nominal Quote Image Here",
    mediaFile: "3-dynamic-scanning.png",
    audioFile: "3.mp3",
    durationFrames: 495,
  },
  {
    title: "4. GALLERY & MY QR",
    subtitle: "Flexible Payment Options",
    desc: "Upload QRIS invoice images from your gallery. Generate personal receive QR code with optional IDR/USD amount requests.",
    placeholder: "Place Gallery Upload & Receive QR Image Here",
    mediaFile: "4-flexible-payment-options.png",
    audioFile: "4.mp3",
    durationFrames: 522,
  },
  {
    title: "5. STELLAR ESCROW",
    subtitle: "Anchor Off-ramp Redemptions",
    desc: "Freighter wallet signs the payment on-chain. Bridge engine executes the anchor off-ramp redemption with memo tracking.",
    placeholder: "Place freighter signing & anchor burn transaction video clip here",
    mediaFile: "5-stellar-escrow.png",
    audioFile: "5.mp3",
    durationFrames: 493,
  },
  {
    title: "6. FIAT SETTLEMENT",
    subtitle: "Payment Polling & Success",
    desc: "Automatic creation of Mayar payment checkout link. Status polls every 5 seconds, settling IDR directly to merchant bank accounts.",
    placeholder: "Place Mayar payment checkout & green success status video clip here",
    mediaFile: "6-fiat-settlement.png",
    audioFile: "6.mp3",
    durationFrames: 502,
  },
  {
    title: "7. HISTORY LOGS",
    subtitle: "Network Isolation",
    desc: "All transactions are recorded with their network origin. History tab filters data based on active wallet network environment.",
    placeholder: "Place History tab & mainnet/testnet filter Image Here",
    mediaFile: "7-network-isolation.png",
    audioFile: "7.mp3",
    durationFrames: 716,
  },
];

export const LintasDemoDuration = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

interface SceneCardProps {
  title: string;
  subtitle: string;
  desc: string;
  placeholder: string;
  mediaFile: string;
  audioFile?: string;
  index: number;
}

const SceneCard: React.FC<SceneCardProps> = ({
  title,
  subtitle,
  desc,
  placeholder,
  mediaFile,
  audioFile,
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

  const isVideo = mediaFile?.toLowerCase().endsWith(".mp4") || mediaFile?.toLowerCase().endsWith(".webm");

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "row", backgroundColor: "#0f172a" }}>
      {audioFile && <Audio src={staticFile(audioFile)} />}
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
            width: "460px",
            height: "820px",
            borderRadius: "44px",
            border: "8px solid #1e293b",
            backgroundColor: "#000",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Dynamic Video or Image Element or Placeholder card */}
          {mediaFile ? (
            <AbsoluteFill style={{ backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isVideo ? (
                <Video
                  src={staticFile(mediaFile)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  onError={() => console.log(`Video file ${mediaFile} not found in public/ directory.`)}
                  startFrom={0}
                />
              ) : (
                <img
                  src={staticFile(mediaFile)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    console.log(`Image file ${mediaFile} not found in public/ directory.`);
                  }}
                />
              )}
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
              {placeholder}
            </div>
          )}

          {/* iPhone Top Camera Cutout Notch */}
          <div
            style={{
              position: "absolute",
              top: "0",
              left: "50%",
              transform: "translateX(-50%)",
              width: "160px",
              height: "26px",
              backgroundColor: "#1e293b",
              borderBottomLeftRadius: "18px",
              borderBottomRightRadius: "18px",
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LintasDemo: React.FC = () => {
  let currentStartFrame = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      <Audio src={staticFile("backsound.mp3")} volume={0.1} loop />
      {scenes.map((scene, idx) => {
        const startFrame = currentStartFrame;
        currentStartFrame += scene.durationFrames;

        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={scene.durationFrames}
          >
            <SceneCard
              title={scene.title}
              subtitle={scene.subtitle}
              desc={scene.desc}
              placeholder={scene.placeholder}
              mediaFile={scene.mediaFile}
              audioFile={scene.audioFile}
              index={idx}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
