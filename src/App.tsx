import { useState, useEffect, useRef } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  isConnected,
  getAddress,
  requestAccess,
  signTransaction,
  getNetwork
} from '@stellar/freighter-api';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  History,
  QrCode,
  Coins,
  User,
  RefreshCw,
  Wallet,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Store
} from 'lucide-react';

interface Invoice {
  id: string;
  merchant: string;
  city: string;
  idrAmount: number;
  isEditableAmount: boolean;
  status: string;
  anchorStatus: string;
  payoutStatus: string;
  payoutRef: string;
  cryptoAmount: number | null;
  assetCode: string | null;
  stellarTxHash: string | null;
  midtransPayload: any;
  paymentMethodUsed: string | null;
  mayarInvoiceId: string | null;
  mayarPaymentUrl: string | null;
  rate?: number;
  fee?: number;
  total?: number;
  anchorTxHash?: string;
  mayarSettlementInvoiceId?: string;
  mayarSettlementPaymentUrl?: string;
  mayarSettlementPaidAt?: string;
  mayarSettlementError?: string;
}

// CRC16-CCITT checksum calculator for EMVCo/QRIS validation
function crc16(data: string): string {
  let crc = 0xFFFF;
  for (let c = 0; c < data.length; c++) {
    const charCode = data.charCodeAt(c);
    crc ^= (charCode << 8);
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Client-side EMVCo QRIS payload generator
function generateQRISPayload(merchantName: string, city: string, amount: number, invoiceId: string): string {
  const tlv = (tag: number, value: string) => {
    const t = tag.toString().padStart(2, '0');
    const valStr = value.toString();
    const l = valStr.length.toString().padStart(2, '0');
    return t + l + valStr;
  };

  let qris = "";
  qris += tlv(0, "01"); // Payload Version
  qris += tlv(1, "12"); // Dynamic QR (Point of Initiation Method: 12)

  // Tag 26: Merchant Account Information
  const merchantInfo = tlv(0, "co.id.qris") + tlv(1, "93600002000001031352");
  qris += tlv(26, merchantInfo);

  qris += tlv(52, "0000"); // Category Code
  qris += tlv(53, "360");  // Currency IDR
  qris += tlv(54, amount.toString()); // Amount
  qris += tlv(58, "ID");   // Country
  qris += tlv(59, merchantName); // Merchant Name
  qris += tlv(60, city);   // City
  qris += tlv(61, "12345"); // Postal Code

  // Tag 62: Additional Data (Contains Invoice Reference)
  const additionalInfo = tlv(1, invoiceId);
  qris += tlv(62, additionalInfo);

  // Tag 63: CRC16. The value must start with "6304" (tag 63, length 04)
  qris += "6304";

  const checksum = crc16(qris);
  qris += checksum; // Appends checksum to complete the payload

  return qris;
}

const DEFAULT_QRIS = "00020101021226580010co.id.qris0118936000020000010313520400000731053033605405150005802ID5912DemoMerchant6007Jakarta61051234562070703A016304A1B2";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const activeTab = pathname === '/tokens' ? 'tokens' :
    pathname === '/scan' ? 'scan' :
      pathname === '/history' ? 'history' :
        pathname === '/profile' ? 'profile' : 'home';

  const isFaucetPage = pathname === '/faucet';
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [qrisPayload, setQrisPayload] = useState<string>(DEFAULT_QRIS);
  const [selectedAsset, setSelectedAsset] = useState<string>('USDC');
  const [checkingPayment, setCheckingPayment] = useState<boolean>(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');

  // QR Camera Scanner Visibility State
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [isEditingAmount, setIsEditingAmount] = useState<boolean>(false);

  // Freighter Wallet Connection States
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);

  // Dynamic QRIS Generator Inputs
  const [inputMerchant, setInputMerchant] = useState<string>('Demo Merchant');
  const [inputCity, setInputCity] = useState<string>('Jakarta');
  const [inputAmount, setInputAmount] = useState<number>(15000);

  // Dynamic rates from CoinGecko (Initialized to 0)
  const [rates, setRates] = useState<Record<string, number>>({
    USDC: 0,
    XLM: 0
  });
  const [rateSyncTime, setRateSyncTime] = useState<string | null>(null);
  const [rateSyncSource, setRateSyncSource] = useState<string>('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [fetchingRates, setFetchingRates] = useState<boolean>(false);

  // Read environment variables
  const stellarPublicKey = import.meta.env.VITE_STELLAR_PUBLIC_KEY || '';
  const mayarApiKey = import.meta.env.VITE_MAYAR_API_KEY || '';

  // Stellar network selection: 'testnet' | 'mainnet'
  const [stellarNet, setStellarNet] = useState<'testnet' | 'mainnet'>('testnet');

  // Derived network config — single source of truth
  const netConfig = stellarNet === 'mainnet' ? {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: StellarSdk.Networks.PUBLIC,
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Circle USDC on Mainnet
    explorerBase: 'https://stellar.expert/explorer/public/tx',
  } : {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: StellarSdk.Networks.TESTNET,
    usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // USDC on Testnet
    explorerBase: 'https://stellar.expert/explorer/testnet/tx',
  };

  // Environment override option for Mayar (default to sandbox for testing)
  const [mayarEnv, setMayarEnv] = useState<'sandbox' | 'production'>('sandbox');

  // Polling reference to prevent memory leaks and clean up on unmount
  const pollIntervalRef = useRef<any>(null);
  const processingInvoiceIdRef = useRef<string | null>(null);

  // Check if Freighter is connected on load
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const { isConnected: installed } = await isConnected();
        if (!installed) return;
        const { address: addr } = await getAddress();
        if (addr) {
          setWalletAddress(addr);
          const { network: net } = await getNetwork();
          setWalletNetwork(net);
        }
      } catch (e) {
        console.warn("Failed checking Freighter connection on load", e);
      }
    };
    checkFreighter();
  }, []);

  // Clean up polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Auto-start scanner when entering scan tab
  useEffect(() => {
    if (activeTab === 'scan' && !currentInvoice) {
      setShowScanner(true);
    } else {
      setShowScanner(false);
    }
  }, [activeTab, currentInvoice]);

  // Fetch real-time exchange rates directly from the Public Free CoinGecko API
  const fetchRates = async () => {
    setFetchingRates(true);
    setRateError(null);
    console.log("[CoinGecko] Fetching rates directly from public free API...");

    const cacheKey = 'qris_stellar_bridge_rates';
    const timestampKey = 'qris_stellar_bridge_rates_timestamp';
    const cacheDuration = 60000; // 60 seconds (1 minute)

    try {
      const cachedRates = localStorage.getItem(cacheKey);
      const cachedTimestamp = localStorage.getItem(timestampKey);
      const now = Date.now();

      // Check if cache is still valid
      if (cachedRates && cachedTimestamp && (now - parseInt(cachedTimestamp, 10) < cacheDuration)) {
        const parsedRates = JSON.parse(cachedRates);
        setRates(parsedRates);

        const cachedDate = new Date(parseInt(cachedTimestamp, 10));
        setRateSyncTime(cachedDate.toLocaleTimeString());
        setRateSyncSource('Local Cache (1 min TTL)');
        console.log('[CoinGecko] Loaded rates from cache:', parsedRates);
        setFetchingRates(false);
        return;
      }

      // If cache expired or not found, fetch from CoinGecko Public API
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,stellar&vs_currencies=idr'
      );
      if (!response.ok) {
        throw new Error(`Public API returned status ${response.status}`);
      }
      const data = await response.json();
      const newUsdcRate = data['usd-coin']?.idr;
      const newXlmRate = data['stellar']?.idr;

      if (newUsdcRate && newXlmRate) {
        const ratesData = { USDC: newUsdcRate, XLM: newXlmRate };
        setRates(ratesData);
        setRateSyncTime(new Date().toLocaleTimeString());
        setRateSyncSource('CoinGecko Public API');

        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify(ratesData));
        localStorage.setItem(timestampKey, now.toString());
        console.log('[CoinGecko] Synced successfully and cached in localStorage');
      } else {
        throw new Error("Unable to parse rates from public API response.");
      }
    } catch (err: any) {
      console.error('[CoinGecko] API fetch failed:', err);
      setRateError(`Failed to fetch exchange rates: ${err.message}`);

      const expiredRates = localStorage.getItem(cacheKey);
      if (expiredRates) {
        setRates(JSON.parse(expiredRates));
        setRateSyncSource('Expired Local Cache (Fallback)');
        setRateError(`Failed to fetch live rates, using expired cache: ${err.message}`);
      } else {
        setRates({ USDC: 0, XLM: 0 });
      }
    } finally {
      setFetchingRates(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  // HTML5 Camera QR Code Scanner lifecycle hook
  useEffect(() => {
    if (!showScanner) return;

    let scanner: Html5QrcodeScanner | null = null;
    let isMounted = true;

    const timer = setTimeout(() => {
      if (!isMounted) return;

      const container = document.getElementById("qr-reader");
      if (!container) return;

      scanner = new Html5QrcodeScanner(
        "qr-reader",
        { 
          fps: 10, 
          qrbox: { width: 220, height: 220 },
          rememberLastUsedCamera: true
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          console.log("[QRIS Scanner] Decoded payload:", decodedText);
          const parsed = parseQRIS(decodedText);

          setCurrentInvoice(parsed);
          setQrisPayload(decodedText);
          setPaymentStatusMessage('');

          // Shutdown scanner and close overlay
          if (scanner) {
            scanner.clear().catch(err => console.error("Error shutting down QR scanner:", err));
          }
          setShowScanner(false);
        },
        (error) => {
          // Ignore verbose scanner read errors
        }
      );
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch(err => console.log("Cleaned up camera resources:", err));
      }
    };
  }, [showScanner]);

  // Automatically calculate quote when invoice, selected asset, or rates change
  useEffect(() => {
    if (!currentInvoice) return;
    if (!currentInvoice.idrAmount || currentInvoice.idrAmount <= 0) return;
    if (['SCANNED', 'QUOTED'].includes(currentInvoice.status)) {
      const rate = rates[selectedAsset];
      if (!rate || rate === 0) return;
      const cryptoAmount = currentInvoice.idrAmount / rate;
      const fee = cryptoAmount * 0.01;
      const total = cryptoAmount + fee;

      // Only update if it actually changed to avoid infinite loop
      if (
        currentInvoice.assetCode !== selectedAsset ||
        currentInvoice.rate !== rate ||
        currentInvoice.cryptoAmount !== cryptoAmount ||
        currentInvoice.status !== 'QUOTED'
      ) {
        setCurrentInvoice(prev => {
          if (!prev) return null;
          return {
            ...prev,
            assetCode: selectedAsset,
            cryptoAmount: cryptoAmount,
            fee: fee,
            total: total,
            rate: rate,
            status: 'QUOTED'
          };
        });
      }
    }
  }, [currentInvoice?.idrAmount, selectedAsset, rates]);

  // Automated Settlement Pipeline (Anchor Off-ramp and Bank Payout)
  useEffect(() => {
    if (!currentInvoice) {
      processingInvoiceIdRef.current = null;
      return;
    }

    if (!['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status)) {
      processingInvoiceIdRef.current = null;
    }

    // Trigger Anchor processing when payment is confirmed
    if (currentInvoice.status === 'PAYMENT_CONFIRMED') {
      if (processingInvoiceIdRef.current === currentInvoice.id) {
        console.log("[Bridge Engine] Already processing this invoice to avoid duplicate calls.");
        return;
      }
      processingInvoiceIdRef.current = currentInvoice.id;

      console.log(`[Bridge Engine] Payment confirmed for invoice ${currentInvoice.id}. Executing real on-chain Anchor Off-ramp transaction...`);
      setPaymentStatusMessage("Payment Confirmed! Bridge Engine: Initiating on-chain asset redemption transaction to Stellar Anchor...");

      const updatedInvoice = {
        ...currentInvoice,
        status: 'ANCHOR_PROCESSING'
      };
      confirmPayment(updatedInvoice);

      // Perform real on-chain transaction from bridge account representing the anchor off-ramp (USDC burn/XLM sink)
      const executeAnchorOfframpOnChain = async () => {
        const stellarSecretKey = import.meta.env.VITE_STELLAR_SECRET_KEY || '';
        if (!stellarSecretKey) {
          console.warn("[Bridge Engine] Secret key missing, falling back to simulated off-ramp.");
          setTimeout(proceedToPayoutSimulation, 2000);
          return;
        }

        try {
          const server = new StellarSdk.Horizon.Server(netConfig.horizonUrl);
          const bridgeKeypair = StellarSdk.Keypair.fromSecret(stellarSecretKey);
          const bridgeAddress = bridgeKeypair.publicKey();

          // Load bridge account state
          const bridgeAccount = await server.loadAccount(bridgeAddress);

          // Determine redemption asset and operation
          let op;
          const amountToRedeem = currentInvoice.cryptoAmount!.toFixed(7);

          if (currentInvoice.assetCode === 'USDC') {
            const usdcIssuer = netConfig.usdcIssuer;
            const usdcAsset = new StellarSdk.Asset('USDC', usdcIssuer);

            // Check if bridge has enough USDC balance
            const usdcBalanceObj = bridgeAccount.balances.find(
              (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
            );
            const usdcBalance = usdcBalanceObj ? parseFloat(usdcBalanceObj.balance) : 0;

            if (usdcBalance >= parseFloat(amountToRedeem)) {
              console.log(`[Bridge Engine] Submitting standard USDC redemption payment of ${amountToRedeem} USDC to ${usdcIssuer}...`);
              op = StellarSdk.Operation.payment({
                destination: usdcIssuer,
                asset: usdcAsset,
                amount: amountToRedeem
              });
            } else {
              // Fallback: Path payment (spend XLM, destination receives USDC)
              console.log(`[Bridge Engine] Insufficient USDC balance (${usdcBalance}). Executing path payment (XLM -> USDC) to redeem ${amountToRedeem} USDC...`);
              op = StellarSdk.Operation.pathPaymentStrictReceive({
                sendAsset: StellarSdk.Asset.native(),
                sendMax: "500", // Allow spending up to 500 XLM to acquire the USDC
                destination: usdcIssuer,
                destAsset: usdcAsset,
                destAmount: amountToRedeem,
                path: []
              });
            }
          } else {
            const redemptionDestination = 'GDV37R76KBMOWOZNPFFMOSUZSJKUZO4VZ5EWTFFILBPGJKYE4EERSCLD';

            // Auto-heal destination account if not exists on testnet
            if (stellarNet === 'testnet') {
              try {
                await server.loadAccount(redemptionDestination);
              } catch (destErr) {
                console.log(`[Bridge Engine] Redemption address ${redemptionDestination} not found. Funding via Friendbot...`);
                setPaymentStatusMessage(`Redemption destination not found. Pre-funding ${redemptionDestination} via Friendbot...`);
                try {
                  const fRes = await fetch(`https://friendbot.stellar.org?addr=${redemptionDestination}`);
                  if (fRes.ok) {
                    await new Promise(r => setTimeout(r, 2500));
                  }
                } catch (friendbotErr) {
                  console.warn("Failed to fund redemption destination via Friendbot:", friendbotErr);
                }
              }
            }

            console.log(`[Bridge Engine] Submitting native XLM off-ramp payment of ${amountToRedeem} XLM to ${redemptionDestination}...`);
            op = StellarSdk.Operation.payment({
              destination: redemptionDestination,
              asset: StellarSdk.Asset.native(),
              amount: amountToRedeem
            });
          }

          const tx = new StellarSdk.TransactionBuilder(bridgeAccount, {
            fee: '100',
            networkPassphrase: netConfig.networkPassphrase
          })
            .addOperation(op)
            .addMemo(StellarSdk.Memo.text(`off_${currentInvoice.id.substring(4)}`))
            .setTimeout(180)
            .build();

          tx.sign(bridgeKeypair);
          const result = await server.submitTransaction(tx);
          console.log("[Bridge Engine] On-chain Anchor Off-ramp transaction success:", result.hash);

          setPaymentStatusMessage(`Anchor Off-ramp confirmed on-chain!\nTx Hash: ${result.hash}\n\nCreating Mayar settlement invoice for merchant payout...`);

          const nextInvoiceState = {
            ...currentInvoice,
            status: 'PAYOUT_PROCESSING',
            anchorStatus: 'SETTLED_FIAT_AVAILABLE',
            anchorTxHash: result.hash // Save the real transaction hash
          };
          confirmPayment(nextInvoiceState);

          // Proceed to payout bank transfer step
          setTimeout(() => {
            triggerPayoutStep(nextInvoiceState);
          }, 2000);

        } catch (err: any) {
          console.error("[Bridge Engine] On-chain off-ramp transaction failed:", err);
          let errMsg = err.message;
          if (err.response && err.response.data && err.response.data.extras && err.response.data.extras.result_codes) {
            errMsg += ` (${JSON.stringify(err.response.data.extras.result_codes)})`;
          }
          setPaymentStatusMessage(`Anchor off-ramp failed: ${errMsg}. Falling back to simulated off-ramp...`);
          setTimeout(proceedToPayoutSimulation, 3000);
        }
      };

      const proceedToPayoutSimulation = () => {
        const nextInvoiceState = {
          ...currentInvoice,
          status: 'PAYOUT_PROCESSING',
          anchorStatus: 'SETTLED_FIAT_AVAILABLE'
        };
        confirmPayment(nextInvoiceState);
        setTimeout(() => {
          triggerPayoutStep(nextInvoiceState);
        }, 2000);
      };

      // Real Mayar settlement
      const triggerPayoutStep = async (invoiceState: Invoice) => {
        const proxyEndpoint = mayarEnv === 'production'
          ? '/api/mayar-production/hl/v1/invoice/create'
          : '/api/mayar-sandbox/hl/v1/invoice/create';

        const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const settlementPayload = {
          name: invoiceState.merchant || 'Bridge Merchant',
          email: `merchant-${invoiceState.id}@bridge.local`,
          mobile: '080000000000',
          redirectUrl: window.location.href,
          description: `Settlement for invoice ${invoiceState.id} | Anchor off-ramp confirmed | Amount: Rp ${invoiceState.idrAmount.toLocaleString()}`,
          expiredAt: expiryDate,
          items: [
            {
              quantity: 1,
              rate: Math.round(invoiceState.idrAmount),
              description: `Bridge Settlement - ${invoiceState.merchant} (${invoiceState.city}) - Ref: ${invoiceState.id}`
            }
          ],
          extraData: {
            bridgeInvoiceId: invoiceState.id,
            stellarTxHash: invoiceState.stellarTxHash || ('mock_stellar_tx_' + Math.random().toString(36).substring(2, 14)),
            anchorTxHash: invoiceState.anchorTxHash || ('mock_anchor_tx_' + Math.random().toString(36).substring(2, 14)),
            assetCode: invoiceState.assetCode || 'USDC',
            cryptoAmount: String(invoiceState.cryptoAmount || 0)
          }
        };

        try {
          setPaymentStatusMessage('Creating Mayar settlement invoice for merchant payout...');
          console.log('[Bridge Engine] Creating Mayar settlement invoice...', settlementPayload);

          const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${mayarApiKey}`
            },
            body: JSON.stringify(settlementPayload)
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Mayar API error: ${response.status} - ${errText}`);
          }

          const json = await response.json();

          if (json.statusCode !== 200 || !json.data) {
            throw new Error(json.messages || 'Failed to create settlement invoice');
          }

          const mayarInvoiceId = json.data.id;
          const mayarPaymentUrl = json.data.paymentUrl || json.data.link;

          console.log('[Bridge Engine] Mayar settlement invoice created:', mayarInvoiceId);

          const settlementState = {
            ...invoiceState,
            status: 'SETTLEMENT_PENDING',
            mayarSettlementInvoiceId: mayarInvoiceId,
            mayarSettlementPaymentUrl: mayarPaymentUrl
          };
          confirmPayment(settlementState);

          setPaymentStatusMessage(
            `Mayar settlement invoice created!\n` +
            `Invoice ID: ${mayarInvoiceId}\n` +
            `Payment URL: ${mayarPaymentUrl}\n\n` +
            `Settlement waiting for payment...\n` +
            `Open the payment URL above and pay via QRIS/e-wallet to complete merchant settlement.`
          );

          startSettlementPolling(mayarInvoiceId, settlementState);

        } catch (err: any) {
          console.error('[Bridge Engine] Mayar settlement invoice creation failed:', err);
          setPaymentStatusMessage(
            `Mayar settlement failed: ${err.message}\n\n` +
            `Settlement is pending. You can retry or manually settle the merchant.`
          );

          const failedState = {
            ...invoiceState,
            status: 'SETTLEMENT_PENDING',
            mayarSettlementError: err.message
          };
          confirmPayment(failedState);
        }
      };

      const startSettlementPolling = (mayarInvoiceId: string, invoiceState: Invoice) => {
        const statusEndpoint = mayarEnv === 'production'
          ? `/api/mayar-production/hl/v1/invoice/${mayarInvoiceId}`
          : `/api/mayar-sandbox/hl/v1/invoice/${mayarInvoiceId}`;

        console.log(`[Bridge Engine] Starting settlement polling for Mayar invoice ${mayarInvoiceId}...`);

        pollIntervalRef.current = setInterval(async () => {
          try {
            const response = await fetch(statusEndpoint, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${mayarApiKey}`
              }
            });
            if (!response.ok) return;

            const json = await response.json();
            if (json.statusCode === 200 && json.data) {
              const mayarStatus = json.data.status;
              console.log(`[Bridge Engine] Settlement Mayar invoice status: ${mayarStatus}`);

              if (mayarStatus === 'paid') {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }

                const settledState = {
                  ...invoiceState,
                  status: 'SETTLED',
                  payoutStatus: 'COMPLETED',
                  payoutRef: mayarInvoiceId,
                  mayarSettlementPaidAt: new Date().toISOString()
                };
                confirmPayment(settledState);

                setPaymentStatusMessage(
                  `Bridge settlement completed!\n` +
                  `Mayar settlement invoice ${mayarInvoiceId} has been paid.\n` +
                  `Merchant: ${invoiceState.merchant} | Amount: Rp ${invoiceState.idrAmount.toLocaleString()}\n` +
                  `Stellar Tx: ${invoiceState.stellarTxHash}\n` +
                  `Anchor Tx: ${invoiceState.anchorTxHash}`
                );
              }
            }
          } catch (err: any) {
            console.warn('[Bridge Engine] Settlement polling error:', err.message);
          }
        }, 5000);
      };

      executeAnchorOfframpOnChain();
    }
  }, [currentInvoice?.status]);

  const parseQRIS = (payload: string): Invoice => {
    let idrAmount = 0;
    let isEditableAmount = true;
    let merchantName = "Demo Merchant";
    let merchantCity = "Jakarta";

    try {
      const cleanPayload = payload.trim();
      const tags: Record<string, string> = {};
      let index = 0;

      // Parse EMVCo TLV blocks sequentially
      while (index < cleanPayload.length - 4) {
        const tag = cleanPayload.substring(index, index + 2);
        const lengthStr = cleanPayload.substring(index + 2, index + 4);
        const length = parseInt(lengthStr, 10);
        if (isNaN(length) || length <= 0) {
          index += 1;
          continue;
        }
        const value = cleanPayload.substring(index + 4, index + 4 + length);
        tags[tag] = value;
        index += 4 + length;
      }

      console.log("[QRIS Parser] Parsed TLV Tags:", tags);

      // Extract amount (Tag 54)
      if (tags["54"]) {
        const parsedVal = parseFloat(tags["54"]);
        if (!isNaN(parsedVal) && parsedVal > 0) {
          idrAmount = parsedVal;
          isEditableAmount = false;
        }
      }

      // Extract merchant name (Tag 59)
      if (tags["59"]) {
        merchantName = tags["59"];
      }

      // Extract merchant city (Tag 60)
      if (tags["60"]) {
        merchantCity = tags["60"];
      }
    } catch (e) {
      console.warn("Failed parsing EMVCo fields, using fallback values.", e);
    }

    return {
      id: 'inv_' + Math.random().toString(36).substring(2, 11),
      merchant: merchantName,
      city: merchantCity,
      idrAmount: idrAmount,
      isEditableAmount: isEditableAmount,
      status: 'SCANNED',
      anchorStatus: 'NONE',
      payoutStatus: 'NONE',
      payoutRef: 'NONE',
      cryptoAmount: null,
      assetCode: null,
      stellarTxHash: null,
      midtransPayload: null,
      paymentMethodUsed: null,
      mayarInvoiceId: null,
      mayarPaymentUrl: null
    };
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      const { isConnected: installed, error: installError } = await isConnected();
      if (installError || !installed) {
        alert("Freighter Wallet extension is not installed in your browser. Please install it first!");
        setIsConnectingWallet(false);
        return;
      }

      const { address: addr, error: accessError } = await requestAccess();
      if (accessError) {
        throw new Error(accessError.message || accessError);
      }

      if (addr) {
        setWalletAddress(addr);
        const { network: net } = await getNetwork();
        setWalletNetwork(net);
        console.log("[Freighter] Wallet connected address:", addr);
      }
    } catch (err: any) {
      console.error("[Freighter] Connect wallet error:", err);
      alert("Failed to connect Freighter: " + err.message);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleSwapXLMToUSDC = async () => {
    if (!walletAddress) return;
    setCheckingPayment(true);
    setPaymentStatusMessage("Initiating XLM to USDC swap...");
    try {
      const server = new StellarSdk.Horizon.Server(netConfig.horizonUrl);
      let senderAccount = await server.loadAccount(walletAddress);

      const usdcIssuer = netConfig.usdcIssuer;
      const paymentAsset = new StellarSdk.Asset('USDC', usdcIssuer);

      const hasTrustline = senderAccount.balances.some(
        (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
      );

      if (!hasTrustline) {
        setPaymentStatusMessage("USDC trustline missing. Establishing trustline first...");
        const trustTx = new StellarSdk.TransactionBuilder(senderAccount, {
          fee: '100',
          networkPassphrase: netConfig.networkPassphrase
        })
          .addOperation(StellarSdk.Operation.changeTrust({
            asset: paymentAsset
          }))
          .setTimeout(180)
          .build();

        setPaymentStatusMessage("Please sign the trustline creation in your Freighter Wallet...");
        const { signedTxXdr, error } = await signTransaction(trustTx.toXDR(), {
          networkPassphrase: netConfig.networkPassphrase
        });
        if (error) throw new Error("Freighter trustline signing rejected: " + error);
        const signedTrustTx = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, netConfig.networkPassphrase);
        await server.submitTransaction(signedTrustTx);
        setPaymentStatusMessage("USDC trustline successfully established!");
        senderAccount = await server.loadAccount(walletAddress);
      }

      setPaymentStatusMessage("Swapping XLM to USDC...");
      const tx = new StellarSdk.TransactionBuilder(senderAccount, {
        fee: '100',
        networkPassphrase: netConfig.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.pathPaymentStrictReceive({
          sendAsset: StellarSdk.Asset.native(),
          sendMax: '1000',
          destination: walletAddress,
          destAsset: paymentAsset,
          destAmount: '100'
        }))
        .setTimeout(180)
        .build();

      setPaymentStatusMessage("Please sign the swap transaction in your Freighter Wallet...");
      const { signedTxXdr, error } = await signTransaction(tx.toXDR(), {
        networkPassphrase: netConfig.networkPassphrase
      });
      if (error) throw new Error("Freighter signing rejected: " + error);

      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, netConfig.networkPassphrase);
      setPaymentStatusMessage("Submitting swap transaction to Stellar network...");
      await server.submitTransaction(signedTx);

      alert("Successfully swapped XLM to 100 USDC Testnet!");
      setPaymentStatusMessage("USDC obtained successfully!");
    } catch (err: any) {
      console.error("Swap error:", err);
      alert("Swap failed: " + (err.message || err.detail || JSON.stringify(err)));
      setPaymentStatusMessage("");
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleParse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrisPayload.trim()) return;
    const parsed = parseQRIS(qrisPayload.trim());
    setCurrentInvoice(parsed);
    setPaymentStatusMessage('');
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleGenerateQRISFlow = (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceId = 'inv_' + Math.random().toString(36).substring(2, 11);

    // Generate valid EMVCo dynamic QRIS string
    const generatedPayload = generateQRISPayload(inputMerchant, inputCity, inputAmount, invoiceId);
    setQrisPayload(generatedPayload);

    const parsedInvoice: Invoice = {
      id: invoiceId,
      merchant: inputMerchant,
      city: inputCity,
      idrAmount: parseFloat(String(inputAmount)),
      isEditableAmount: false,
      status: 'SCANNED',
      anchorStatus: 'NONE',
      payoutStatus: 'NONE',
      payoutRef: 'NONE',
      cryptoAmount: null,
      assetCode: null,
      stellarTxHash: null,
      midtransPayload: null,
      paymentMethodUsed: null,
      mayarInvoiceId: null,
      mayarPaymentUrl: null
    };

    setCurrentInvoice(parsedInvoice);
    setPaymentStatusMessage('');
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleGetQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInvoice) return;

    if (!currentInvoice.idrAmount || currentInvoice.idrAmount <= 0) {
      alert("Please enter a valid IDR Amount greater than 0.");
      return;
    }

    const rate = rates[selectedAsset];
    if (!rate || rate === 0) {
      alert("Cannot calculate quote. Live exchange rates are not available.");
      return;
    }

    const cryptoAmount = currentInvoice.idrAmount / rate;
    const fee = cryptoAmount * 0.01; // 1% fee
    const total = cryptoAmount + fee;

    setCurrentInvoice(prev => {
      if (!prev) return null;
      return {
        ...prev,
        assetCode: selectedAsset,
        cryptoAmount: cryptoAmount,
        fee: fee,
        total: total,
        rate: rate,
        status: 'QUOTED'
      };
    });
  };

  const handleAcceptQuote = () => {
    if (!currentInvoice) return;

    const updated = {
      ...currentInvoice,
      status: 'PAYMENT_PENDING'
    };
    setCurrentInvoice(updated);

    setInvoices(prev => {
      if (prev.some(inv => inv.id === updated.id)) {
        return prev.map(inv => inv.id === updated.id ? updated : inv);
      }
      return [...prev, updated];
    });
  };

  const confirmPayment = (updatedInvoice: Invoice) => {
    setCurrentInvoice(updatedInvoice);
    setInvoices(prev => {
      if (prev.some(inv => inv.id === updatedInvoice.id)) {
        return prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv);
      }
      return [...prev, updatedInvoice];
    });
  };

  const handleCheckPayment = async () => {
    if (!currentInvoice) return;
    setCheckingPayment(true);
    const netName = stellarNet === 'mainnet' ? 'Mainnet' : 'Testnet';
    setPaymentStatusMessage(`Fetching transactions from Horizon ${netName} for account ${stellarPublicKey}...`);

    try {
      const response = await fetch(`${netConfig.horizonUrl}/accounts/${stellarPublicKey}/transactions?limit=20&order=desc`);
      if (!response.ok) {
        throw new Error(`Failed to contact Horizon API (${response.status})`);
      }
      const data = await response.json();
      const transactions = data._embedded?.records || [];

      const matchingTx = transactions.find((tx: any) => tx.memo === currentInvoice.id);

      if (matchingTx) {
        const updated = {
          ...currentInvoice,
          status: 'PAYMENT_CONFIRMED',
          stellarTxHash: matchingTx.hash,
          paymentMethodUsed: 'Stellar On-Chain (Verified via Horizon)'
        };
        setPaymentStatusMessage(`Stellar payment verified on-chain! Tx Hash: ${matchingTx.hash}`);
        confirmPayment(updated);
      } else {
        setPaymentStatusMessage(`No transaction found with Memo ID "${currentInvoice.id}" yet on Horizon ${netName}. Please send the payment with the correct memo and check again.`);
      }
    } catch (err: any) {
      console.error(err);
      setPaymentStatusMessage(`Horizon Check Failed: ${err.message}.`);
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleAutoPayStellar = async () => {
    if (!currentInvoice || !currentInvoice.total) return;

    let payerAddress = '';
    let usingFreighter = false;

    if (walletAddress) {
      payerAddress = walletAddress;
      usingFreighter = true;
    } else {
      const stellarSecretKey = import.meta.env.VITE_STELLAR_SECRET_KEY || '';
      if (!stellarSecretKey) {
        alert("Please connect Freighter Wallet or provide VITE_STELLAR_SECRET_KEY in your .env file to pay.");
        return;
      }
      try {
        payerAddress = StellarSdk.Keypair.fromSecret(stellarSecretKey).publicKey();
      } catch (e) {
        alert("Invalid VITE_STELLAR_SECRET_KEY. Please verify your .env file.");
        return;
      }
    }

    const netName = stellarNet === 'mainnet' ? 'Mainnet' : 'Testnet';
    setCheckingPayment(true);
    setPaymentStatusMessage(usingFreighter ? `Preparing transaction to be signed via Freighter Wallet on Stellar ${netName}...` : `Preparing Stellar ${netName.toLowerCase()} transaction using auto-pay...`);

    try {
      const server = new StellarSdk.Horizon.Server(netConfig.horizonUrl);

      // Load account sequence
      setPaymentStatusMessage(`Loading account state for ${payerAddress}...`);
      let senderAccount: any;
      try {
        senderAccount = await server.loadAccount(payerAddress);
      } catch (err: any) {
        if (err.response && err.response.status === 404) {
          if (stellarNet === 'testnet') {
            setPaymentStatusMessage(`Account ${payerAddress} not found on Testnet. Funding via Friendbot...`);
            const friendbotRes = await fetch(`https://friendbot.stellar.org?addr=${payerAddress}`);
            if (!friendbotRes.ok) {
              throw new Error("Friendbot funding failed. Please fund your testnet account manually.");
            }
            setPaymentStatusMessage("Account successfully funded! Waiting for ledger to close...");
            await new Promise(r => setTimeout(r, 2000));
            senderAccount = await server.loadAccount(payerAddress);
          } else {
            throw new Error(`Account ${payerAddress} is not funded on Mainnet. Please fund it with some XLM to transact.`);
          }
        } else {
          throw err;
        }
      }

      // Determine asset and establish trustline if needed
      const usdcIssuer = netConfig.usdcIssuer;
      let paymentAsset;

      if (currentInvoice.assetCode === 'USDC') {
        paymentAsset = new StellarSdk.Asset('USDC', usdcIssuer);

        // Auto-heal: Check if the account has a trustline to USDC
        const hasTrustline = senderAccount.balances.some(
          (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
        );

        if (!hasTrustline) {
          setPaymentStatusMessage("USDC trustline missing. Establishing trustline...");
          const trustTx = new StellarSdk.TransactionBuilder(senderAccount, {
            fee: '100',
            networkPassphrase: netConfig.networkPassphrase
          })
            .addOperation(StellarSdk.Operation.changeTrust({
              asset: paymentAsset
            }))
            .setTimeout(180)
            .build();

          if (usingFreighter) {
            setPaymentStatusMessage("Please sign the trustline creation in your Freighter Wallet...");
            const { signedTxXdr, error } = await signTransaction(trustTx.toXDR(), {
              networkPassphrase: netConfig.networkPassphrase
            });
            if (error) throw new Error("Freighter trustline signing rejected: " + error);
            const signedTrustTx = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, netConfig.networkPassphrase);
            await server.submitTransaction(signedTrustTx);
          } else {
            const payerKeypair = StellarSdk.Keypair.fromSecret(import.meta.env.VITE_STELLAR_SECRET_KEY);
            trustTx.sign(payerKeypair);
            await server.submitTransaction(trustTx);
          }
          setPaymentStatusMessage("USDC trustline successfully established!");

          // Reload account state after trustline is created
          senderAccount = await server.loadAccount(payerAddress);
        }
      } else {
        paymentAsset = StellarSdk.Asset.native();
      }

      const amountToSend = currentInvoice.total.toFixed(7);
      setPaymentStatusMessage(`Constructing payment of ${amountToSend} ${currentInvoice.assetCode} with Memo: ${currentInvoice.id}...`);

      const tx = new StellarSdk.TransactionBuilder(senderAccount, {
        fee: '100',
        networkPassphrase: netConfig.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: stellarPublicKey, // Send to the bridge public key
          asset: paymentAsset,
          amount: amountToSend
        }))
        .addMemo(StellarSdk.Memo.text(currentInvoice.id))
        .setTimeout(180)
        .build();

      let result;
      if (usingFreighter) {
        setPaymentStatusMessage("Please approve and sign the payment transaction in your Freighter Wallet extension window...");
        const { signedTxXdr, error } = await signTransaction(tx.toXDR(), {
          networkPassphrase: netConfig.networkPassphrase
        });
        if (error) {
          throw new Error("Freighter signing rejected: " + error);
        }
        const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, netConfig.networkPassphrase);
        setPaymentStatusMessage(`Submitting Freighter-signed transaction to Stellar ${netName}...`);
        result = await server.submitTransaction(signedTx);
      } else {
        const payerKeypair = StellarSdk.Keypair.fromSecret(import.meta.env.VITE_STELLAR_SECRET_KEY);
        tx.sign(payerKeypair);
        setPaymentStatusMessage(`Submitting auto-payment transaction to Stellar ${netName}...`);
        result = await server.submitTransaction(tx);
      }

      setPaymentStatusMessage(`Stellar ${netName} Transaction Submitted!\nHash: ${result.hash}\n\nRunning validation check...`);
      console.log("[Payment] Transaction submitted successfully:", result.hash);

      // Verify on-chain after 3 seconds
      setTimeout(() => {
        handleCheckPayment();
      }, 3000);

    } catch (err: any) {
      console.error(err);
      let errMsg = err.message;
      if (err.response && err.response.data && err.response.data.extras && err.response.data.extras.result_codes) {
        errMsg += ` (${JSON.stringify(err.response.data.extras.result_codes)})`;
      }
      setPaymentStatusMessage(`Payment Error: ${errMsg}`);
    } finally {
      setCheckingPayment(false);
    }
  };

  const handlePayWithMayar = async () => {
    if (!currentInvoice) return;

    if (!mayarApiKey) {
      setPaymentStatusMessage("Error: VITE_MAYAR_API_KEY is empty in your .env file. Please add it and restart the dev server.");
      return;
    }

    setPaymentStatusMessage(`Creating Mayar Dynamic Invoice (${mayarEnv.toUpperCase()})...`);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    try {
      const proxyEndpoint = mayarEnv === 'production'
        ? '/api/mayar-production/hl/v1/invoice/create'
        : '/api/mayar-sandbox/hl/v1/invoice/create';

      const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${mayarApiKey}`
        },
        body: JSON.stringify({
          name: "Customer - QRIS Stellar Bridge",
          email: "customer.bridge@example.com",
          mobile: "081234567890",
          amount: Math.round(currentInvoice.idrAmount),
          description: `QRIS Stellar Bridge Invoice Ref: ${currentInvoice.id}`,
          redirectUrl: window.location.href,
          items: [
            {
              description: `QRIS Stellar Bridge Payment - Ref: ${currentInvoice.id}`,
              quantity: 1,
              rate: Math.round(currentInvoice.idrAmount)
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mayar API error: ${response.status} - ${errorText}`);
      }

      const json = await response.json();

      if (json.statusCode !== 200 || !json.data) {
        throw new Error(json.messages || "Failed to parse invoice data from Mayar.");
      }

      const invoiceId = json.data.id;
      const paymentUrl = json.data.paymentUrl || json.data.link;

      setCurrentInvoice(prev => {
        if (!prev) return null;
        return {
          ...prev,
          mayarInvoiceId: invoiceId,
          mayarPaymentUrl: paymentUrl
        };
      });

      setPaymentStatusMessage(`Mayar Invoice generated successfully!\nID: ${invoiceId}\n\nRedirecting you to the Mayar Payment Page...\nIf popup is blocked, click the "Open Mayar Payment Page" button below.`);

      window.open(paymentUrl, '_blank');

      startMayarStatusPolling(invoiceId);

    } catch (err: any) {
      console.error(err);
      setPaymentStatusMessage(`Mayar Integration Error: ${err.message}`);
    }
  };

  const startMayarStatusPolling = (invoiceId: string) => {
    const statusEndpoint = mayarEnv === 'production'
      ? `/api/mayar-production/hl/v1/invoice/${invoiceId}`
      : `/api/mayar-sandbox/hl/v1/invoice/${invoiceId}`;

    pollIntervalRef.current = setInterval(async () => {
      console.log(`[Mayar Polling] Checking status for invoice ${invoiceId}...`);
      try {
        const response = await fetch(statusEndpoint, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${mayarApiKey}`
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const json = await response.json();

        if (json.statusCode === 200 && json.data) {
          const currentStatus = json.data.status;
          console.log(`[Mayar Polling] Status: ${currentStatus}`);

          if (currentStatus === 'paid') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            handleMayarPaymentSuccess('Mayar QRIS/E-Wallet');
          }
        }
      } catch (err: any) {
        console.warn("[Mayar Polling] Error while querying status:", err.message);
      }
    }, 5000);
  };

  const handleMayarPaymentSuccess = (methodName: string) => {
    if (!currentInvoice) return;

    const updated = {
      ...currentInvoice,
      status: 'PAYMENT_CONFIRMED',
      stellarTxHash: 'mayar_tx_' + Math.random().toString(36).substring(2, 14),
      paymentMethodUsed: `Mayar Checkout (${methodName})`
    };
    setPaymentStatusMessage(`Paid via Mayar Checkout (${methodName}) successfully!`);
    confirmPayment(updated);
  };

  const handleSimulateMayarSuccess = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    handleMayarPaymentSuccess('Simulated Mayar QRIS');
  };

  const hasLoadedRates = rates.USDC > 0 && rates.XLM > 0;

  // Render Functions for Tabs
  const renderHomeTab = () => {
    return (
      <div className="tab-content animate-fade-in">
        {/* Balance Card */}
        <div className="balance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span className="balance-label" style={{ margin: 0 }}>Total Balance (Estimated)</span>
            <button
              onClick={fetchRates}
              disabled={fetchingRates}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'color 0.2s',
                position: 'relative',
                zIndex: 2
              }}
              title="Update Rates"
            >
              <RefreshCw size={16} className={fetchingRates ? "animate-spin" : ""} />
            </button>
          </div>
          <h2 className="balance-amount">
            Rp {(hasLoadedRates ? (100 * rates.USDC) : 1500000).toLocaleString()}
          </h2>
          <div className="balance-sub-assets">
            <div className="sub-asset">
              <span className="asset-dot usdc"></span>
              <span>100.00 USDC</span>
            </div>
            <div className="sub-asset">
              <span className="asset-dot xlm"></span>
              <span>0.00 XLM</span>
            </div>
          </div>
        </div>

        {/* Live Rates & Bridge Banner */}
        <div className="rates-container">
          <h3 className="section-title">Live Stablecoin Rates</h3>
          <div className="rate-card-grid">
            <div className="rate-card">
              <div className="rate-info">
                <span className="rate-code">USDC/IDR</span>
                <span className="rate-name">USD Coin</span>
              </div>
              <span className="rate-val">Rp {rates.USDC.toLocaleString()}</span>
            </div>
            <div className="rate-card">
              <div className="rate-info">
                <span className="rate-code">XLM/IDR</span>
                <span className="rate-name">Stellar Lumens</span>
              </div>
              <span className="rate-val">Rp {rates.XLM.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Quick Scan Promo */}
        <div className="promo-card" onClick={() => navigate('/scan')}>
          <div className="promo-text">
            <h4>Ready to pay?</h4>
            <p>Scan any dynamic QRIS invoice to pay with Stellar assets instantly.</p>
          </div>
          <ChevronRight size={24} className="promo-icon" />
        </div>
      </div>
    );
  };

  const renderHistoryTab = () => {
    return (
      <div className="tab-content animate-fade-in">
        <h3 className="section-title">Transaction History</h3>
        <div className="activity-list">
          {invoices.length === 0 ? (
            <div className="empty-state">
              <History size={48} />
              <p>No transactions found.</p>
            </div>
          ) : (
            invoices.map((inv) => (
              <div className="activity-item" key={inv.id} onClick={() => { setCurrentInvoice(inv); navigate('/scan'); }}>
                <div className="item-left">
                  <div className="item-icon-wrapper">
                    <ArrowRightLeft size={20} />
                  </div>
                  <div className="item-details">
                    <span className="item-merchant">{inv.merchant}</span>
                    <span className="item-meta">{inv.city} • Ref: {inv.id}</span>
                  </div>
                </div>
                <div className="item-right">
                  <span className="item-amount text-danger">-Rp {inv.idrAmount.toLocaleString()}</span>
                  <span className={`badge-status ${inv.status.toLowerCase()}`}>{inv.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderScanTab = () => {
    return (
      <div className="tab-content animate-fade-in" style={!currentInvoice ? { height: '100%', padding: 0, position: 'relative' } : undefined}>
        {!currentInvoice ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000000' }}>

            {/* Floating Back Button */}
            <button
              onClick={() => navigate('/')}
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
                outline: 'none'
              }}
              title="Go Back"
            >
              <ArrowLeft size={20} />
            </button>

            {/* Camera Viewport */}
            <div id="qr-reader" style={{ width: '100%', height: '100%', overflow: 'hidden' }}></div>
          </div>
        ) : (
          <div className="invoice-details-view">
            {/* Step Indicators */}
            <div className="steps-indicator">
              <span className={`step ${['SCANNED', 'QUOTED'].includes(currentInvoice.status) ? 'active' : ''} ${['PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'completed' : ''}`}>1. Confirmation</span>
              <span className={`step ${currentInvoice.status === 'PAYMENT_PENDING' ? 'active' : ''} ${['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'completed' : ''}`}>2. Pay</span>
              <span className={`step ${['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'active' : ''}`}>3. Payout</span>
            </div>

            <div className="invoice-card">
              <div className="invoice-header">
                <Store size={24} className="merchant-icon" />
                <div className="header-text">
                  <h4>{currentInvoice.merchant}</h4>
                  <span>{currentInvoice.city}</span>
                </div>
                <button className="btn-close-invoice" onClick={() => setCurrentInvoice(null)}>Reset</button>
              </div>

              <div className="invoice-amount-section">
                <span className="amount-label">IDR Invoice Amount</span>
                {isEditingAmount ? (
                  <div className="amount-edit-row">
                    <span>Rp</span>
                    <input
                      type="number"
                      min="1"
                      value={currentInvoice.idrAmount || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCurrentInvoice(prev => prev ? { ...prev, idrAmount: val } : null);
                      }}
                      onBlur={() => setIsEditingAmount(false)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <h2
                    className={`amount-val ${currentInvoice.isEditableAmount ? 'editable' : ''}`}
                    onDoubleClick={() => currentInvoice.isEditableAmount && setIsEditingAmount(true)}
                    title={currentInvoice.isEditableAmount ? "Double click to edit" : undefined}
                  >
                    Rp {currentInvoice.idrAmount.toLocaleString()}
                  </h2>
                )}
                {currentInvoice.isEditableAmount && !isEditingAmount && (
                  <span className="edit-tip">Double click amount to change</span>
                )}
              </div>

              {/* Quote Logic */}
              {['SCANNED', 'QUOTED'].includes(currentInvoice.status) && (
                <div className="invoice-actions-section">
                  <div className="quote-form" style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Select Stellar Asset</label>
                    <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} disabled={!hasLoadedRates}>
                      {hasLoadedRates ? (
                        <>
                          <option value="USDC">USDC (Stellar Stablecoin)</option>
                          <option value="XLM">XLM (Stellar Native)</option>
                        </>
                      ) : (
                        <option value="">Loading exchange rates...</option>
                      )}
                    </select>
                  </div>

                  {currentInvoice.status === 'QUOTED' && currentInvoice.total && (
                    <div className="quote-result-box animate-fade-in" style={{ marginTop: 0 }}>
                      <div className="quote-row">
                        <span>Rate:</span>
                        <strong>Rp {currentInvoice.rate?.toLocaleString()}</strong>
                      </div>
                      <div className="quote-row">
                        <span>Crypto Amount:</span>
                        <span>{currentInvoice.cryptoAmount?.toFixed(4)} {currentInvoice.assetCode}</span>
                      </div>
                      <div className="quote-row">
                        <span>Bridge Fee (1%):</span>
                        <span>{currentInvoice.fee?.toFixed(4)} {currentInvoice.assetCode}</span>
                      </div>
                      <div className="quote-row total">
                        <span>Total Due:</span>
                        <strong>{currentInvoice.total?.toFixed(4)} {currentInvoice.assetCode}</strong>
                      </div>
                      <button className="btn-primary w-100 mt-15" onClick={handleAcceptQuote}>Confirm & Pay Invoice</button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Section */}
              {currentInvoice.status === 'PAYMENT_PENDING' && currentInvoice.total && (
                <div className="payment-instructions animate-fade-in">
                  <div className="warning-box">
                    <AlertCircle size={20} />
                    <span>Send exactly the amount below with the specified Memo ID.</span>
                  </div>

                  <div className="instruction-details">
                    <div className="inst-row">
                      <span>Destination Address:</span>
                      <code className="address-code">{stellarPublicKey.slice(0, 10)}...{stellarPublicKey.slice(-10)}</code>
                    </div>
                    <div className="inst-row">
                      <span>Memo ID (Invoice Ref):</span>
                      <code>{currentInvoice.id}</code>
                    </div>
                    <div className="inst-row total">
                      <span>Amount:</span>
                      <strong>{currentInvoice.total?.toFixed(4)} {currentInvoice.assetCode}</strong>
                    </div>
                  </div>

                  <div className="payment-action-buttons" style={{ marginTop: '15px' }}>
                    <button className="btn-primary w-100" onClick={handleAutoPayStellar} disabled={checkingPayment}>
                      {checkingPayment ? 'Processing...' : walletAddress ? 'Pay' : 'Simulate Auto-Pay (Escrow)'}
                    </button>
                  </div>
                </div>
              )}

              {/* Settlement Progress / Status */}
              {['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) && (
                <div className="settlement-progress animate-fade-in">
                  <div className="success-header">
                    <CheckCircle2 size={32} className="success-icon" />
                    <h4>Stellar Payment Verified!</h4>
                    <p>On-chain payment verified successfully via transaction memo.</p>
                  </div>

                  <div className="progress-timeline">
                    <div className={`timeline-step ${['ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'active' : ''} ${currentInvoice.anchorStatus === 'SETTLED_FIAT_AVAILABLE' ? 'completed' : ''}`}>
                      <div className="step-bullet"></div>
                      <div className="step-info">
                        <h5>Anchor Off-ramp Redemption</h5>
                        <p>{currentInvoice.status === 'ANCHOR_PROCESSING' ? 'Processing on-chain conversion...' : 'Fiat cash-out completed'}</p>
                        {currentInvoice.anchorTxHash && (
                          <a href={`${netConfig.explorerBase}/${currentInvoice.anchorTxHash}`} target="_blank" rel="noreferrer" className="tx-link">
                            View Anchor RedTx <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className={`timeline-step ${['PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'active' : ''} ${currentInvoice.status === 'SETTLED' ? 'completed' : ''}`}>
                      <div className="step-bullet"></div>
                      <div className="step-info">
                        <h5>Merchant Bank Settlement</h5>
                        <p>
                          {currentInvoice.status === 'SETTLED' ? 'Merchant settled' :
                            (currentInvoice.status === 'SETTLEMENT_PENDING' ? 'Awaiting checkout payment completion...' :
                              'Creating settlement invoice...')}
                        </p>
                        {currentInvoice.mayarSettlementPaymentUrl && currentInvoice.status === 'SETTLEMENT_PENDING' && (
                          <div className="action-box">
                            <a href={currentInvoice.mayarSettlementPaymentUrl} target="_blank" rel="noreferrer" className="btn-payout-link">
                              Pay Merchant Invoice via Mayar <ExternalLink size={14} />
                            </a>
                            <button className="btn-payout-simulate" onClick={handleSimulateMayarSuccess}>Simulate Paid</button>
                          </div>
                        )}
                        {currentInvoice.mayarSettlementInvoiceId && (
                          <span className="meta-text">Mayar Invoice Ref: {currentInvoice.mayarSettlementInvoiceId}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTokensTab = () => {
    const hasLoadedRates = rates.USDC > 0 && rates.XLM > 0;
    const usdcEstIdr = hasLoadedRates ? (100 * rates.USDC) : 1500000;
    const xlmEstIdr = hasLoadedRates ? (0 * rates.XLM) : 0;
    const totalEstIdr = usdcEstIdr + xlmEstIdr;

    return (
      <div className="tab-content animate-fade-in">
        <h3 className="section-title">Crypto Assets</h3>
        <p className="section-desc">Manage and monitor your Stellar stablecoins and tokens.</p>

        {/* Dynamic flat card */}
        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Balance</span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>Rp {totalEstIdr.toLocaleString()}</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* USDC asset card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#4f46e5' }}>
                U
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>USD Coin</h4>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>USDC Stablecoin</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>100.00 USDC</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rp {usdcEstIdr.toLocaleString()}</span>
            </div>
          </div>

          {/* XLM asset card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#d97706' }}>
                X
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Stellar Lumens</h4>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>XLM Native</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>0.00 XLM</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rp {xlmEstIdr.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProfileTab = () => {
    return (
      <div className="tab-content animate-fade-in">
        <h3 className="section-title">Wallet & Configurations</h3>

        <div className="card-setting">
          {walletAddress ? (
            <div className="wallet-connected-box">
              <div className="wallet-meta">
                <Wallet size={36} />
                <div className="wallet-text">
                  <span className="wallet-state">Connected</span>
                  <code className="wallet-addr">{walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}</code>
                </div>
              </div>
              <button className="btn-disconnect" onClick={() => { setWalletAddress(null); setWalletNetwork(null); }}>
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <button className="btn-connect-wallet" onClick={handleConnectWallet} disabled={isConnectingWallet}>
              {isConnectingWallet ? 'Connecting...' : 'Connect Freighter Wallet'}
            </button>
          )}
        </div>

        <div className="card-setting mt-15">
          <h4>Environment Configurations</h4>
          <div className="config-row">
            <span>Stellar Network:</span>
            <select value={stellarNet} onChange={(e) => setStellarNet(e.target.value as 'testnet' | 'mainnet')}>
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div className="config-row">
            <span>Mayar Environment:</span>
            <select value={mayarEnv} onChange={(e) => setMayarEnv(e.target.value as 'sandbox' | 'production')}>
              <option value="sandbox">Sandbox (Testing)</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>
      </div>
    );
  };

  if (isFaucetPage) {
    return (
      <div className="app-container">
        <div className="mobile-shell">
          <header className="mobile-header">
            <div className="header-branding">
              <Wallet className="branding-logo" size={24} />
              <h1 className="branding-title">USDC Faucet</h1>
            </div>
            <button className="btn-close-invoice" onClick={() => navigate('/')}>Back</button>
          </header>

          <main className="mobile-main">
            <div className="tab-content animate-fade-in">
              <h3 className="section-title">Stellar Testnet USDC Faucet</h3>
              <p className="section-desc">Request test tokens directly into your connected Freighter wallet.</p>

              <div className="card-setting">
                <h4>Faucet Dispenser</h4>
                {walletAddress ? (
                  <div>
                    <div className="wallet-connected-box" style={{ marginBottom: '15px' }}>
                      <div className="wallet-meta">
                        <Wallet size={36} />
                        <div className="wallet-text">
                          <span className="wallet-state">Target Wallet</span>
                          <code className="wallet-addr">{walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}</code>
                        </div>
                      </div>
                    </div>
                    <button className="btn-primary w-100" onClick={handleSwapXLMToUSDC} disabled={checkingPayment}>
                      {checkingPayment ? 'Processing Faucet...' : 'Get 100 USDC Testnet'}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <p style={{ marginBottom: '15px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Please connect your Freighter wallet in the profile section to receive test tokens.
                    </p>
                    <button className="btn-primary w-100" onClick={() => navigate('/profile')}>
                      Go to Connect Wallet
                    </button>
                  </div>
                )}
              </div>

              {paymentStatusMessage && (
                <div className="status-log-card animate-fade-in mt-15">
                  <h5>Log Console</h5>
                  <pre>{paymentStatusMessage}</pre>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  }

  const isScanningActive = activeTab === 'scan' && !currentInvoice;

  return (
    <div className="app-container">
      {/* Mobile Shell Frame */}
      <div className="mobile-shell" style={isScanningActive ? { overflow: 'hidden' } : undefined}>
        {!isScanningActive && (
          <header className="mobile-header">
            <div className="header-branding">
              <Wallet className="branding-logo" size={24} />
              <h1 className="branding-title">Lintas</h1>
            </div>
          </header>
        )}

        <main className="mobile-main" style={isScanningActive ? { padding: 0, paddingBottom: 0, overflow: 'hidden', height: '100%' } : undefined}>
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'tokens' && renderTokensTab()}
          {activeTab === 'scan' && renderScanTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'profile' && renderProfileTab()}
        </main>

        {!isScanningActive && (
          <nav className="mobile-navbar">
            <button className={`nav-tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => navigate('/')}>
              <Home size={22} />
              <span>Home</span>
            </button>
            <button className={`nav-tab-btn ${activeTab === 'tokens' ? 'active' : ''}`} onClick={() => navigate('/tokens')}>
              <Coins size={22} />
              <span>Tokens</span>
            </button>

            <div className="nav-center-action">
              <button className={`btn-center-scan ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => { setCurrentInvoice(null); navigate('/scan'); }}>
                <QrCode size={26} />
              </button>
              <span className="scan-label">Scan</span>
            </div>

            <button className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => navigate('/history')}>
              <History size={22} />
              <span>History</span>
            </button>
            <button className={`nav-tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => navigate('/profile')}>
              <User size={22} />
              <span>Profile</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

export default App;
