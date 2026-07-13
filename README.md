# Lintas

<img width="750" height="1334" alt="localhost_5173_(iPhone SE)" src="https://github.com/user-attachments/assets/d7facd70-39ee-47f9-807b-0a4a74e1aae1" />


Lintas is a mobile web bridge application that lets a crypto holder scan any standard Indonesian QRIS code, pay with Stellar assets (USDC/XLM) from a Freighter wallet, and settle the payment in real IDR to the merchant, all in a single flow.

---

## Architectural 

To settle payments to merchants without requiring a multi-billion IDR Penyelenggara Jasa Pembayaran (PJP) Kategori 1 license from Bank Indonesia (required to pay dynamic QRIS rails directly):

```
[User Wallet (Freighter)]
       │ (Stellar USDC/XLM Payment)
       ▼
[Bridge Holding/Escrow Address]
       │ (On-Chain Detection → Anchor Off-ramp)
       ▼
[Bridge Backend Engine]
       │ (Trigger Fiat Disbursement)
       ▼
[Mayar Checkout Invoice API]
       │ (Real-Time IDR Settlement via QRIS/E-Wallet)
       ▼
[Merchant Bank Account / E-Wallet]
```

### Why this approach?
1. **Low Compliance Barrier** — bypasses the need for a direct QRIS issuing/acquiring license.
2. **Direct Bank Settlement** — merchants receive real IDR without registering on any crypto platform.
3. **Broad Compatibility** — works with any standard QRIS code (GoPay, ShopeePay, OVO, bank-issued QRIS).

---

## Features — 5-Tab Mobile Wallet UI

| Tab | Description |
|---|---|
| **Home** | Freighter wallet balance (USDC/XLM), real-time IDR/USD estimates, live exchange rates, and "Ready to pay?" quick-scan shortcut. |
| **Tokens** | Multi-asset token balance list (USDC, XLM) with live rate cards and asset details. |
| **Scan** *(center button)* | Direct camera QRIS scanner. Supports Gallery upload (scan from image) and My QR Code (generate personal receive QR with optional IDR/USD amount). |
| **History** | Transaction history grouped by Network Environment (Testnet / Mainnet). Shows merchant name, city, Ref ID, status badge, and IDR/USD amount. |
| **Profile** | Freighter wallet connect/disconnect, Network Environment (auto-synced from Freighter), Display Currency selection (IDR/USD). |

---

## Payment Flow (On-Chain → Fiat)

1. User scans a QRIS code with the camera or uploads an image from the gallery.
2. App parses the QRIS payload and extracts merchant name, city, and IDR amount.
3. App fetches a live crypto quote (USDC or XLM equivalent) using CoinGecko rates.
4. User confirms and signs the Stellar payment transaction via Freighter.
5. Bridge engine executes the on-chain asset redemption to the Stellar anchor address.
6. App creates a Mayar settlement invoice for the IDR amount.
7. Merchant (or demo judge) pays the Mayar QRIS/e-wallet checkout link to simulate IDR settlement.
8. App polls Mayar API for confirmation and transitions to `SETTLED` status (green).

---

## Invoice Status Flow

```
SCANNED → QUOTED → PAYMENT_PENDING → PAYMENT_CONFIRMED
       → ANCHOR_PROCESSING → PAYOUT_PROCESSING
       → SETTLEMENT_PENDING → SETTLED (or FAILED)
```

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Frontend** | React + Vite (TypeScript) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`), primary color `#01AED6` |
| **Wallet** | Freighter API (`@stellar/freighter-api`) + Stellar SDK |
| **QR Scanning** | `html5-qrcode` (camera + gallery file scan) |
| **Payment Processor** | Mayar Invoice/Checkout API (sandbox + production) |
| **Exchange Rates** | Frankfurter API (USD/IDR), CoinGecko (USDC/XLM rates) |
| **Network** | Stellar Testnet / Mainnet (auto-synced from Freighter wallet) |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the following:

```env
VITE_MAYAR_API_KEY=your_mayar_api_key_here
VITE_STELLAR_SECRET_KEY=your_bridge_stellar_secret_key_here
```

---

## Setup & Running

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy and fill environment variables:
   ```bash
   cp .env.example .env
   ```

3. Run the development server:
   ```bash
   pnpm dev
   ```

4. Build for production:
   ```bash
   pnpm build
   ```

---

## Network Environment

The active Stellar network (Testnet or Mainnet) is **automatically synced from the connected Freighter wallet** — no manual toggle needed. Switching networks inside the Freighter extension automatically updates:
- Horizon RPC endpoints and balance fetching
- Mayar API environment (`sandbox` ↔ `production`)
- Transaction History filtering (each transaction is tagged with its network at scan time)

---

## Hackathon Submission Q&A

### What is your Problem Statement?
Crypto holders in Indonesia cannot spend their on-chain assets at real merchants. Indonesian retail commerce runs almost entirely on QRIS — a QR-based payment standard managed by regulated payment service providers. There is no native bridge between a Stellar wallet and a QRIS merchant point of sale. Users who hold USDC or XLM must manually off-ramp to IDR through an exchange before they can pay at any local merchant, which is slow, costly, and friction-heavy.

### Proposed Solution
Lintas is a mobile web bridge that lets a user scan any Indonesian QRIS code with their phone, pay in Stellar USDC or XLM through their Freighter wallet, and automatically settle the payment in IDR to the merchant — a licensed local payment provider. The app handles the full flow: QR parsing → live crypto quote → Stellar on-chain payment → anchor off-ramp → Mayar IDR settlement invoice → polling for confirmation. The merchant does not need to know anything about crypto; they simply receive IDR in their existing account.

### Target Users / Audience
**Primary:**
- Crypto-native users and Stellar ecosystem participants in Indonesia who hold USDC or XLM and want to spend them at local merchants without manually cashing out.
- Hackathon judges and demo audiences evaluating real-world utility of Stellar for consumer payments.

**Secondary:**
- Indonesian fintech developers exploring QRIS + blockchain payment architecture.
- Businesses or wallets interested in building a crypto-to-fiat payments layer on Stellar for the Indonesian market.


### Expected Stellar Integration
- **Freighter Wallet** — wallet connection, address resolution, and transaction signing.
- **Stellar SDK + Horizon** — building, signing, and submitting on-chain USDC/XLM payment transactions; real-time balance fetching.
- **USDC on Stellar (SAC)** — primary stablecoin payment asset alongside native XLM on Testnet.
- **Anchor Off-ramp Pattern** — after on-chain payment, the bridge executes a real Stellar transaction (USDC burned to issuer or XLM transferred to off-ramp address), producing a real tx hash before fiat settlement is triggered.
- **Testnet / Mainnet** — both environments supported, auto-synced from the Freighter wallet network setting.

### Track
**Payment & Consumer Applications**

Lintas directly addresses consumer-facing payments: a Stellar-powered QRIS wallet that enables crypto holders to pay at any Indonesian retail merchant and settle in local fiat (IDR) through a licensed payment provider — no exchange required, no manual off-ramp, no merchant-side changes needed.

