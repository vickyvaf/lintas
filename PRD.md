# PRD — Lintas

## Overview
This product is a simple demo application that lets a user scan a QRIS code, read the merchant invoice details, show a crypto equivalent, accept a payment on Stellar, simulate an anchor off-ramp flow, and create a merchant payout through Mayar disbursement and checkout APIs.

The goal is not to become a native QRIS issuer or a production payment processor. The goal is to demonstrate a believable end-to-end merchant payment flow where crypto funds the transaction and the merchant receives a fiat settlement path.

## Product Goal
Build a hackathon-ready MVP that proves three things:
- QRIS can be used as the invoice and merchant acceptance layer.
- Stellar can be used as the user payment rail and anchor-compatible asset layer.
- Mayar can be used as the local payout/disbursement layer after fiat settlement is available off-chain.

## Problem
Cross-border users and crypto-native users may hold stable assets on-chain, but small merchants in Indonesia typically accept QRIS and expect IDR settlement through local payment rails. Existing QRIS merchants are served by regulated PSPs and acquirers, so a Stellar wallet alone does not natively become a QRIS payment app without an additional bridge layer.

## Product Concept
The app acts as a bridge between three systems:
- QRIS merchant invoice source.
- Stellar payment flow for the payer.
- Anchor plus Mayar payout flow for the merchant settlement.

The merchant still thinks in IDR, the payer pays in crypto, and the backend orchestrates reconciliation and settlement.

## Target User
### Primary users
- Crypto holders who want to pay a local Indonesian merchant without first manually cashing out.
- Demo merchants or hackathon judges who want to see a realistic merchant settlement flow.

### Secondary users
- Developers exploring QRIS plus blockchain payment architecture.
- Stellar hackathon judges looking for local utility and composability.

## User Flow
1. Merchant displays a QRIS code with invoice amount in IDR.
2. User scans the QR using the mobile web app.
3. The app parses QR data and extracts merchant reference plus amount.
4. The backend fetches a quote and shows the user the equivalent amount in crypto.
5. The user confirms and sends payment on Stellar to the platform wallet or escrow address.
6. The backend verifies the Stellar transaction.
7. The anchor layer is simulated as the off-ramp step from Stellar asset to fiat availability.
8. The backend triggers a Mayar payout/invoice checkout representing merchant bank/e-wallet settlement.
9. Merchant dashboard shows paid, payout created, and settlement status.

## Scope
### In scope
- QR scan interface for reading a QRIS image or camera feed.
- QR parser for merchant reference and nominal.
- Quote service from IDR to a selected crypto asset.
- Stellar payment intent and transaction verification.
- Mock anchor service representing off-ramp and compliance boundary.
- Mayar payout integration or checkout link generation for merchant settlement.
- Merchant dashboard showing invoice and settlement status.

### Out of scope
- Production QRIS issuer registration.
- Full KYC and AML stack.
- Live licensed crypto-to-fiat conversion.
- Guaranteed real bank settlement for external merchants.
- Multi-country compliance.

## Core Features
### 1. Scan QR
The app opens camera or image upload, scans a QRIS code, and extracts invoice metadata. If parsing fails, the user can paste mock QR payload manually.

### 2. Quote engine
The backend calculates the crypto amount needed for the IDR invoice and locks the quote for a short time window. The UI shows amount, rate, fee, and expiry.

### 3. Stellar payment
The payer is shown a destination address, asset, and amount, then sends the transaction on Stellar testnet or a supported environment.

### 4. Anchor mock
After on-chain confirmation, the app calls an anchor-like service that marks the invoice as fiat-ready. In the demo, this is a simulation boundary that represents off-ramp behavior rather than a real financial institution.

### 5. Mayar checkout/payout layer
The backend creates a Mayar payment invoice representing merchant settlement payout. Paying/checking this invoice simulates merchant settlement completion.

### 6. Merchant settlement dashboard
The merchant side sees invoice amount, crypto equivalent, tx hash, settlement status, and payout status.

