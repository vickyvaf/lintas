# PRD — Lintas

## Overview
Lintas is a mobile web bridge application that lets a crypto-native user scan any standard Indonesian QRIS merchant code, pay with Stellar on-chain assets (USDC/XLM) using a Freighter wallet, and settle the transaction in IDR to the merchant through Mayar — all in a single, end-to-end flow.

The goal is not to become a native QRIS issuer or production payment processor. The goal is to demonstrate a believable, regulation-compatible end-to-end merchant payment flow where crypto funds the transaction and the merchant receives a fiat settlement path through an existing licensed payment provider (Mayar).

---

## Product Goal
Build a production-demo application that proves three things:
- QRIS can be used as the invoice and merchant acceptance layer without modification.
- Stellar can be used as the user payment rail and anchor-compatible asset layer.
- Mayar can be used as the local payout/disbursement layer after fiat settlement is available off-chain.

---

## Problem
Crypto-native users may hold stable assets on-chain, but small merchants in Indonesia typically accept QRIS and expect IDR settlement through local payment rails. Existing QRIS merchants are served by regulated PSPs and acquirers, so a Stellar wallet alone does not natively become a QRIS payment app without an additional bridge layer.

---

## Product Concept
The app acts as a bridge between three systems:
- **QRIS** — merchant-facing invoice format.
- **Stellar** — payer asset rail (USDC/XLM).
- **Mayar** — local fiat payout and merchant settlement.

The merchant still thinks in IDR, the payer pays in crypto, and the app orchestrates reconciliation and settlement automatically.

---

## Target Users

### Primary
- Crypto holders who want to pay a local Indonesian merchant without manually cashing out first.
- Demo merchants or hackathon judges who want to see a realistic merchant settlement flow.

### Secondary
- Developers exploring QRIS + blockchain payment architecture.
- Stellar ecosystem builders looking for local utility and composability examples.

---

## User Flow
1. Merchant displays a QRIS code with an invoice amount in IDR.
2. User scans the QR using the Scan tab (camera, gallery upload, or My QR Code receive mode).
3. App parses QR data and extracts merchant name, city, and IDR amount.
4. App fetches a live crypto quote (USDC or XLM) and presents rate, fee, and total.
5. User confirms and signs the Stellar payment through Freighter.
6. Bridge engine executes the on-chain anchor off-ramp transaction.
7. App creates a Mayar settlement invoice for the IDR amount.
8. Merchant (or demo judge) pays the Mayar QRIS/e-wallet checkout link.
9. App polls Mayar for confirmation and transitions to `SETTLED` (green checkmark).

---

## Screens & Layout (5-Tab Mobile Wallet UI)

| Tab | Purpose |
|---|---|
| **Home** | Freighter wallet balance (USDC/XLM), IDR/USD estimates, live exchange rates, and "Ready to pay?" quick-scan shortcut. |
| **Tokens** | Multi-asset token balance list (USDC, XLM), rate cards, and asset details. |
| **Scan** | Direct camera QRIS scanner, gallery file scan, and My QR Code receive payment generator. |
| **History** | Transaction history grouped by network environment (Testnet/Mainnet), with merchant name, ref, status badge, and display currency amount. |
| **Profile** | Freighter wallet connect/disconnect, network environment (auto-synced from Freighter), and display currency selector (IDR/USD). |

---

## Core Features

### 1. Scan QR
The app opens the camera directly (no simulator mode) and scans a QRIS code in real time. The user can also upload an image from the gallery or view a personal receive QR code with an optional IDR/USD amount request.

### 2. Quote Engine
The app calculates the crypto amount needed for the IDR invoice using live CoinGecko exchange rates combined with a live USD/IDR rate from Frankfurter API. The UI shows the amount, rate, fee, and equivalent in the selected display currency.

### 3. Stellar Payment
The payer signs a Stellar transaction via Freighter to transfer USDC or XLM to the bridge escrow address. The invoice amount is locked and the input becomes non-editable once payment is initiated.

