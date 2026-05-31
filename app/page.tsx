"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Toaster, toast } from "react-hot-toast";

declare global {
  interface Window {
    ethereum?: any;
  }
}

/* ── Chain config ─────────────────────────────────────────── */
const ARC_CHAIN_ID = "0x491";
const RPC_URL      = "https://rpc.testnet.arc.network";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const TOKENS: Record<string, { address: string; decimals: number; color: string }> = {
  USDC: { address: USDC_ADDRESS, decimals: 6, color: "#2775CA" },
  EURC: { address: EURC_ADDRESS, decimals: 6, color: "#1A56DB" },
};

/* ── Types ────────────────────────────────────────────────── */
interface TxRecord {
  to: string;
  amount: string;
  token: string;
  memo: string;
  hash: string;
  timestamp: number;
}

/* ── Helpers ──────────────────────────────────────────────── */
const short = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 60_000)   return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/* ══════════════════════════════════════════════════════════ */
export default function Home() {
  const [account,  setAccount]  = useState("");
  const [balances, setBalances] = useState<Record<string, string>>({ USDC: "0.00", EURC: "0.00" });
  const [to,       setTo]       = useState("");
  const [amount,   setAmount]   = useState("");
  const [token,    setToken]    = useState("USDC");
  const [memo,     setMemo]     = useState("");
  const [fee,      setFee]      = useState("0.0000");
  const [loading,  setLoading]  = useState(false);
  const [txHash,   setTxHash]   = useState("");
  const [history,  setHistory]  = useState<TxRecord[]>([]);
  const [tab,      setTab]      = useState<"send" | "history">("send");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  /* ── Fetch balances ──────────────────────────────────── */
  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const results: Record<string, string> = {};
      for (const [symbol, cfg] of Object.entries(TOKENS)) {
        const contract = new ethers.Contract(cfg.address, ERC20_ABI, provider);
        const raw      = await contract.balanceOf(addr);
        const fmt      = ethers.formatUnits(raw, cfg.decimals);
        results[symbol] = Number(fmt).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });
      }
      setBalances(results);
    } catch {
      /* silently ignore */
    }
  }, []);

  /* ── Init ────────────────────────────────────────────── */
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts[0]) { setAccount(accounts[0]); fetchBalances(accounts[0]); }
    });
    window.ethereum.on("accountsChanged", (accounts: string[]) => {
      setAccount(accounts[0] || "");
    });
  }, []);

  useEffect(() => {
    if (account) fetchBalances(account);
  }, [account]);

  /* ── Switch chain ────────────────────────────────────── */
  const switchToArc = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_CHAIN_ID }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ARC_CHAIN_ID,
            chainName: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: ["https://testnet.arcscan.app"],
          }],
        });
      }
    }
  };

  /* ── Connect ─────────────────────────────────────────── */
  const connectWallet = async () => {
    if (!window.ethereum) { toast.error("Instale a MetaMask"); return; }
    await switchToArc();
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(accounts[0]);
    toast.success("Carteira conectada!");
  };

  /* ── Estimate fee ────────────────────────────────────── */
  useEffect(() => {
    if (!to || !amount || !account) { setFee("0.0000"); return; }
    (async () => {
      try {
        const bp      = new ethers.BrowserProvider(window.ethereum);
        const signer  = await bp.getSigner();
        const cfg     = TOKENS[token];
        const contract = new ethers.Contract(cfg.address, ERC20_ABI, signer);
        const value   = ethers.parseUnits(amount, cfg.decimals);
        const gas     = await contract.transfer.estimateGas(ethers.getAddress(to), value);
        const feeData = await bp.getFeeData();
        const gasPrice = feeData.gasPrice ?? ethers.parseUnits("20", "gwei");
        const total   = gas * gasPrice;
        setFee(Number(ethers.formatUnits(total, 18)).toFixed(4));
      } catch {
        setFee("0.0000");
      }
    })();
  }, [amount, to, token, account]);

  /* ── Send ────────────────────────────────────────────── */
  const send = async () => {
    if (!ethers.isAddress(to))  { toast.error("Endereço inválido"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Informe um valor"); return; }

    setLoading(true);
    try {
      const bp      = new ethers.BrowserProvider(window.ethereum);
      const signer  = await bp.getSigner();
      const cfg     = TOKENS[token];
      const contract = new ethers.Contract(cfg.address, ERC20_ABI, signer);
      const value   = ethers.parseUnits(amount, cfg.decimals);

      const tx = await contract.transfer(ethers.getAddress(to), value, {
        maxFeePerGas:         ethers.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1",  "gwei"),
      });

      setTxHash(tx.hash);
      toast.loading("Enviando...", { id: "tx" });
      await tx.wait();
      toast.success("Transferência concluída!", { id: "tx" });

      setHistory(prev => [{
        to, amount, token, memo,
        hash: tx.hash,
        timestamp: Date.now(),
      }, ...prev]);

      setTo(""); setAmount(""); setMemo("");
      fetchBalances(account);
    } catch {
      toast.error("Erro na transação");
    } finally {
      setLoading(false);
    }
  };

  /* ── UI ──────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: #e8eaf0;
          min-height: 100vh;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px 16px;
        }

        /* ── Phone shell ── */
        .wallet {
          width: 380px;
          background: #f2f3f5;
          border-radius: 36px;
          border: 1.5px solid #c4c8d4;
          overflow: hidden;
          box-shadow: 0 2px 0 #b0b5c2;
        }

        /* ── Header ── */
        .header {
          background: #3a6cc8;
          padding: 28px 24px 20px;
          color: #fff;
        }
        .header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .network-badge {
          font-size: 10px;
          color: rgba(255,255,255,0.65);
          background: rgba(255,255,255,0.12);
          border-radius: 8px;
          padding: 3px 10px;
          letter-spacing: .04em;
        }
        .addr-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.14);
          border: 0.5px solid rgba(255,255,255,0.2);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-family: 'DM Mono', monospace;
          color: rgba(255,255,255,0.9);
          cursor: pointer;
          transition: background .15s;
        }
        .addr-pill:hover { background: rgba(255,255,255,0.2); }
        .status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #7ee8a2;
          flex-shrink: 0;
        }

        /* balance */
        .balance-wrap { text-align: center; padding: 4px 0 20px; }
        .balance-label {
          font-size: 10px;
          color: rgba(255,255,255,0.55);
          text-transform: uppercase;
          letter-spacing: .1em;
          margin-bottom: 6px;
        }
        .balance-amount {
          font-size: 42px;
          font-weight: 500;
          color: #fff;
          letter-spacing: -1.5px;
          line-height: 1;
        }
        .balance-ticker {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin-top: 4px;
        }

        /* balance pills row */
        .balance-tokens {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-top: 10px;
        }
        .token-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.10);
          border: 0.5px solid rgba(255,255,255,0.18);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 11px;
          color: rgba(255,255,255,0.8);
        }
        .token-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
        }

        /* action buttons */
        .actions-row {
          display: flex;
          gap: 8px;
          margin-top: 20px;
        }
        .action-btn {
          flex: 1;
          background: rgba(255,255,255,0.12);
          border: 0.5px solid rgba(255,255,255,0.2);
          border-radius: 14px;
          padding: 10px 4px 8px;
          text-align: center;
          cursor: pointer;
          transition: background .15s;
        }
        .action-btn:hover { background: rgba(255,255,255,0.2); }
        .action-btn svg {
          display: block;
          margin: 0 auto 4px;
          color: #fff;
        }
        .action-btn span {
          font-size: 10px;
          color: rgba(255,255,255,0.65);
          font-family: 'DM Sans', sans-serif;
        }

        /* ── Body ── */
        .body { padding: 20px; }

        /* tab bar */
        .tab-bar {
          display: flex;
          border-bottom: 1px solid #c8cdd8;
          margin-bottom: 16px;
        }
        .tab-item {
          flex: 1;
          text-align: center;
          padding: 8px 0;
          font-size: 12px;
          color: #6b7280;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color .15s, border-color .15s;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          font-family: 'DM Sans', sans-serif;
        }
        .tab-item.active {
          color: #3a6cc8;
          border-bottom-color: #3a6cc8;
          font-weight: 500;
        }

        /* form */
        .field { margin-bottom: 10px; }
        .field label {
          display: block;
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 4px;
          letter-spacing: .02em;
        }
        .field input, .field select {
          width: 100%;
          background: #fff;
          border: 1px solid #c8cdd8;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
          outline: none;
          transition: border-color .15s;
        }
        .field input:focus, .field select:focus {
          border-color: #3a6cc8;
        }
        .field input::placeholder { color: #b0b7c3; }
        .field-row { display: flex; gap: 8px; }
        .field-row .field { flex: 1; }
        .field-row .field.token { flex: 0 0 88px; }

        /* fee row */
        .fee-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0 4px;
          font-size: 11px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
        }
        .fee-row span.val {
          color: #3a6cc8;
          font-weight: 500;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
        }

        /* send button */
        .send-btn {
          width: 100%;
          background: #3a6cc8;
          border: none;
          border-radius: 12px;
          padding: 12px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          color: #fff;
          cursor: pointer;
          margin-top: 10px;
          transition: background .15s, transform .1s;
          letter-spacing: .01em;
        }
        .send-btn:hover:not(:disabled) { background: #2f5bb5; }
        .send-btn:active:not(:disabled) { transform: scale(.98); }
        .send-btn:disabled { opacity: .6; cursor: not-allowed; }

        /* tx hash link */
        .tx-link {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #3a6cc8;
          text-decoration: none;
          margin-top: 10px;
          padding: 8px 10px;
          background: #eef3fc;
          border-radius: 8px;
          border: 1px solid #c5d4f0;
          font-family: 'DM Mono', monospace;
          word-break: break-all;
        }
        .tx-link:hover { background: #dce8fa; }

        /* history */
        .tx-list { display: flex; flex-direction: column; gap: 8px; }
        .tx-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: #fff;
          border-radius: 12px;
          border: 1px solid #c8cdd8;
          text-decoration: none;
          transition: border-color .15s;
        }
        .tx-item:hover { border-color: #3a6cc8; }

        .tx-icon {
          width: 34px; height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 16px;
        }
        .tx-icon.out { background: #fff0ee; color: #e05a3a; }
        .tx-icon.in  { background: #eef3fc; color: #3a6cc8; }

        .tx-info { flex: 1; min-width: 0; }
        .tx-addr {
          font-size: 12px;
          font-weight: 500;
          color: #111827;
          font-family: 'DM Mono', monospace;
        }
        .tx-memo {
          font-size: 10px;
          color: #9ca3af;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }

        .tx-right { text-align: right; flex-shrink: 0; }
        .tx-amount {
          font-size: 13px;
          font-weight: 500;
          font-family: 'DM Mono', monospace;
        }
        .tx-amount.out { color: #e05a3a; }
        .tx-amount.in  { color: #3a6cc8; }
        .tx-time { font-size: 10px; color: #9ca3af; margin-top: 2px; }

        .empty-state {
          text-align: center;
          padding: 32px 0;
          color: #9ca3af;
          font-size: 13px;
        }

        /* connect button */
        .connect-btn {
          width: 100%;
          background: #3a6cc8;
          border: none;
          border-radius: 12px;
          padding: 12px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          color: #fff;
          cursor: pointer;
          margin-top: 20px;
          transition: background .15s;
          letter-spacing: .01em;
        }
        .connect-btn:hover { background: #2f5bb5; }
      `}</style>

      <Toaster position="top-center" toastOptions={{ style: { fontFamily: "'DM Sans', sans-serif", fontSize: 13 } }} />

      <div className="wallet">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-top">
            <span className="network-badge">Arc Testnet</span>
            {account ? (
              <div className="addr-pill">
                <span className="status-dot" />
                {short(account)}
              </div>
            ) : (
              <button className="connect-btn" style={{ marginTop: 0, padding: "4px 14px", width: "auto", fontSize: 12 }} onClick={connectWallet}>
                Conectar
              </button>
            )}
          </div>

          <div className="balance-wrap">
            <div className="balance-label">saldo disponível</div>
            <div className="balance-amount">{balances[token]}</div>
            <div className="balance-ticker">{token}</div>

            <div className="balance-tokens">
              {Object.entries(TOKENS).map(([sym, cfg]) => (
                <div key={sym} className="token-pill" style={{ cursor: "pointer", opacity: token === sym ? 1 : 0.6 }} onClick={() => setToken(sym)}>
                  <span className="token-dot" style={{ background: cfg.color }} />
                  {sym} {balances[sym]}
                </div>
              ))}
            </div>
          </div>

          <div className="actions-row">
            {[
              { label: "Enviar",    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>, action: () => setTab("send") },
              { label: "Receber",  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>, action: () => {} },
              { label: "Trocar",   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>, action: () => {} },
              { label: "Histórico", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, action: () => setTab("history") },
            ].map(btn => (
              <div key={btn.label} className="action-btn" onClick={btn.action}>
                {btn.icon}
                <span>{btn.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="body">
          <div className="tab-bar">
            <button className={`tab-item ${tab === "send" ? "active" : ""}`}    onClick={() => setTab("send")}>Transferir</button>
            <button className={`tab-item ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
              Histórico {history.length > 0 && `(${history.length})`}
            </button>
          </div>

          {/* ── Send tab ── */}
          {tab === "send" && (
            <>
              <div className="field">
                <label>Destino</label>
                <input
                  placeholder="0x..."
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Valor</label>
                  <input
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="field token">
                  <label>Token</label>
                  <select value={token} onChange={e => setToken(e.target.value)}>
                    {Object.keys(TOKENS).map(sym => <option key={sym}>{sym}</option>)}
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Mensagem (opcional)</label>
                <input
                  placeholder="Para que é esse pagamento?"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                />
              </div>

              <div className="fee-row">
                <span>Taxa estimada</span>
                <span className="val">~{fee} USDC</span>
              </div>

              {account ? (
                <button className="send-btn" onClick={send} disabled={loading}>
                  {loading ? "Enviando..." : `Transferir ${token}`}
                </button>
              ) : (
                <button className="connect-btn" onClick={connectWallet}>
                  Conectar carteira
                </button>
              )}

              {txHash && (
                <a
                  className="tx-link"
                  href={`https://testnet.arcscan.app/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {short(txHash)} — ver no ArcScan
                </a>
              )}
            </>
          )}

          {/* ── History tab ── */}
          {tab === "history" && (
            <div className="tx-list">
              {history.length === 0 ? (
                <div className="empty-state">Nenhuma transação ainda.</div>
              ) : (
                history.map((tx, i) => (
                  <a
                    key={i}
                    className="tx-item"
                    href={`https://testnet.arcscan.app/tx/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="tx-icon out">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </div>
                    <div className="tx-info">
                      <div className="tx-addr">{short(tx.to)}</div>
                      {tx.memo && <div className="tx-memo">{tx.memo}</div>}
                    </div>
                    <div className="tx-right">
                      <div className="tx-amount out">-{tx.amount} {tx.token}</div>
                      <div className="tx-time">{timeAgo(tx.timestamp)}</div>
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
