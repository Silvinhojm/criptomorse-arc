
"use client";

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { Toaster, toast } from "react-hot-toast";

declare global {
  interface Window { ethereum?: any; }
}

const RPC_URL         = "https://rpc.testnet.arc.network";
const USDC_ADDRESS    = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS    = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ERC8183_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583";
const GOLDSKY_URL     = "https://api.goldsky.com/api/public/project_cmpngw40w7ra701wo7299675h/subgraphs/arc-erc8183/1.0.0/gn";

const BLUE   = "#3a6cc8";
const ORANGE = "#e05a3a";
const BORDER = "#c8cdd8";
const short  = (a: string) => a ? a.slice(0, 6) + "..." + a.slice(-4) : "";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const ERC8183_ABI = [
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function fund(uint256 jobId, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
];

const STATUS_COLORS: Record<string, string> = {
  Open: "#6b7280", Funded: "#2775CA", Submitted: "#e05a3a",
  Completed: "#16a34a", Rejected: "#dc2626", Expired: "#9ca3af",
};

async function fetchJobsFromGoldsky(address: string): Promise<any[]> {
  try {
    const addr  = address.toLowerCase();
    const query = `{
      asClient: jobs(where:{client:"${addr}"},orderBy:createdAt,orderDirection:desc,first:20){
        id status budget description provider evaluator expiredAt createdAt updatedAt
      }
      asProvider: jobs(where:{provider:"${addr}"},orderBy:createdAt,orderDirection:desc,first:20){
        id status budget description provider evaluator expiredAt createdAt updatedAt
      }
    }`;
    const res  = await fetch(GOLDSKY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const data = await res.json();
    if (data.errors) return [];
    const all  = [...(data.data?.asClient || []), ...(data.data?.asProvider || [])];
    const seen = new Set<string>();
    return all
      .filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true; })
      .map(j => ({ ...j, statusName: j.status, budget: BigInt(j.budget || "0") }));
  } catch { return []; }
}