## Screens & Layout (5-Page Mobile Wallet UI)
| Screen/Tab | Purpose |
|---|---|
| Home | Account balance overview, quick faucet actions, and live CoinGecko rates. |
| Tokens | Multi-asset token balance list (USDC, XLM, etc.), asset details, and quick deposit/withdrawal links. |
| Scan | Direct camera-based QRIS scanning access or sandbox mock QR generator form. |
| History | Transaction history log showing on-chain payment history, invoice details, and Mayar payout/settlement status. |
| Profile | Freighter wallet connectivity setup, API/developer configuration, and network toggles. |

## Technical Architecture
### Frontend
- Vite + React SPA (TypeScript).
- html5-qrcode library for browser-based scanning.
- Freighter API for wallet signatures.

### Backend
- Client-side mock services and Vite proxy targets.
- `quote-service` for IDR-to-crypto calculation.
- `stellar-service` for payment verification.
- `anchor-service` for simulated off-ramp state machine.
- `mayar-service` for payout/checkout integration.

### Core integration model (Approach A - Production Design Decision)
- **Invoice Format**: QRIS is the merchant-facing invoice format.
- **Payer Asset Rail**: Stellar (USDC/XLM) handles the user-to-bridge payment transfer.
- **Fiat Bridge Gateway**: The Bridge Pool receives crypto, off-ramps it conceptually, and triggers the disbursement.
- **Settlement Execution (Approach A)**: Rather than paying the QRIS code directly (which is legally restricted and requires complex Bank Indonesia PJP 1 licensing), the system uses **Mayar Invoice/Payout API** to transfer IDR directly into the merchant's account. This provides maximum compatibility with existing retail merchants and complies with Indonesian payment regulations without high overhead.

## Data Model
### Invoice
- `id`
- `merchant_id`
- `idr_amount`
- `currency`
- `qris_payload`
- `status`
- `expires_at`

### Quote
- `invoice_id`
- `asset_code`
- `asset_amount`
- `fx_rate`
- `fee_amount`
- `quote_expires_at`

### Chain Payment
- `invoice_id`
- `stellar_address`
- `tx_hash`
- `network`
- `confirmed_at`
- `payment_status`

### Settlement
- `invoice_id`
- `anchor_status`
- `payout_provider`
- `payout_reference`
- `payout_status`
- `bank_account_masked`

## API Endpoints
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/scan/parse` | POST | Parse QR payload into invoice fields. |
| `/api/quote` | POST | Create IDR to crypto quote. |
| `/api/payments/intent` | POST | Create Stellar payment intent. |
| `/api/payments/verify` | POST | Verify Stellar transaction. |
| `/api/anchor/settle` | POST | Simulate off-ramp and mark fiat-ready state. |
| `/api/payouts/create` | POST | Create Mayar settlement invoice. |
| `/api/invoices/:id` | GET | Retrieve invoice state for UI. |

## Demo Logic
For the hackathon demo, the anchor and payout layers can be mocked or run against Mayar sandbox API while preserving realistic state transitions.

Recommended demo states:
- `SCANNED`
- `QUOTED`
- `PAYMENT_PENDING`
- `PAYMENT_CONFIRMED`
- `ANCHOR_PROCESSING`
- `PAYOUT_PROCESSING`
- `SETTLEMENT_PENDING`
- `SETTLED`

## Success Criteria
- User can scan a QR and see parsed invoice details.
- User can see a crypto quote for the IDR amount.
- User can submit or simulate a Stellar payment and get a tx hash.
- Merchant dashboard updates through settlement stages.
- Demo is understandable by judges in under 3 minutes.

## Risks
- QRIS payload parsing can vary depending on static or dynamic QR source.
- Mayar API keys and sandbox credentials must be valid.
- Anchor behavior in production requires real compliance, banking, and withdrawal rails.

## Pitch Positioning
The safest positioning is: a crypto-funded merchant settlement layer for QRIS commerce, powered by Stellar for user payment and a local payout rail (Mayar) for merchant settlement.

This avoids claiming that QRIS merchants directly receive crypto, while still showing a strong local payments use case.

## V1 Build Plan
### Day 1 to 2
- Build scan UI and mock QR parser.
- Create invoice and quote backend.

### Day 3 to 4
- Add Stellar payment intent and transaction verification.
- Build processing state UI.

### Day 5 to 6
- Add anchor mock service and Mayar payout mock/integration layer.
- Build merchant dashboard.

### Day 7
- Polish UX, add demo script, and prepare pitch video.