### 4. Anchor Off-ramp
After on-chain confirmation, the bridge engine executes a real Stellar transaction representing the anchor off-ramp (USDC burn to issuer, or XLM transfer to a redemption address). This step produces a real on-chain transaction hash.

### 5. Mayar Checkout/Settlement
The backend creates a Mayar Invoice via the `/hl/v1/invoice/create` endpoint for the IDR amount. The resulting checkout link allows QRIS or e-wallet payment to simulate real IDR merchant settlement.

### 6. Mayar Settlement Polling
The app polls the Mayar invoice status every 5 seconds. When the status transitions to `paid`, the app marks the transaction as `SETTLED` and displays a green success state.

### 7. Network Environment Sync
The active network (Testnet/Mainnet) is automatically derived from the connected Freighter wallet. Switching the network inside the Freighter browser extension dynamically updates: Horizon endpoints, Mayar API environment (sandbox ↔ production), and transaction history filtering.

### 8. Display Currency
The user can toggle between IDR (Rp) and USD ($) in the Profile tab. All balance displays, invoice amounts, exchange rates, and history prices adapt to this setting. The preference is persisted in `localStorage`.

### 9. Transaction History Network Isolation
Each transaction is tagged with the network it was created on (`testnet` or `mainnet`). The History tab only shows transactions for the currently active network environment.

---

## Invoice Status Flow

```
SCANNED → QUOTED → PAYMENT_PENDING → PAYMENT_CONFIRMED
       → ANCHOR_PROCESSING → PAYOUT_PROCESSING
       → SETTLEMENT_PENDING → SETTLED
                           → FAILED
```

Status display rules:
- **Done steps**: solid blue circle
- **Active step**: hollow blue border circle
- **Pending steps**: hollow grey border circle
- **SETTLED**: step 3 (Payout) header turns green

---

## Technical Architecture

### Frontend
- Vite + React SPA (TypeScript)
- Tailwind CSS v4 via `@tailwindcss/vite`, primary color `#01AED6`
- `html5-qrcode` for camera and gallery-based QR scanning
- Freighter API (`@stellar/freighter-api`) for wallet connection and transaction signing

### Payment & Data Layer
- **Stellar SDK**: transaction building, signing, and submission to Horizon
- **Mayar API** (sandbox/production): invoice creation and status polling
- **Frankfurter API**: live USD/IDR exchange rate
- **CoinGecko API**: live USDC and XLM token rates

### State Persistence
- `lintas_invoices` — transaction history array
- `lintas_current_invoice` — active checkout invoice
- `lintas_display_currency` — IDR or USD preference
- `lintas_wallet_disconnected` — explicit disconnect flag to prevent auto-reconnection

### Vite Proxy Targets
- `/api/mayar-sandbox` → `https://mayar.id`
- `/api/mayar-production` → `https://mayar.id`

---

## Data Model