function QRCode({ value, size = 180 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1a1a2e&margin=10`;
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
      <img src={url} alt="QR Code" width={size} height={size}
        style={{ borderRadius: 12, border: "3px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }} />
    </div>
  );
}

function ReceiveModal({ account, onClose }: { account: string; onClose: () => void }) {
  const copy = () => { navigator.clipboard.writeText(account); toast.success("Endereço copiado!"); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, padding: 24, width: 340 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Receber USDC</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Escaneie o QR code ou copie o endereço</p>
        <QRCode value={account} size={200} />
        <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 12, wordBreak: "break-all", fontFamily: "monospace", fontSize: 11, color: "#374151", border: "1px solid #e2e8f0" }}>
          {account}
        </div>
        <button onClick={copy} style={{ width: "100%", background: BLUE, color: "#fff", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          📋 Copiar endereço
        </button>
      </div>
    </div>
  );
}

// ─── SwapModal via botão LI.FI ────────────────────────────────────────────────
function SwapModal({ account, onClose }: { account: string; onClose: () => void }) {
  const url = `https://widget.li.fi/home?toChain=1169&toToken=0x3600000000000000000000000000000000000000&integrator=arcflow-criptomorse${account ? `&toAddress=${account}` : ""}`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, padding: 28, width: 360, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>🔄 Trocar tokens</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 20, border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>💵</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>USDC</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Qualquer rede</div>
            </div>
            <div style={{ fontSize: 22, color: BLUE }}>→</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>🔵</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>USDC</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Arc Testnet</div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
          O widget LI.FI abrirá em nova aba com Arc Testnet já selecionado como destino.
          {account && <><br/><span style={{ color: BLUE, fontFamily: "monospace" }}>→ {short(account)}</span></>}
        </p>
        <button onClick={() => { window.open(url, "_blank"); onClose(); }}
          style={{ width: "100%", background: BLUE, color: "#fff", padding: 13, borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
          Abrir LI.FI Widget ↗
        </button>
        <button onClick={onClose}
          style={{ width: "100%", background: "#e5e7eb", color: "#374151", padding: 11, borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 600 }}>
          Cancelar
        </button>
        <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 12, marginBottom: 0 }}>Powered by LI.FI · Cross-chain routing</p>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function CreateJobModal({ account, onClose, onCreated }: { account: string; onClose: () => void; onCreated: () => void }) {
  const [provider, setProvider]       = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget]           = useState("");
  const [loading, setLoading]         = useState(false);

  const create = async () => {
    if (!provider || !description || !budget) { toast.error("Preencha todos os campos"); return; }
    setLoading(true);
    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const signer       = await web3Provider.getSigner();
      const usdc         = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const erc8183      = new ethers.Contract(ERC8183_ADDRESS, ERC8183_ABI, signer);
      const amt          = ethers.parseUnits(budget, 6);
      const expiredAt    = Math.floor(Date.now() / 1000) + 86400 * 7;
      toast.loading("Aprovando USDC...", { id: "job" });
      const approveTx = await usdc.approve(ERC8183_ADDRESS, amt);
      await approveTx.wait();
      toast.loading("Criando Job...", { id: "job" });
      const tx = await erc8183.createJob(provider, account, expiredAt, description, ethers.ZeroAddress);
      await tx.wait();
      toast.success("Job criado!", { id: "job" });
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.reason || "Erro ao criar job", { id: "job" });
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, padding: 24, width: 360 }}>
        <button onClick={onClose} style={{ float: "right", background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        <h3 style={{ marginBottom: 16 }}>Criar Job ERC-8183</h3>
        <input placeholder="Provider (0x...)" value={provider} onChange={e => setProvider(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginBottom: 10, boxSizing: "border-box" }} />
        <input placeholder="Descrição do job" value={description} onChange={e => setDescription(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginBottom: 10, boxSizing: "border-box" }} />
        <input placeholder="Budget (USDC)" type="number" value={budget} onChange={e => setBudget(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginBottom: 14, boxSizing: "border-box" }} />
        <button onClick={create} disabled={loading}
          style={{ width: "100%", background: ORANGE, color: "#fff", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 600 }}>
          {loading ? "Processando..." : "Criar Job"}
        </button>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: any }) {
  const color = STATUS_COLORS[job.statusName] || "#6b7280";
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>Job #{job.id?.slice(-5)}</span>
        <span style={{ fontSize: 11, background: color + "22", color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{job.statusName}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{job.description || "(sem descrição)"}</div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        🔥 {ethers.formatUnits(job.budget || 0, 6)} USDC &nbsp;·&nbsp;
        👤 Provider: {short(job.provider || "")}
      </div>
      <a href={`https://explorer.testnet.arc.network/tx/${job.id}`} target="_blank" rel="noreferrer"
        style={{ fontSize: 11, color: BLUE, textDecoration: "none", display: "inline-block", marginTop: 6 }}>🔍 ArcScan</a>
    </div>
  );
}

export default function Home() {
  const [account, setAccount]         = useState("");
  const [usdcBal, setUsdcBal]         = useState(0n);
  const [eurcBal, setEurcBal]         = useState(0n);
  const [tab, setTab]                 = useState<"send"|"history"|"jobs">("send");
  const [modal, setModal]             = useState<""|"receive"|"swap"|"createJob">("");
  const [jobs, setJobs]               = useState<any[]>([]);
  const [history, setHistory]         = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [dest, setDest]               = useState("");
  const [amount, setAmount]           = useState("");
  const [token, setToken]             = useState<"USDC"|"EURC">("USDC");
  const [memo, setMemo]               = useState("");
  const [sending, setSending]         = useState(false);

  const loadBalances = useCallback(async (addr: string) => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const usdc     = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const eurc     = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
      const [u, e]   = await Promise.all([usdc.balanceOf(addr), eurc.balanceOf(addr)]);
      setUsdcBal(u);
      setEurcBal(e);
    } catch {}
  }, []);

  const loadJobs = useCallback(async (addr: string) => {
    setLoadingJobs(true);
    const data = await fetchJobsFromGoldsky(addr);
    setJobs(data);
    setLoadingJobs(false);
  }, []);

  const connect = async () => {
    if (!window.ethereum) { toast.error("MetaMask não encontrado"); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      setAccount(addr);
      toast.success("Carteira conectada!");
      await loadBalances(addr);
      await loadJobs(addr);
    } catch (e: any) {
      if (e.code === 4001) {
        toast.error("Conexão cancelada");
      } else {
        toast.error("Erro ao conectar");
        console.error(e);
      }
    }
  };

  const send = async () => {
    if (!dest || !amount) { toast.error("Preencha destino e valor"); return; }
    setSending(true);
    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const signer       = await web3Provider.getSigner();
      const addr         = token === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
      const contract     = new ethers.Contract(addr, ERC20_ABI, signer);
      const parsed       = ethers.parseUnits(amount, 6);
      toast.loading("Enviando...", { id: "send" });
      const tx = await contract.transfer(dest, parsed);
      await tx.wait();
      toast.success("Enviado!", { id: "send" });
      setHistory(h => [{ hash: tx.hash, to: dest, amount, token, memo, time: new Date().toLocaleTimeString() }, ...h]);
      setDest(""); setAmount(""); setMemo("");
      await loadBalances(account);
    } catch (e: any) {
      toast.error(e?.reason || "Erro ao enviar", { id: "send" });
    }
    setSending(false);
  };

  const usdcDisplay = parseFloat(ethers.formatUnits(usdcBal, 6)).toFixed(6);
  const eurcDisplay = parseFloat(ethers.formatUnits(eurcBal, 6)).toFixed(6);
  const feeEstimate = amount ? (parseFloat(amount) * 0.0001).toFixed(4) : "0.0000";

  return (
    <div style={{ minHeight: "100vh", background: "#eef0f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Toaster position="top-center" />
      <div style={{ width: 380, borderRadius: 28, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.13)" }}>
        <div style={{ background: "linear-gradient(135deg, #3a6cc8 0%, #2952a3 100%)", padding: "20px 20px 28px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: 8 }}>Arc Testnet</span>
            {account ? (
              <span style={{ fontSize: 12, background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: 8 }}>🟢 {short(account)}</span>
            ) : (
              <button onClick={connect} style={{ fontSize: 12, background: "rgba(255,255,255,0.25)", color: "#fff", border: "none", padding: "4px 12px", borderRadius: 8, cursor: "pointer" }}>
                Conectar
              </button>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>SALDO DISPONÍVEL</div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{usdcDisplay}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 14 }}>USDC</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <span style={{ fontSize: 12, background: "rgba(255,255,255,0.2)", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.4)" }}>USDC {usdcDisplay}</span>
              <span style={{ fontSize: 12, background: "rgba(255,255,255,0.1)", padding: "4px 12px", borderRadius: 20 }}>· EURC {eurcDisplay}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 20 }}>
            {[
              { icon: "✈️", label: "Enviar",  action: () => setTab("send") },
              { icon: "📥", label: "Receber", action: () => setModal("receive") },
              { icon: "🔄", label: "Trocar",  action: () => setModal("swap") },
              { icon: "💼", label: "Jobs",    action: () => setTab("jobs") },
            ].map(b => (
              <button key={b.label} onClick={b.action} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 14, padding: "10px 14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 20 }}>{b.icon}</span>
                <span style={{ fontSize: 11 }}>{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", padding: "0 20px" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}` }}>
            {(["send", "history", "jobs"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "14px 0", border: "none", background: "none", cursor: "pointer",
                color: tab === t ? BLUE : "#6b7280", fontWeight: tab === t ? 600 : 400,
                borderBottom: tab === t ? `2px solid ${BLUE}` : "2px solid transparent", fontSize: 13,
              }}>
                {t === "send" ? "Transferir" : t === "history" ? `Histórico (${history.length})` : `Jobs (${jobs.length})`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", padding: 20, minHeight: 280 }}>
          {tab === "send" && (
            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>Destino</label>
              <input value={dest} onChange={e => setDest(e.target.value)} placeholder="0x..."
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginTop: 4, marginBottom: 12, boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#6b7280" }}>Valor</label>
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginTop: 4, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#6b7280" }}>Token</label>
                  <select value={token} onChange={e => setToken(e.target.value as any)}
                    style={{ padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginTop: 4, display: "block" }}>
                    <option>USDC</option>
                    <option>EURC</option>
                  </select>
                </div>
              </div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>Mensagem (opcional)</label>
              <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Para que é esse pagamento?"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${BORDER}`, marginTop: 4, marginBottom: 12, boxSizing: "border-box" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
                <span>Taxa estimada</span>
                <span style={{ color: BLUE }}>~{feeEstimate} USDC</span>
              </div>
              <button onClick={account ? send : connect} disabled={sending}
                style={{ width: "100%", background: BLUE, color: "#fff", padding: 13, borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
                {sending ? "Enviando..." : account ? `Transferir ${token}` : "Conectar carteira"}
              </button>
            </div>
          )}

          {tab === "history" && (
            <div>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 40 }}>Nenhuma transação ainda</div>
              ) : history.map((h, i) => (
                <div key={i} style={{ background: "#f9fafb", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>→ {short(h.to)}</span>
                    <span style={{ fontSize: 13, color: ORANGE, fontWeight: 600 }}>-{h.amount} {h.token}</span>
                  </div>
                  {h.memo && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{h.memo}</div>}
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{h.time}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "jobs" && (
            <div>
              <button onClick={() => setModal("createJob")}
                style={{ width: "100%", background: ORANGE, color: "#fff", padding: 11, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 600, marginBottom: 14 }}>
                + Criar novo Job ERC-8183
              </button>
              {loadingJobs ? (
                <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 20 }}>Carregando jobs...</div>
              ) : jobs.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 20 }}>Nenhum job encontrado</div>
              ) : jobs.map(j => <JobCard key={j.id} job={j} />)}
            </div>
          )}
        </div>
      </div>

      {modal === "receive"   && <ReceiveModal account={account} onClose={() => setModal("")} />}
      {modal === "swap"      && <SwapModal account={account} onClose={() => setModal("")} />}
      {modal === "createJob" && <CreateJobModal account={account} onClose={() => setModal("")} onCreated={() => { loadJobs(account); loadBalances(account); }} />}
    </div>
  );
}
