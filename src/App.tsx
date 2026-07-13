import { useState, useEffect, useRef } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
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
  Store,
  Image
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
  network?: 'testnet' | 'mainnet';
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
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const stored = localStorage.getItem('lintas_invoices');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn("Failed to load invoices from localStorage:", e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('lintas_invoices', JSON.stringify(invoices));
    } catch (e) {
      console.warn("Failed to save invoices to localStorage:", e);
    }
  }, [invoices]);

  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(() => {
    try {
      const stored = localStorage.getItem('lintas_current_invoice');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.warn("Failed to load current invoice:", e);
      return null;
    }
  });

  useEffect(() => {
    try {
      if (currentInvoice) {
        localStorage.setItem('lintas_current_invoice', JSON.stringify(currentInvoice));
      } else {
        localStorage.removeItem('lintas_current_invoice');
      }
    } catch (e) {
      console.warn("Failed to save current invoice:", e);
    }
  }, [currentInvoice]);
  const [qrisPayload, setQrisPayload] = useState<string>(DEFAULT_QRIS);
  const [selectedAsset, setSelectedAsset] = useState<string>('USDC');
  const [checkingPayment, setCheckingPayment] = useState<boolean>(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');
  const [showReceiveQr, setShowReceiveQr] = useState<boolean>(false);
  const [receiveAmount, setReceiveAmount] = useState<string>('');

  // QR Camera Scanner Visibility State
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [isEditingAmount, setIsEditingAmount] = useState<boolean>(false);

  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Freighter Wallet Connection States
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);

  // Embedded Wallet States
  const [isEmbeddedWallet, setIsEmbeddedWallet] = useState<boolean>(() => {
    return localStorage.getItem('lintas_is_embedded_wallet') === 'true';
  });
  const [embeddedSecretKey, setEmbeddedSecretKey] = useState<string | null>(() => {
    return localStorage.getItem('lintas_embedded_secret_key');
  });

  // Load embedded wallet on startup
  useEffect(() => {
    if (isEmbeddedWallet && embeddedSecretKey) {
      try {
        const keypair = StellarSdk.Keypair.fromSecret(embeddedSecretKey);
        setWalletAddress(keypair.publicKey());
      } catch (err) {
        console.error("Failed loading embedded wallet keypair:", err);
      }
    }
  }, [isEmbeddedWallet, embeddedSecretKey]);

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

  const [usdcBalance, setUsdcBalance] = useState<string>('0.00');
  const [xlmBalance, setXlmBalance] = useState<string>('0.00');

  useEffect(() => {
    if (!walletAddress) {
      setUsdcBalance('0.00');
      setXlmBalance('0.00');
      return;
    }

    const fetchBalances = async () => {
      try {
        const server = new StellarSdk.Horizon.Server(netConfig.horizonUrl);
        const account = await server.loadAccount(walletAddress);

        // Find native (XLM) balance
        const nativeBal = account.balances.find(b => b.asset_type === 'native');
        if (nativeBal) {
          setXlmBalance(parseFloat(nativeBal.balance).toFixed(2));
        } else {
          setXlmBalance('0.00');
        }

        // Find USDC balance
        const usdcBal = account.balances.find(b =>
          b.asset_type === 'credit_alphanum4' &&
          b.asset_code === 'USDC' &&
          b.asset_issuer === netConfig.usdcIssuer
        );
        if (usdcBal) {
          setUsdcBalance(parseFloat(usdcBal.balance).toFixed(2));
        } else {
          setUsdcBalance('0.00');
        }
      } catch (err) {
        console.warn('Failed to fetch wallet balances:', err);
      }
    };

    fetchBalances();
    // Refresh balances every 10 seconds if wallet is connected
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [walletAddress, stellarNet]);

  // Dynamic QRIS Generator Inputs
  const [inputMerchant, setInputMerchant] = useState<string>('Demo Merchant');
  const [inputCity, setInputCity] = useState<string>('Jakarta');
  const [inputAmount, setInputAmount] = useState<number>(15000);

  // Dynamic rates from CoinGecko (Initialized to 0)
  const [rates, setRates] = useState<Record<string, number>>({
    USDC: 0,
    XLM: 0
  });
  const [usdToIdrRate, setUsdToIdrRate] = useState<number>(15000);
  const [rateSyncTime, setRateSyncTime] = useState<string | null>(null);
  const [rateSyncSource, setRateSyncSource] = useState<string>('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [fetchingRates, setFetchingRates] = useState<boolean>(false);

  // Environment override option for Mayar (default to sandbox for testing)
  const [mayarEnv, setMayarEnv] = useState<'sandbox' | 'production'>('sandbox');

  // Display currency selection: 'USD' | 'IDR'
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'IDR'>(() => {
    return (localStorage.getItem('lintas_display_currency') as 'USD' | 'IDR') || 'IDR';
  });

  useEffect(() => {
    localStorage.setItem('lintas_display_currency', displayCurrency);
  }, [displayCurrency]);

  // Reset Receive Payments state when navigating away or switching tabs
  useEffect(() => {
    if (activeTab !== 'scan') {
      setShowReceiveQr(false);
      setReceiveAmount('');
    } else if (!showReceiveQr) {
      setReceiveAmount('');
    }
  }, [showReceiveQr, activeTab]);

  // Polling reference to prevent memory leaks and clean up on unmount
  const pollIntervalRef = useRef<any>(null);
  const processingInvoiceIdRef = useRef<string | null>(null);

  // Check if Freighter is connected and sync network settings automatically
  useEffect(() => {
    const checkFreighter = async () => {
      if (localStorage.getItem('lintas_is_embedded_wallet') === 'true') {
        setIsInitializing(false);
        return;
      }
      if (localStorage.getItem('lintas_wallet_disconnected') === 'true') {
        setIsInitializing(false);
        return;
      }
      try {
        const { isConnected: installed } = await isConnected();
        if (!installed) {
          setIsInitializing(false);
          return;
        }
        const { address: addr } = await getAddress();
        if (addr) {
          setWalletAddress(addr);
          const { network: net } = await getNetwork();
          setWalletNetwork(net);
        } else {
          setWalletAddress(null);
          setWalletNetwork(null);
        }
      } catch (e) {
        console.warn("Failed checking Freighter connection", e);
      } finally {
        setIsInitializing(false);
      }
    };
    checkFreighter();
    const interval = setInterval(checkFreighter, 2500);
    return () => clearInterval(interval);
  }, []);

  // Synchronize app stellarNet with Freighter walletNetwork state
  useEffect(() => {
    if (walletNetwork) {
      if (walletNetwork.toUpperCase() === 'PUBLIC') {
        setStellarNet('mainnet');
      } else {
        setStellarNet('testnet');
      }
    }
  }, [walletNetwork]);

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
      const cachedUsdRate = localStorage.getItem('usd_to_idr_rate');
      const now = Date.now();

      if (cachedUsdRate) {
        setUsdToIdrRate(parseFloat(cachedUsdRate));
      }

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

      // Fetch USD to IDR rate from Frankfurter API (Free, no key)
      try {
        const fiatRes = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR');
        if (fiatRes.ok) {
          const fiatData = await fiatRes.json();
          if (fiatData.rates && fiatData.rates.IDR) {
            const newFiatRate = fiatData.rates.IDR;
            setUsdToIdrRate(newFiatRate);
            localStorage.setItem('usd_to_idr_rate', newFiatRate.toString());
            console.log('[Frankfurter] Synced live USD/IDR rate:', newFiatRate);
          }
        }
      } catch (fiatErr) {
        console.warn('[Frankfurter] Failed to fetch USD/IDR rate:', fiatErr);
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
        setRateSyncSource('CoinGecko + Frankfurter');

        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify(ratesData));
        localStorage.setItem(timestampKey, now.toString());
        console.log('[Rates Sync] Synced successfully and cached in localStorage');
      } else {
        throw new Error("Unable to parse rates from public API response.");
      }
    } catch (err: any) {
      console.error('[Rates Sync] API fetch failed:', err);
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

  // HTML5 Camera QR Code Scanner lifecycle hook using low-level Html5Qrcode
  useEffect(() => {
    if (activeTab !== 'scan' || currentInvoice || showReceiveQr) return;

    let html5QrCode: any = null;
    let isMounted = true;

    const timer = setTimeout(() => {
      if (!isMounted) return;

      const container = document.getElementById("qr-reader");
      if (!container) return;

      try {
        // Instantiate low-level scan API
        html5QrCode = new Html5Qrcode("qr-reader");

        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 }
          },
          (decodedText: string) => {
            console.log("[QRIS Scanner] Decoded payload:", decodedText);
            const parsed = parseQRIS(decodedText);
            const invoiceWithNetwork = {
              ...parsed,
              network: stellarNet
            };
            setCurrentInvoice(invoiceWithNetwork);
            setQrisPayload(decodedText);
            setPaymentStatusMessage('');

            if (html5QrCode && html5QrCode.isScanning) {
              html5QrCode.stop().catch((err: any) => console.error("Error stopping scanner:", err));
            }
          },
          (error: any) => {
            // Ignore verbose camera read errors
          }
        ).catch((err: any) => {
          console.warn("Failed to request camera or start scanning:", err);
        });
      } catch (e) {
        console.error("Html5Qrcode loading error:", e);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch((err: any) => console.log("Cleaned up camera resources:", err));
        }
      }
    };
  }, [activeTab, currentInvoice, showReceiveQr, stellarNet]);

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
          const errMsg = "VITE_STELLAR_SECRET_KEY is missing. Cannot perform on-chain Anchor Off-ramp redemption.";
          console.error("[Bridge Engine]", errMsg);
          setPaymentStatusMessage(`Redemption failed: ${errMsg}`);
          const failedState = {
            ...currentInvoice,
            status: 'FAILED' as any
          };
          confirmPayment(failedState);
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
          }, 500);

        } catch (err: any) {
          console.error("[Bridge Engine] On-chain off-ramp transaction failed:", err);
          let errMsg = err.message;
          if (err.response && err.response.data && err.response.data.extras && err.response.data.extras.result_codes) {
            errMsg += ` (${JSON.stringify(err.response.data.extras.result_codes)})`;
          }
          setPaymentStatusMessage(`Anchor off-ramp failed: ${errMsg}`);
          const failedState = {
            ...currentInvoice,
            status: 'FAILED' as any
          };
          confirmPayment(failedState);
        }
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
          if (!mayarApiKey) {
            throw new Error("Mayar API key is not configured in your .env file.");
          }
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

        } catch (err: any) {
          console.error('[Bridge Engine] Mayar settlement invoice creation failed:', err);
          setPaymentStatusMessage(`Mayar settlement failed: ${err.message}`);

          const failedState = {
            ...invoiceState,
            status: 'FAILED' as any,
            mayarSettlementError: err.message
          };
          confirmPayment(failedState);
        }
      };

      executeAnchorOfframpOnChain();
    }
  }, [currentInvoice?.status]);

  // Unified effect to start/resume Mayar settlement polling on mount or state changes
  useEffect(() => {
    if (!currentInvoice || currentInvoice.status !== 'SETTLEMENT_PENDING' || !currentInvoice.mayarSettlementInvoiceId) {
      return;
    }

    const intervalId = setInterval(async () => {
      const statusEndpoint = mayarEnv === 'production'
        ? `/api/mayar-production/hl/v1/invoice/${currentInvoice.mayarSettlementInvoiceId}`
        : `/api/mayar-sandbox/hl/v1/invoice/${currentInvoice.mayarSettlementInvoiceId}`;

      try {
        if (!mayarApiKey) return;
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
          console.log(`[Bridge Engine] Mayar polling status for ${currentInvoice.mayarSettlementInvoiceId}: ${mayarStatus}`);

          if (mayarStatus === 'paid') {
            clearInterval(intervalId);

            const settledState = {
              ...currentInvoice,
              status: 'SETTLED' as const,
              payoutStatus: 'COMPLETED',
              payoutRef: currentInvoice.mayarSettlementInvoiceId,
              mayarSettlementPaidAt: new Date().toISOString()
            };
            confirmPayment(settledState);

            setPaymentStatusMessage(
              `Bridge settlement completed!\n` +
              `Mayar settlement invoice ${currentInvoice.mayarSettlementInvoiceId} has been paid.\n` +
              `Merchant: ${currentInvoice.merchant} | Amount: Rp ${currentInvoice.idrAmount.toLocaleString()}\n` +
              `Stellar Tx: ${currentInvoice.stellarTxHash}\n` +
              `Anchor Tx: ${currentInvoice.anchorTxHash}`
            );
          }
        }
      } catch (err: any) {
        console.warn('[Bridge Engine] Settlement polling error:', err.message);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [currentInvoice?.id, currentInvoice?.status]);

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
        localStorage.removeItem('lintas_wallet_disconnected');
        console.log("[Freighter] Wallet connected address:", addr);
      }
    } catch (err: any) {
      console.error("[Freighter] Connect wallet error:", err);
      alert("Failed to connect Freighter: " + err.message);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleCreateInstantWallet = async () => {
    setIsConnectingWallet(true);
    try {
      const keypair = StellarSdk.Keypair.random();
      const pubKey = keypair.publicKey();
      const secKey = keypair.secret();

      setWalletAddress(pubKey);
      setEmbeddedSecretKey(secKey);
      setIsEmbeddedWallet(true);
      setWalletNetwork('TESTNET');

      localStorage.setItem('lintas_is_embedded_wallet', 'true');
      localStorage.setItem('lintas_embedded_secret_key', secKey);
      localStorage.removeItem('lintas_wallet_disconnected');

      alert(`Wallet created successfully!\n\nPublic Key:\n${pubKey}\n\nSecret Key (SAVE THIS SECURELY):\n${secKey}`);

      if (stellarNet === 'testnet') {
        setPaymentStatusMessage("Pre-funding your new Testnet wallet account...");
        const res = await fetch(`https://friendbot.stellar.org?addr=${pubKey}`);
        if (res.ok) {
          setPaymentStatusMessage("Instant wallet pre-funded successfully via Friendbot!");
        }
      }
    } catch (err: any) {
      console.error(err);
      alert("Failed creating wallet: " + err.message);
    } finally {
      setIsConnectingWallet(false);
      setPaymentStatusMessage("");
    }
  };

  const handleImportSecretKey = () => {
    const secKey = prompt("Enter your Stellar Secret Key (starts with 'S'):");
    if (!secKey) return;
    try {
      const keypair = StellarSdk.Keypair.fromSecret(secKey.trim());
      const pubKey = keypair.publicKey();

      setWalletAddress(pubKey);
      setEmbeddedSecretKey(secKey.trim());
      setIsEmbeddedWallet(true);

      localStorage.setItem('lintas_is_embedded_wallet', 'true');
      localStorage.setItem('lintas_embedded_secret_key', secKey.trim());
      localStorage.removeItem('lintas_wallet_disconnected');

      alert("Wallet imported successfully!");
    } catch (err: any) {
      alert("Invalid Secret Key: " + err.message);
    }
  };

  const handleDisconnectWallet = () => {
    setWalletAddress(null);
    setWalletNetwork(null);
    setIsEmbeddedWallet(false);
    setEmbeddedSecretKey(null);
    localStorage.removeItem('lintas_is_embedded_wallet');
    localStorage.removeItem('lintas_embedded_secret_key');
    localStorage.setItem('lintas_wallet_disconnected', 'true');
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
    let secretKeyToUse = '';

    if (walletAddress && !isEmbeddedWallet) {
      payerAddress = walletAddress;
      usingFreighter = true;
    } else if (isEmbeddedWallet && embeddedSecretKey) {
      payerAddress = walletAddress || '';
      usingFreighter = false;
      secretKeyToUse = embeddedSecretKey;
    } else {
      const stellarSecretKey = import.meta.env.VITE_STELLAR_SECRET_KEY || '';
      if (!stellarSecretKey) {
        alert("Please connect Freighter, create an Instant Wallet, or set VITE_STELLAR_SECRET_KEY in your .env file to pay.");
        return;
      }
      try {
        payerAddress = StellarSdk.Keypair.fromSecret(stellarSecretKey).publicKey();
        secretKeyToUse = stellarSecretKey;
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
            const payerKeypair = StellarSdk.Keypair.fromSecret(secretKeyToUse);
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
        const payerKeypair = StellarSdk.Keypair.fromSecret(secretKeyToUse);
        tx.sign(payerKeypair);
        setPaymentStatusMessage(`Submitting payment transaction to Stellar ${netName}...`);
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

      const failedInvoice = {
        ...currentInvoice,
        status: 'FAILED' as any,
        paymentMethodUsed: 'Stellar On-Chain (Failed)'
      };
      setCurrentInvoice(failedInvoice);
      setInvoices(prev => {
        if (prev.some(inv => inv.id === failedInvoice.id)) {
          return prev.map(inv => inv.id === failedInvoice.id ? failedInvoice : inv);
        }
        return [...prev, failedInvoice];
      });
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
      status: 'SETTLED' as any,
      paymentMethodUsed: `Mayar Checkout (${methodName})`
    };
    setPaymentStatusMessage(`Paid via Mayar Checkout (${methodName}) successfully!`);
    confirmPayment(updated);
  };



  const hasLoadedRates = rates.USDC > 0 && rates.XLM > 0;

  const renderWalletSelectionView = () => {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4 py-8">
        <Wallet size={56} className="text-[#01AED6] animate-pulse" />
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 text-slate-900 font-extrabold text-[1.2rem] tracking-tight">Access Your Wallet</h3>
          <p className="m-0 text-slate-500 text-[0.85rem] max-w-[280px]">Connect Freighter extension or generate an instant embedded web wallet.</p>
        </div>
        <div className="w-full max-w-[280px] flex flex-col gap-3">
          <button className="w-full bg-[#01AED6] hover:bg-[#0090b3] text-white border-none py-3 px-4 rounded-xl font-bold text-[0.85rem] cursor-pointer transition-colors duration-200 shadow-sm" onClick={handleConnectWallet} disabled={isConnectingWallet}>
            {isConnectingWallet ? 'Connecting...' : 'Connect Freighter Wallet'}
          </button>

          <div className="flex items-center justify-between gap-2 my-1">
            <div className="flex-1 h-[1px] bg-slate-200"></div>
            <span className="text-[0.7rem] text-slate-400 font-bold">Or Mobile Native</span>
            <div className="flex-1 h-[1px] bg-slate-200"></div>
          </div>

          <button className="w-full bg-slate-900 hover:bg-black text-white border-none py-3 px-4 rounded-xl font-bold text-[0.85rem] cursor-pointer transition-colors duration-200 shadow-sm" onClick={handleCreateInstantWallet}>
            Create Instant Wallet
          </button>

          <button className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-3 px-4 rounded-xl font-bold text-[0.85rem] cursor-pointer transition-colors duration-200" onClick={handleImportSecretKey}>
            Import Secret Key
          </button>
        </div>
      </div>
    );
  };

  // Render Functions for Tabs
  const renderHomeTab = () => {
    if (!walletAddress) {
      return renderWalletSelectionView();
    }

    const usdcVal = parseFloat(usdcBalance) || 0;
    const xlmVal = parseFloat(xlmBalance) || 0;
    const usdcEstIdr = rates.USDC > 0 ? (usdcVal * rates.USDC) : (usdcVal * usdToIdrRate);
    const xlmEstIdr = rates.XLM > 0 ? (xlmVal * rates.XLM) : 0;
    const totalEstIdr = usdcEstIdr + xlmEstIdr;
    const totalEstUsd = rates.USDC > 0 ? (totalEstIdr / rates.USDC) : (usdcVal + (xlmVal * 0.1823));

    return (
      <div className="animate-fade-in flex flex-col gap-6">
        {/* Balance Card */}
        <div className="bg-indigo-600 text-white rounded-3xl p-6 relative overflow-hidden">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span className="text-[0.85rem] font-medium opacity-80 block mb-1" style={{ margin: 0 }}>Total Balance</span>
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
          <h2 className="text-[2rem] font-extrabold tracking-[-0.5px] mb-4">
            {displayCurrency === 'USD'
              ? `$ ${totalEstUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Rp ${totalEstIdr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </h2>
          <div className="flex gap-4 border-t border-white/15 pt-4">
            <div className="flex items-center gap-1.5 text-[0.85rem] font-semibold">
              <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png" alt="USDC Logo" className="w-4 h-4 rounded-full" />
              <span>{usdcVal.toFixed(2)} USDC</span>
            </div>
            <div className="flex items-center gap-1.5 text-[0.85rem] font-semibold">
              <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/black/xlm.png" alt="XLM Logo" className="w-4 h-4 rounded-full" />
              <span>{xlmVal.toFixed(2)} XLM</span>
            </div>
          </div>
        </div>

        {/* Live Rates & Bridge Banner */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[1.1rem] font-bold text-slate-900 mb-3 tracking-[-0.3px]">Live Stablecoin Rates</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <div className="flex flex-col mb-1.5">
                <span className="text-[0.85rem] font-bold text-slate-900">
                  {displayCurrency === 'USD' ? 'USDC/USD' : 'USDC/IDR'}
                </span>
                <span className="text-[0.7rem] text-slate-500">USD Coin</span>
              </div>
              <span className="text-[1rem] font-extrabold text-indigo-600">
                {displayCurrency === 'USD' ? '$ 1.00' : `Rp ${rates.USDC.toLocaleString()}`}
              </span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <div className="flex flex-col mb-1.5">
                <span className="text-[0.85rem] font-bold text-slate-900">
                  {displayCurrency === 'USD' ? 'XLM/USD' : 'XLM/IDR'}
                </span>
                <span className="text-[0.7rem] text-slate-500">Stellar Lumens</span>
              </div>
              <span className="text-[1rem] font-extrabold text-indigo-600">
                {displayCurrency === 'USD'
                  ? `$ ${(rates.USDC > 0 ? (rates.XLM / rates.USDC) : (rates.XLM / usdToIdrRate)).toFixed(4)}`
                  : `Rp ${rates.XLM.toLocaleString()}`}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Scan Promo */}
        <div className="bg-indigo-50 border border-dashed border-indigo-600/30 p-4 rounded-2xl flex justify-between items-center cursor-pointer transition-transform duration-200 hover:-translate-y-0.5" onClick={() => { setCurrentInvoice(null); navigate('/scan'); }}>
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[0.9rem] font-bold text-indigo-700 m-0">Ready to pay?</h4>
            <p className="text-[0.75rem] text-indigo-700 m-0">Scan any dynamic QRIS invoice to pay with Stellar assets instantly.</p>
          </div>
          <ChevronRight size={24} className="text-indigo-600" />
        </div>
      </div>
    );
  };

  const renderHistoryTab = () => {
    if (!walletAddress) {
      return (
        <div className="animate-fade-in flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <History size={48} className="text-slate-400" />
          <h3 className="m-0 text-slate-900 font-bold text-[1.1rem]">No transaction history</h3>
          <p className="m-0 text-slate-500 text-[0.9rem]">Connect your wallet to view your transaction history.</p>
          <button className="w-full max-w-[200px] bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200" onClick={handleConnectWallet} disabled={isConnectingWallet}>
            {isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      );
    }

    const filteredInvoices = invoices.filter(inv => {
      const invNet = inv.network || 'testnet';
      return invNet === stellarNet;
    });

    return (
      <div className="animate-fade-in flex flex-col gap-4 pb-24">
        <h3 className="text-[1.1rem] font-bold text-slate-900 mb-3 tracking-[-0.3px]">Transaction History</h3>
        <div className="flex flex-col gap-3">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-10 px-5 text-slate-400 flex flex-col items-center gap-2">
              <History size={48} />
              <p>No transactions found.</p>
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div className="bg-white border border-slate-200 p-4 rounded-2xl flex justify-between items-center cursor-pointer transition-colors duration-200 hover:bg-slate-50" key={inv.id} onClick={() => { setCurrentInvoice(inv); navigate('/scan'); }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <ArrowRightLeft size={20} />
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[0.9rem] font-bold text-slate-900">{inv.merchant}</span>
                    <span className="text-[0.75rem] text-slate-500">{inv.city} • Ref: {inv.id}</span>
                    <span className={`text-[0.7rem] font-semibold px-2 py-0.5 rounded ${inv.status === 'SCANNED' ? 'bg-indigo-50 text-indigo-600' :
                        inv.status === 'QUOTED' ? 'bg-amber-100 text-amber-800' :
                          inv.status === 'PAYMENT_PENDING' ? 'bg-sky-100 text-sky-800' :
                            inv.status === 'FAILED' ? 'bg-red-50 text-red-600' :
                              'bg-emerald-100 text-emerald-800'
                      }`}>
                      {inv.status === 'SETTLED' ? 'Success' :
                        inv.status === 'FAILED' ? 'Failed' :
                          inv.status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center">
                  <span className="font-bold text-[0.85rem] text-slate-900">
                    - {displayCurrency === 'USD'
                      ? `$ ${(inv.idrAmount / usdToIdrRate).toFixed(2)}`
                      : `Rp ${inv.idrAmount.toLocaleString()}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const tempId = "temp-qr-reader";
      let tempDiv = document.getElementById(tempId);
      if (!tempDiv) {
        tempDiv = document.createElement("div");
        tempDiv.id = tempId;
        tempDiv.style.display = "none";
        document.body.appendChild(tempDiv);
      }

      const html5QrCode = new Html5Qrcode(tempId);
      const decodedText = await html5QrCode.scanFile(file, true);
      console.log("[Gallery Scanner] Decoded QRIS:", decodedText);

      const parsed = parseQRIS(decodedText);
      const invoiceWithNetwork = {
        ...parsed,
        network: stellarNet
      };
      setCurrentInvoice(invoiceWithNetwork);
      setQrisPayload(decodedText);
      setPaymentStatusMessage('');

      try {
        tempDiv.remove();
      } catch (err) { }
    } catch (err: any) {
      console.error(err);
      alert("Failed to decode QR code. Please make sure the image contains a clear QR code.");
    }
  };

  const renderScanTab = () => {
    // If showing personal receive QR code instead of scanner
    if (showReceiveQr) {
      const qrData = receiveAmount
        ? `web+stellar:pay?destination=${walletAddress || ''}&amount=${receiveAmount}`
        : walletAddress || '';
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

      return (
        <div className="animate-fade-in flex flex-col gap-5 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm max-w-sm mx-auto mt-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h3 className="text-[1.1rem] font-bold text-slate-900 m-0">Receive Payments</h3>
            <button className="bg-slate-100 border-none p-1.5 px-3 rounded-lg text-[0.75rem] font-bold cursor-pointer hover:bg-slate-200" onClick={() => setShowReceiveQr(false)}>
              Back to Scanner
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <img src={qrImageUrl} alt="My QR Code" className="w-[200px] h-[200px]" />
            </div>

            <div className="w-full text-center">
              <span className="text-[0.7rem] font-bold text-slate-400">My Wallet Address</span>
              <code className="text-[0.75rem] font-mono break-all block bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-1 select-all cursor-pointer" title="Click to copy" onClick={() => {
                if (walletAddress) {
                  navigator.clipboard.writeText(walletAddress);
                  alert("Wallet address copied to clipboard!");
                }
              }}>
                {walletAddress ? `${walletAddress.slice(0, 16)}...${walletAddress.slice(-16)}` : 'Wallet not connected'}
              </code>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[0.8rem] font-bold text-slate-700">Set Amount (Optional):</label>
            <div className="flex items-center gap-2 border border-slate-200 p-2 px-3 rounded-xl focus-within:border-indigo-600 bg-slate-50">
              <span className="text-slate-500 font-bold text-[0.9rem]">{displayCurrency === 'USD' ? '$' : 'Rp'}</span>
              <input
                type="number"
                placeholder="0.00"
                className="w-full bg-transparent border-none outline-none font-semibold text-[0.9rem] text-slate-900"
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(e.target.value)}
              />
            </div>
            {receiveAmount && (
              <span className="text-[0.65rem] text-slate-400">
                Data: {displayCurrency === 'USD' ? `$ ${receiveAmount}` : `Rp ${parseFloat(receiveAmount).toLocaleString()}`} will be encoded in the request.
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="animate-fade-in flex flex-col gap-4" style={!currentInvoice ? { height: '100%', padding: 0, position: 'relative' } : undefined}>
        {!currentInvoice ? (
          <div className="flex-1 flex flex-col justify-between bg-black relative animate-fade-in" style={{ width: '100%', height: '100%' }}>
            <div className="flex-1 flex flex-col justify-center relative">
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

              {/* Camera Viewport (Centered Square 1:1 Box) */}
              <div className="w-full aspect-square overflow-hidden bg-black flex items-center justify-center">
                <div id="qr-reader" className="w-full h-full"></div>
              </div>
            </div>

            {/* Action Bar (Gallery and Generate QRIS) */}
            <div className="p-5 bg-black border-t border-zinc-800 flex justify-around items-center w-full z-10">
              <input
                type="file"
                id="gallery-input"
                accept="image/*"
                className="hidden"
                onChange={handleGalleryUpload}
              />
              <button
                className="flex flex-col items-center gap-1.5 bg-transparent border-none text-white cursor-pointer hover:text-[#01aed6] transition-colors"
                onClick={() => document.getElementById('gallery-input')?.click()}
              >
                <div className="w-12 h-12 rounded-full bg-[#01aed6] text-white flex items-center justify-center hover:bg-[#0090b3] transition-colors">
                  <Image size={22} />
                </div>
                <span className="text-[0.7rem] font-bold">Gallery</span>
              </button>

              <button
                className="flex flex-col items-center gap-1.5 bg-transparent border-none text-white cursor-pointer hover:text-[#01aed6] transition-colors"
                onClick={() => {
                  if (!walletAddress) {
                    alert("Please connect your Freighter wallet in the profile section first to generate your QR.");
                    navigate('/profile');
                  } else {
                    setShowReceiveQr(true);
                  }
                }}
              >
                <div className="w-12 h-12 rounded-full bg-[#01aed6] text-white flex items-center justify-center hover:bg-[#0090b3] transition-colors">
                  <QrCode size={22} />
                </div>
                <span className="text-[0.7rem] font-bold">My QR Code</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Step Indicators */}
            <div className="flex justify-between bg-white border border-slate-200 p-2.5 px-4 rounded-2xl">
              <span className={`text-[0.75rem] font-bold ${['SCANNED', 'QUOTED'].includes(currentInvoice.status) ? 'text-indigo-600' : ''} ${['PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'text-emerald-600' : 'text-slate-400'}`}>1. Confirmation</span>
              <span className={`text-[0.75rem] font-bold ${currentInvoice.status === 'PAYMENT_PENDING' ? 'text-indigo-600' : ''} ${['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) ? 'text-emerald-600' : 'text-slate-400'}`}>2. Pay</span>
              <span className={`text-[0.75rem] font-bold ${currentInvoice.status === 'SETTLED'
                ? 'text-emerald-600'
                : (['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING'].includes(currentInvoice.status) ? 'text-indigo-600' : 'text-slate-400')
                }`}>3. Payout</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-4 mb-4">
                <Store size={24} className="text-indigo-600" />
                <div className="flex flex-col">
                  <h4 className="text-[0.95rem] font-bold text-slate-900 m-0">{currentInvoice.merchant}</h4>
                  <span className="text-[0.75rem] text-slate-500">{currentInvoice.city}</span>
                </div>
              </div>

              <div className="text-center py-2.5">
                <span className="text-[0.75rem] font-semibold text-slate-500">
                  {displayCurrency === 'USD' ? 'USD Invoice Amount' : 'IDR Invoice Amount'}
                </span>
                {isEditingAmount ? (
                  <div className="flex justify-center items-center gap-1">
                    <span>{displayCurrency === 'USD' ? '$' : 'Rp'}</span>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      className="text-[1.8rem] font-extrabold w-[160px] border border-indigo-600 rounded-lg text-center outline-none"
                      value={displayCurrency === 'USD' ? parseFloat((currentInvoice.idrAmount / usdToIdrRate).toFixed(2)) || '' : currentInvoice.idrAmount || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const finalIdr = displayCurrency === 'USD' ? val * usdToIdrRate : val;
                        setCurrentInvoice(prev => prev ? { ...prev, idrAmount: finalIdr } : null);
                      }}
                      onBlur={() => setIsEditingAmount(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      autoFocus
                    />
                  </div>
                ) : (
                  <h2
                    className={`text-[1.8rem] font-extrabold tracking-[-0.5px] text-slate-900 ${currentInvoice.isEditableAmount && ['SCANNED', 'QUOTED'].includes(currentInvoice.status)
                      ? 'border-b border-dashed border-slate-500 cursor-pointer'
                      : ''
                      }`}
                    onDoubleClick={() =>
                      currentInvoice.isEditableAmount &&
                      ['SCANNED', 'QUOTED'].includes(currentInvoice.status) &&
                      setIsEditingAmount(true)
                    }
                    title={
                      currentInvoice.isEditableAmount && ['SCANNED', 'QUOTED'].includes(currentInvoice.status)
                        ? "Double click to edit"
                        : undefined
                    }
                  >
                    {displayCurrency === 'USD'
                      ? `$ ${(currentInvoice.idrAmount / usdToIdrRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `Rp ${currentInvoice.idrAmount.toLocaleString()}`}
                  </h2>
                )}
                {currentInvoice.isEditableAmount &&
                  ['SCANNED', 'QUOTED'].includes(currentInvoice.status) &&
                  !isEditingAmount && (
                    <span className="text-[0.65rem] text-slate-400 block">Double click amount to change</span>
                  )}
              </div>

              {/* Quote Logic */}
              {['SCANNED', 'QUOTED'].includes(currentInvoice.status) && (
                <div className="flex flex-col">
                  <div className="flex flex-col gap-1 mb-[15px]">
                    <label className="text-[0.75rem] font-bold text-slate-500 block mb-1">Select Stellar Asset</label>
                    <select className="w-full p-2.5 border border-slate-200 rounded-lg text-[0.9rem] outline-none focus:border-indigo-600" value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} disabled={!hasLoadedRates}>
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
                    <div className="bg-indigo-50 rounded-2xl p-4 mt-[15px] flex flex-col gap-2" style={{ marginTop: 0 }}>
                      <div className="flex justify-between text-[0.8rem] text-slate-500">
                        <span>Rate:</span>
                        <strong className="text-slate-900">Rp {currentInvoice.rate?.toLocaleString()}</strong>
                      </div>
                      <div className="flex justify-between text-[0.8rem] text-slate-500">
                        <span>Crypto Amount:</span>
                        <span className="text-slate-900">{currentInvoice.cryptoAmount?.toFixed(4)} {currentInvoice.assetCode}</span>
                      </div>
                      <div className="flex justify-between text-[0.8rem] text-slate-500">
                        <span>Bridge Fee (1%):</span>
                        <span className="text-slate-900">{currentInvoice.fee?.toFixed(4)} {currentInvoice.assetCode}</span>
                      </div>
                      <div className="flex justify-between border-t border-indigo-100 pt-2 mt-1 text-slate-900 text-[0.95rem]">
                        <span>Total Due:</span>
                        <strong className="font-bold">{currentInvoice.total?.toFixed(4)} {currentInvoice.assetCode}</strong>
                      </div>
                      <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200 mt-4" onClick={handleAcceptQuote}>Confirm & Pay Invoice</button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Section */}
              {currentInvoice.status === 'PAYMENT_PENDING' && currentInvoice.total && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <div className="flex gap-2 text-emerald-800 text-[0.75rem] font-semibold mb-3">
                    <AlertCircle size={20} />
                    <span>Send exactly the amount below with the specified Memo ID.</span>
                  </div>

                  <div className="flex flex-col gap-2 bg-white p-3 rounded-lg border border-dashed border-emerald-200 mb-[15px]">
                    <div className="flex flex-col gap-0.5 text-[0.75rem] text-slate-500">
                      <span>Destination Address:</span>
                      <code className="bg-slate-100 p-1 rounded font-mono break-all">{stellarPublicKey.slice(0, 10)}...{stellarPublicKey.slice(-10)}</code>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[0.75rem] text-slate-500">
                      <span>Memo ID (Invoice Ref):</span>
                      <code className="bg-slate-100 p-1 rounded font-mono">{currentInvoice.id}</code>
                    </div>
                    <div className="flex-row justify-between border-t border-emerald-50 pt-2 text-[0.9rem] text-emerald-800 flex items-center">
                      <span>Amount:</span>
                      <strong>{currentInvoice.total?.toFixed(4)} {currentInvoice.assetCode}</strong>
                    </div>
                  </div>

                  <div className="mt-[15px]">
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200" onClick={handleAutoPayStellar} disabled={checkingPayment}>
                      {checkingPayment ? 'Processing...' : walletAddress ? 'Pay' : 'Simulate Auto-Pay (Escrow)'}
                    </button>
                  </div>
                </div>
              )}

              {/* Settlement Progress / Status */}
              {['PAYMENT_CONFIRMED', 'ANCHOR_PROCESSING', 'PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status) && (
                <div className="py-2.5">
                  <div className="text-center mb-5 flex flex-col items-center">
                    <CheckCircle2 size={32} className="text-emerald-600 mb-2" />
                    <h4 className="text-[1rem] font-bold text-emerald-800 m-0">Stellar Payment Verified!</h4>
                    <p className="text-[0.75rem] text-slate-500 mt-1">On-chain payment verified successfully.</p>
                  </div>

                  <div className="flex flex-col gap-5 relative pl-5">
                    <div className="relative">
                      {/* Vertical line connecting Step 1 to Step 2 */}
                      <div className={`absolute -left-[16px] top-3.5 bottom-[-24px] w-[2px] ${['PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status)
                        ? 'bg-indigo-600'
                        : 'bg-slate-200'
                        }`}></div>
                      <div className={`absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full border-2 ${['PAYOUT_PROCESSING', 'SETTLEMENT_PENDING', 'SETTLED'].includes(currentInvoice.status)
                        ? 'bg-indigo-600 border-indigo-600'
                        : (currentInvoice.status === 'ANCHOR_PROCESSING' ? 'bg-white border-indigo-600' : 'bg-white border-slate-300')
                        }`}></div>
                      <div className="flex flex-col gap-1">
                        <h5 className="text-[0.85rem] font-bold text-slate-900 m-0">Anchor Off-ramp Redemption</h5>
                        <p className="text-[0.75rem] text-slate-500 m-0">{currentInvoice.status === 'ANCHOR_PROCESSING' ? 'Processing on-chain conversion...' : 'Fiat cash-out completed'}</p>
                        {currentInvoice.anchorTxHash && (
                          <a href={`${netConfig.explorerBase}/${currentInvoice.anchorTxHash}`} target="_blank" rel="noreferrer" className="text-[0.7rem] text-indigo-600 no-underline inline-flex items-center gap-0.5 mt-1">
                            View Anchor RedTx <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <div className={`absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full border-2 ${currentInvoice.status === 'SETTLED'
                        ? 'bg-indigo-600 border-indigo-600'
                        : (['PAYOUT_PROCESSING', 'SETTLEMENT_PENDING'].includes(currentInvoice.status) ? 'bg-white border-indigo-600' : 'bg-white border-slate-300')
                        }`}></div>
                      <div className="flex flex-col gap-1">
                        <h5 className="text-[0.85rem] font-bold text-slate-900 m-0">Merchant Bank Settlement</h5>
                        <p className="text-[0.75rem] text-slate-500 m-0">
                          {currentInvoice.status === 'SETTLED' ? 'Merchant settled' :
                            (currentInvoice.status === 'SETTLEMENT_PENDING' ? 'Awaiting checkout payment completion...' :
                              'Creating settlement invoice...')}
                        </p>
                        {currentInvoice.mayarSettlementPaymentUrl && currentInvoice.status === 'SETTLEMENT_PENDING' && (
                          <div className="flex gap-2 mt-2">
                            <a href={currentInvoice.mayarSettlementPaymentUrl} target="_blank" rel="noreferrer" className="bg-indigo-600 text-white no-underline py-1.5 px-3 rounded font-bold text-[0.75rem] inline-flex items-center gap-1">
                              Pay Merchant Invoice via Mayar <ExternalLink size={14} />
                            </a>
                          </div>
                        )}
                        {currentInvoice.mayarSettlementInvoiceId && (
                          <span className="text-[0.65rem] text-slate-400 block mt-1">Mayar Invoice Ref: {currentInvoice.mayarSettlementInvoiceId}</span>
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
    if (!walletAddress) {
      return (
        <div className="animate-fade-in flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <Coins size={48} className="text-slate-400" />
          <h3 className="m-0 text-slate-900 font-bold text-[1.1rem]">No assets to show</h3>
          <p className="m-0 text-slate-500 text-[0.9rem]">Connect your Freighter wallet to view your crypto assets.</p>
          <button className="w-full max-w-[200px] bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200" onClick={handleConnectWallet} disabled={isConnectingWallet}>
            {isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      );
    }

    const hasLoadedRates = rates.USDC > 0 && rates.XLM > 0;
    const usdcVal = parseFloat(usdcBalance) || 0;
    const xlmVal = parseFloat(xlmBalance) || 0;
    const usdcEstIdr = hasLoadedRates ? (usdcVal * rates.USDC) : (usdcVal * usdToIdrRate);
    const xlmEstIdr = hasLoadedRates ? (xlmVal * rates.XLM) : 0;
    const totalEstIdr = usdcEstIdr + xlmEstIdr;
    const totalEstUsd = hasLoadedRates ? (totalEstIdr / rates.USDC) : (usdcVal + (xlmVal * 0.1823));

    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <div>
          <h3 className="text-[1.1rem] font-bold text-slate-900 mb-2 tracking-[-0.3px]">Crypto Assets</h3>
          <p className="text-[0.85rem] text-slate-500">Manage and monitor your Stellar stablecoins and tokens.</p>
        </div>

        {/* Dynamic flat card */}
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
          <span className="text-[0.8rem] text-slate-500 font-bold block mb-1">Estimated Balance</span>
          <h2 className="text-[1.8rem] font-extrabold text-slate-900 m-0">
            {displayCurrency === 'USD'
              ? `$ ${totalEstUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Rp ${totalEstIdr.toLocaleString()}`}
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {/* USDC asset card */}
          <div className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png" alt="USDC Logo" className="w-10 h-10 rounded-full" />
              <div className="flex flex-col">
                <h4 className="m-0 text-[0.95rem] font-bold text-slate-900">USD Coin</h4>
                <span className="text-[0.75rem] text-slate-500">USDC Stablecoin</span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-[0.95rem] text-slate-900">{usdcVal.toFixed(2)} USDC</div>
              <span className="text-[0.75rem] text-slate-500">
                {displayCurrency === 'USD' ? `$ ${usdcVal.toFixed(2)}` : `Rp ${usdcEstIdr.toLocaleString()}`}
              </span>
            </div>
          </div>

          {/* XLM asset card */}
          <div className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/black/xlm.png" alt="XLM Logo" className="w-10 h-10 rounded-full" />
              <div className="flex flex-col">
                <h4 className="m-0 text-[0.95rem] font-bold text-slate-900">Stellar Lumens</h4>
                <span className="text-[0.75rem] text-slate-500">XLM Native</span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-[0.95rem] text-slate-900">{xlmVal.toFixed(2)} XLM</div>
              <span className="text-[0.75rem] text-slate-500">
                {displayCurrency === 'USD'
                  ? `$ ${(rates.USDC > 0 ? (xlmVal * rates.XLM / rates.USDC) : (xlmVal * 0.1823)).toFixed(2)}`
                  : `Rp ${xlmEstIdr.toLocaleString()}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProfileTab = () => {
    if (!walletAddress) {
      return (
        <div className="animate-fade-in flex flex-col gap-6">
          <h3 className="text-[1.1rem] font-bold text-slate-900 mb-3 tracking-[-0.3px]">Wallet & Configurations</h3>
          {renderWalletSelectionView()}
        </div>
      );
    }

    return (
      <div className="animate-fade-in flex flex-col gap-6">
        <h3 className="text-[1.1rem] font-bold text-slate-900 mb-3 tracking-[-0.3px]">Wallet & Configurations</h3>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl">
          <div className="flex flex-col gap-4 bg-indigo-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 text-indigo-600">
              <Wallet size={36} />
              <div className="flex flex-col">
                <span className="text-[0.65rem] font-bold uppercase">{isEmbeddedWallet ? 'Embedded Wallet' : 'Freighter Wallet'}</span>
                <code className="text-[0.75rem] font-mono break-all">{walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}</code>
              </div>
            </div>
            {isEmbeddedWallet && (
              <div className="text-[0.7rem] text-slate-500 font-mono bg-white p-2.5 rounded border border-slate-200 select-all cursor-pointer break-all" title="Click to copy your Secret Key" onClick={() => { navigator.clipboard.writeText(embeddedSecretKey || ''); alert('Secret Key copied to clipboard!'); }}>
                <strong>Secret Key:</strong> {embeddedSecretKey?.slice(0, 8)}... (Click to copy)
              </div>
            )}
            <button className="w-full bg-red-50 text-red-600 border border-red-100 p-2.5 rounded-lg text-[0.8rem] font-bold cursor-pointer transition-colors duration-200 text-center hover:bg-red-600 hover:text-white" onClick={handleDisconnectWallet}>
              Disconnect Wallet
            </button>
          </div>
        </div>

        {walletAddress && (
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col gap-4">
            <h4 className="text-[0.9rem] text-slate-900 font-bold m-0">Environment Configurations</h4>
            <div className="flex justify-between items-center text-[0.85rem]">
              <span>Network Environment:</span>
              {walletAddress ? (
                <span className="font-bold text-slate-800 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg text-[0.8rem] inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {stellarNet === 'mainnet' ? 'Mainnet' : 'Testnet'}
                </span>
              ) : (
                <select
                  className="w-[160px] p-1.5 px-2.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-600"
                  value={stellarNet}
                  onChange={(e) => {
                    const network = e.target.value as 'testnet' | 'mainnet';
                    setStellarNet(network);
                    setMayarEnv(network === 'mainnet' ? 'production' : 'sandbox');
                  }}
                >
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              )}
            </div>
            <div className="flex justify-between items-center text-[0.85rem]">
              <span>Display Currency:</span>
              <select className="w-[160px] p-1.5 px-2.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-600" value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as 'USD' | 'IDR')}>
                <option value="IDR">IDR (Rp)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isInitializing) {
    return (
      <div className="flex justify-center items-center w-screen h-screen max-[480px]:h-[100dvh] bg-black">
        <div className="w-full max-w-[425px] h-screen max-[480px]:h-[100dvh] max-h-[860px] max-[480px]:max-h-[100dvh] bg-slate-50 relative flex flex-col justify-center items-center gap-5">
          <img src="/favicon.png" alt="Lintas Logo" className="w-24 h-24 object-contain animate-pulse" />
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (isFaucetPage) {
    return (
      <div className="flex justify-center items-center w-screen h-screen max-[480px]:h-[100dvh]">
        <div className="w-full max-w-[425px] h-screen max-[480px]:h-[100dvh] max-h-[860px] max-[480px]:max-h-[100dvh] bg-slate-50 relative flex flex-col overflow-hidden">
          <header className="h-[72px] px-6 flex justify-between items-center bg-white border-b border-slate-200 z-10">
            <div className="flex items-center gap-2">
              <Wallet className="text-indigo-600" size={24} />
              <h1 className="text-[1.25rem] font-extrabold text-slate-900 tracking-[-0.5px] m-0">USDC Faucet</h1>
            </div>
            <button className="bg-slate-100 border-none py-1.5 px-3 rounded-md font-bold text-[0.75rem] cursor-pointer" onClick={() => navigate('/')}>Back</button>
          </header>

          <main className="flex-1 overflow-y-auto p-5 pb-[90px] scroll-smooth">
            <div className="animate-fade-in flex flex-col gap-6">
              <div>
                <h3 className="text-[1.1rem] font-bold text-slate-900 mb-3 tracking-[-0.3px] m-0">Stellar Testnet USDC Faucet</h3>
                <p className="text-[0.85rem] text-slate-500 mt-1">Request test tokens directly into your connected Freighter wallet.</p>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-2xl">
                <h4 className="text-[0.9rem] text-slate-900 font-bold mb-3 mt-0">Faucet Dispenser</h4>
                {walletAddress ? (
                  <div>
                    <div className="flex flex-col gap-4 bg-indigo-50 p-4 rounded-lg mb-4">
                      <div className="flex items-center gap-2 text-indigo-600">
                        <Wallet size={36} />
                        <div className="flex flex-col">
                          <span className="text-[0.65rem] font-bold uppercase">Target Wallet</span>
                          <code className="text-[0.75rem] font-mono break-all">{walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}</code>
                        </div>
                      </div>
                    </div>
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200" onClick={handleSwapXLMToUSDC} disabled={checkingPayment}>
                      {checkingPayment ? 'Processing Faucet...' : 'Get 100 USDC Testnet'}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <p style={{ marginBottom: '15px', color: '#64748b', fontSize: '0.85rem' }}>
                      Please connect your Freighter wallet in the profile section to receive test tokens.
                    </p>
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-none p-3 rounded-lg font-bold text-[0.9rem] cursor-pointer transition-colors duration-200" onClick={() => navigate('/profile')}>
                      Go to Connect Wallet
                    </button>
                  </div>
                )}
              </div>

              {paymentStatusMessage && (
                <div className="bg-slate-800 text-sky-400 p-3 rounded-2xl mt-4 animate-fade-in">
                  <h5 className="text-white text-[0.75rem] mb-1.5 mt-0">Log Console</h5>
                  <pre className="font-mono text-[0.65rem] whitespace-pre-wrap bg-none border-none p-0 m-0">{paymentStatusMessage}</pre>
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
    <div className="flex justify-center items-center w-screen h-screen max-[480px]:h-[100dvh] bg-black">
      {/* Mobile Shell Frame */}
      <div className="w-full max-w-[425px] h-screen max-[480px]:h-[100dvh] max-h-[860px] max-[480px]:max-h-[100dvh] bg-slate-50 relative flex flex-col overflow-hidden" style={isScanningActive ? { overflow: 'hidden' } : undefined}>

        <main className="flex-1 overflow-y-auto p-5 pb-[90px] scroll-smooth" style={isScanningActive ? { padding: 0, paddingBottom: 0, overflow: 'hidden', height: '100%' } : undefined}>
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'tokens' && renderTokensTab()}
          {activeTab === 'scan' && renderScanTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'profile' && renderProfileTab()}
        </main>

        {!isScanningActive && (
          <nav className="absolute bottom-0 left-0 w-full h-20 bg-white/90 backdrop-blur-md border-t border-slate-200 grid grid-cols-[1fr_1fr_64px_1fr_1fr] items-center px-2 z-20">
            <button className={`bg-transparent border-none outline-none flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 text-[0.7rem] font-semibold ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`} onClick={() => navigate('/')}>
              <Home size={22} />
              <span>Home</span>
            </button>
            <button className={`bg-transparent border-none outline-none flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 text-[0.7rem] font-semibold ${activeTab === 'tokens' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`} onClick={() => navigate('/tokens')}>
              <Coins size={22} />
              <span>Tokens</span>
            </button>

            <div className="relative flex flex-col items-center -mt-16">
              <button className={`w-[72px] h-[72px] rounded-full text-white border border-slate-200 cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-indigo-700 ${activeTab === 'scan' ? 'bg-indigo-700' : 'bg-indigo-600'}`} onClick={() => { setCurrentInvoice(null); navigate('/scan'); }}>
                <QrCode size={32} />
              </button>
            </div>

            <button className={`bg-transparent border-none outline-none flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 text-[0.7rem] font-semibold ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`} onClick={() => navigate('/history')}>
              <History size={22} />
              <span>History</span>
            </button>
            <button className={`bg-transparent border-none outline-none flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 text-[0.7rem] font-semibold ${activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`} onClick={() => navigate('/profile')}>
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