### Invoice
| Field | Type | Description |
|---|---|---|
| `id` | string | Unique invoice reference |
| `merchant` | string | Merchant name from QRIS |
| `city` | string | Merchant city from QRIS |
| `idrAmount` | number | IDR amount from QRIS |
| `status` | string | Current invoice status |
| `network` | string | `testnet` or `mainnet` |
| `cryptoAmount` | number | Crypto amount at quote time |
| `assetCode` | string | `USDC` or `XLM` |
| `stellarTxHash` | string | On-chain payment tx hash |
| `anchorTxHash` | string | On-chain off-ramp tx hash |
| `mayarSettlementInvoiceId` | string | Mayar invoice ID |
| `mayarSettlementPaymentUrl` | string | Mayar checkout URL |
| `paymentMethodUsed` | string | Method used for settlement |

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_MAYAR_API_KEY` | Mayar API key (sandbox or production) |
| `VITE_STELLAR_SECRET_KEY` | Bridge/escrow Stellar keypair secret |

---

## Success Criteria
- User can scan a QRIS code and see parsed invoice details.
- User can see a live crypto quote for the IDR amount.
- User can submit a real Stellar payment and get a real tx hash.
- App automatically transitions through all settlement stages.
- Mayar polling detects payment and marks the invoice as `SETTLED`.
- History shows correct transactions per network environment.
- Demo is understandable by judges in under 3 minutes.

---

## Risks & Limitations
- QRIS payload parsing can vary between static and dynamic QR sources.
- Mayar API keys and sandbox credentials must be valid and not expired.
- Anchor behavior in production requires real compliance, banking, and withdrawal rails.
- CoinGecko and Frankfurter APIs are public and rate-limited; production use requires dedicated API access.

---

## Pitch Positioning
A crypto-funded merchant settlement layer for QRIS commerce, powered by Stellar for user payment and Mayar (a licensed Indonesian payment provider) for merchant IDR settlement.

This avoids claiming that QRIS merchants directly receive crypto, while demonstrating a strong, regulation-compatible local payments use case that is ready to scale.

---

## Hackathon Submission Q&A

### What is your Problem Statement?
Crypto holders in Indonesia cannot spend their on-chain assets at real merchants. Indonesian retail commerce runs almost entirely on QRIS — a QR-based payment standard managed by regulated payment service providers. There is no native bridge between a Stellar wallet and a QRIS merchant point of sale. Users who hold USDC or XLM must manually off-ramp to IDR through an exchange before they can pay at any local merchant, which is slow, costly, and friction-heavy.

### Proposed Solution
Lintas is a mobile web bridge that lets a user scan any Indonesian QRIS code with their phone, pay in Stellar USDC or XLM through their Freighter wallet, and automatically settle the payment in IDR to the merchant through Mayar — a licensed local payment provider. The app handles the full flow: QR parsing → live crypto quote → Stellar on-chain payment → anchor off-ramp → Mayar IDR settlement invoice → polling for confirmation. The merchant does not need to know anything about crypto; they simply receive IDR in their existing account.

### Target Users / Audience
**Primary:**
- Crypto-native users and Stellar ecosystem participants in Indonesia who hold USDC or XLM and want to spend them at local merchants without manually cashing out.
- Hackathon judges and demo audiences evaluating real-world utility of Stellar for consumer payments.

**Secondary:**
- Indonesian fintech developers exploring QRIS + blockchain payment architecture.
- Businesses or wallets interested in building a crypto-to-fiat payments layer on Stellar for the Indonesian market.

### Team Member Names & Roles
| Name | Role |
|---|---|
| Vicky Adi Firmansyah | Solo Developer — Product, Design, Frontend, Smart Contract & Payment Integration |

### Which country are you located?
Indonesia 🇮🇩

### Expected Stellar Integration
- **Freighter Wallet** — used for wallet connection, account address resolution, and signing Stellar transactions.
- **Stellar SDK + Horizon** — used to build, sign, and submit on-chain USDC and XLM payment transactions; fetch real-time account balances.
- **Stellar Asset Contract (SAC) / USDC** — USDC on Stellar Testnet is used as the primary payment asset alongside native XLM.
- **Anchor Off-ramp Pattern** — after detecting the on-chain payment, the bridge executes a real Stellar transaction representing the anchor redemption step (USDC burned to issuer or XLM transferred to off-ramp address), producing a real on-chain transaction hash before triggering fiat settlement.
- **Testnet / Mainnet** — the app supports both environments, automatically synced from the connected Freighter wallet network setting.

### Hackathon Track
**Payment & Consumer Applications**

Lintas directly addresses consumer-facing payments: a Stellar-powered QRIS wallet that enables crypto holders to pay at any Indonesian retail merchant and settle in local fiat (IDR) through a licensed payment provider — no exchange required, no manual off-ramp, no merchant-side changes needed.