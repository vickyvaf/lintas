---
marp: true
theme: gaia
_class: lead
paginate: true
backgroundColor: #ffffff
color: #0f172a
style: |
  section {
    font-family: 'Inter', sans-serif;
    padding: 40px;
  }
  h1 {
    color: #01AED6;
  }
  footer {
    font-size: 0.5em;
    color: #64748b;
  }
---

# LINTAS
### Seamless Crypto-to-QRIS Merchant Bridge on Stellar

*Connecting On-Chain Assets to Real-World Retail Payments*

Vicky Adi Firmansyah

---

## The Problem ⚠️

- **The Spendability Barrier**: Crypto-native users hold stable assets (USDC/XLM) on-chain, but cannot spend them directly at local retail merchants in Indonesia.
- **QRIS Dominance**: Over 30 million retail merchants in Indonesia accept payments exclusively via QRIS (QR Code Indonesian Standard).
- **Friction & Cost**: Existing solutions require users to manually send assets to an exchange, wait for trade execution, withdraw IDR to a bank account, and then scan the QRIS using a local e-wallet.

---

## The Solution 💡

**Lintas** bridges on-chain Stellar assets directly to the QRIS merchant rails:

- **Scan any QRIS**: Pay at any local retail merchant using a Freighter wallet.
- **Zero Merchant Integration**: Merchants receive standard Rupiah (IDR) directly in their bank account or e-wallet.
- **Compliance First**: Leverages existing licensed local payout channels (Mayar) to settle fiat payouts without requiring multi-billion IDR PJP Kategori 1 licensing.

---

## How It Works (Architecture) 🛠️

```
[User Wallet (Freighter)]
       │ (Stellar USDC/XLM Payment)
       ▼
[Bridge Holding/Escrow Address]
       │ (On-Chain Detection → Anchor Off-ramp Redemptions)
       ▼
[Bridge Backend Engine]
       │ (Trigger Payout)
       ▼
[Payment API] ──► [Real-time IDR Settlement to Merchant]
```

---

## Core Features 🚀

1. **Direct Scan & Gallery Upload**: Centered 1:1 camera scanning viewport or upload static QRIS images directly from the gallery.
2. **Dynamic Quote Engine**: Fetches real-time market rates (USDC/XLM via CoinGecko) and live fiat rates (USD/IDR via Frankfurter API).
3. **Freighter Network Sync**: Automatically detects and adapts configuration when Freighter toggles between Testnet and Mainnet.
4. **Isolated Environments**: History tab dynamically filters transactions based on the active wallet network environment.
5. **Display Currency Toggle**: Seamlessly switch dashboard view between IDR (Rp) and USD ($) with local storage persistence.

---

## Demo Payment Status Flow 🔄

Every transaction follows a clear, reliable state-machine:

```
SCANNED ──► QUOTED ──► PAYMENT_PENDING ──► PAYMENT_CONFIRMED
                                                  │
    SETTLED ◄── SETTLEMENT_PENDING ◄── PAYOUT_PROCESSING
```

- **Stellar Transaction**: On-chain transfer from user to escrow.
- **Anchor Off-ramp**: On-chain asset burn (USDC) or sink (XLM) to simulation destination.
- **Payment Checkout**: Automatic checkout link creation and real-time status polling.

---

## Stellar Integration Details 🌌

- **Freighter Wallet**: Connection, address verification, and transaction signing.
- **Stellar SDK + Horizon**: Dynamic balance updates and on-chain payment submissions.
- **Stellar Asset Contract (SAC)**: Interacting with USDC token contracts.
- **Anchor Off-ramp Pattern**: Burn/Redemption operations mapped with transaction memo tracking.

---

## Why Lintas is Ready to Scale 📈

- **Regulation-Friendly**: Avoids direct crypto-to-merchant rails by utilizing regulated local gateway settlement.
- **Stellar Network Performance**: Ultra-fast ledger confirmation and micro-cent transaction fees make retail payments practical.
- **Familiar UX**: Looks and feels like a standard mobile banking app with full display currency support.

---

# LINTAS
## Thank You!

*Let's connect real-world retail commerce to the Stellar network.*

