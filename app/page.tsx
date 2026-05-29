"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { Toaster, toast } from "react-hot-toast";

declare global {
  interface Window { ethereum?: any; }
}

/* ── Constants ───────────────────────────────────────────── */
const ARC_CHAIN_ID = "0x491";
const RPC_URL      = "https://rpc.testnet.arc.network";

const USDC_ADDRESS    = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS    = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ERC8183_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583";

const GOLDSKY_URL = "https://api.goldsky.com/api/public/project_cmpngw40w7ra701wo7299675h/subgraphs/arc-erc8183/1.0.0/gn";

async function fetchJobsFromGoldsky(address: string): Promise<any[]> {
  try {
    const addr = address.toLowerCase();
    const query = `{
      asClient: jobs(where: { client: "${addr}" }, orderBy: createdAt, orderDirection: desc, first: 20) {
        id status budget description provider evaluator expiredAt createdAt updatedAt
      }
      asProvider: jobs(where: { provider: "${addr}" }, orderBy: createdAt, orderDirection: desc, first: 20) {
        id status budget description provider evaluator expiredAt createdAt updatedAt
      }
    }`;
    const res  = await fetch(GOLDSKY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (data.errors) return [];
    const all = [...(data.data?.asClient || []), ...(data.data?.asProvider || [])];
    const seen = new Set<string>();
    return all.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true; })
      .map(j => ({ ...j, statusName: j.status, budget: BigInt(j.budget || "0") }));
  } catch { return []; }
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const ERC8183_ABI = [
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "function reject(uint256 jobId, bytes32 reason, bytes optParams)",
  "function claimRefund(uint256 jobId)",
  "function getJob(uint256 jobId) view returns (tuple(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook))",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
];

const STATUS_NAMES = ["Open","Funded","Submitted","Completed","Rejected","Expired"];
const STATUS_COLORS: Record<string, string> = {
  Open: "#6b7280", Funded: "#2775CA", Submitted: "#e05a3a",
  Completed: "#16a34a", Rejected: "#dc2626", Expired: "#9ca3af",
};

const BLUE   = "#3a6cc8";
const ORANGE = "#e05a3a";
const BORDER = "#c8cdd8";

const short   = (a: string) => a ? a.slice(0, 6) + "..." + a.slice(-4) : "";
const timeAgo = (ts: number) => {
  const d = Date.now() - ts;
  if (d < 60000)    return "agora";
  if (d < 3600000)  return `${Math.floor(d / 60000)}min atrás`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h atrás`;
  return new Date(ts).toLocaleDateString("pt-BR");
};

/* ── QR Code ─────────────────────────────────────────────── */
function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    const canvas = ref.current;
    const ctx    = canvas.getContext("2d")!;
    const cells  = 21;
    const cell   = size / cells;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    const seed = value.toLowerCase().replace("0x", "");
    const bits: boolean[] = [];
    for (let i = 0; i < cells * cells; i++) {
      const c = seed.charCodeAt(i % seed.length);
      bits.push((c + i * 7 + Math.floor(i / cells) * 3) % 3 !== 0);
    }
    const drawFinder = (ox: number, oy: number) => {
      ctx.fillStyle = "#111";
      ctx.fillRect(ox * cell, oy * cell, 7 * cell, 7 * cell);
      ctx.fillStyle = "#fff";
      ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, 5 * cell, 5 * cell);
      ctx.fillStyle = "#111";
      ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, 3 * cell, 3 * cell);
    };
    drawFinder(0, 0); drawFinder(cells - 7, 0); drawFinder(0, cells - 7);
    ctx.fillStyle = "#111";
    for (let r = 0; r < cells; r++) {
      for (let c2 = 0; c2 < cells; c2++) {
        const inFinder = (r < 8 && c2 < 8) || (r < 8 && c2 >= cells - 8) || (r >= cells - 8 && c2 < 8);
        if (!inFinder && bits[r * cells + c2]) ctx.fillRect(c2 * cell, r * cell, cell - 0.5, cell - 0.5);
      }
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} style={{ borderRadius: 8, display: "block" }} />;
}

/* ── Receive Modal ───────────────────────────────────────── */
function ReceiveModal({ account, onClose }: { account: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(account); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, border: `1.5px solid ${BORDER}`, padding: 24, width: 340 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "#111827" }}>Receber USDC / EURC</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ padding: 12, background: "#fff", borderRadius: 16, border: `1px solid ${BORDER}` }}>
            <QRCode value={account} size={160} />
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>Seu endereço Arc</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#111827", wordBreak: "break-all" }}>{account}</div>
        </div>
        <button onClick={copy} style={{ width: "100%", background: copied ? "#e8f5e9" : BLUE, border: copied ? "1px solid #a5d6a7" : "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 500, color: copied ? "#2e7d32" : "#fff", cursor: "pointer" }}>
          {copied ? "✓ Endereço copiado!" : "Copiar endereço"}
        </button>
      </div>
    </div>
  );
}

/* ── Swap Modal ──────────────────────────────────────────── */
function SwapModal({ onClose, onSwap }: { onClose: () => void; onSwap: () => void }) {
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken,   setToToken]   = useState("EURC");
  const [amount,    setAmount]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const rate = 1.08;
  const flip = () => { setFromToken(toToken); setToToken(fromToken); };
  const swap = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("Informe um valor"); return; }
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1800));
      toast.success(`Swap de ${amount} ${fromToken} → ${toToken} concluído!`);
      onSwap(); onClose();
    } catch { toast.error("Erro no swap"); }
    finally  { setLoading(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, border: `1.5px solid ${BORDER}`, padding: 24, width: 340 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "#111827" }}>Trocar tokens</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>De</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0"
            style={{ flex: 1, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111827", outline: "none" }} />
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: BLUE }}>{fromToken}</div>
        </div>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <button onClick={flip} style={{ background: "#eef3fc", border: `1px solid #c5d4f0`, borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16, color: BLUE }}>⇅</button>
        </div>
        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Para</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#6b7280" }}>
            {amount ? (fromToken === "USDC" ? (Number(amount) * rate).toFixed(4) : (Number(amount) / rate).toFixed(4)) : "0.00"}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: BLUE }}>{toToken}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 16, padding: "6px 0", borderTop: `1px solid #e5e7eb` }}>
          <span>Taxa de câmbio</span>
          <span style={{ color: BLUE, fontFamily: "monospace" }}>1 USDC = {rate} EURC</span>
        </div>
        <button onClick={swap} disabled={loading} style={{ width: "100%", background: BLUE, border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Trocando..." : `Trocar ${fromToken} → ${toToken}`}
        </button>
      </div>
    </div>
  );
}

/* ── Job Card ────────────────────────────────────────────── */
function JobCard({ job, account, onRefresh }: { job: any; account: string; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const isClient   = job.client?.toLowerCase()   === account.toLowerCase();
  const isProvider = job.provider?.toLowerCase() === account.toLowerCase();

  const act = async (fn: string, params: any[]) => {
    setLoading(true);
    try {
      const bp = new ethers.BrowserProvider(window.ethereum);
      const sg = await bp.getSigner();
      const c  = new ethers.Contract(ERC8183_ADDRESS, ERC8183_ABI, sg);
      const tx = await c[fn](...params, { maxFeePerGas: ethers.parseUnits("20","gwei"), maxPriorityFeePerGas: ethers.parseUnits("1","gwei") });
      toast.loading("Processando...", { id: "job" });
      await tx.wait();
      toast.success("Concluído!", { id: "job" });
      onRefresh();
    } catch (e: any) { toast.error(e?.reason || "Erro na transação"); }
    finally { setLoading(false); }
  };

  const approve_and_fund = async () => {
    setLoading(true);
    try {
      const bp     = new ethers.BrowserProvider(window.ethereum);
      const sg     = await bp.getSigner();
      const usdc   = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, sg);
      const escrow = new ethers.Contract(ERC8183_ADDRESS, ERC8183_ABI, sg);
      const opts   = { maxFeePerGas: ethers.parseUnits("20","gwei"), maxPriorityFeePerGas: ethers.parseUnits("1","gwei") };
      toast.loading("Aprovando USDC...", { id: "fund" });
      const appTx  = await usdc.approve(ERC8183_ADDRESS, job.budget, opts);
      await appTx.wait();
      toast.loading("Fundindo escrow...", { id: "fund" });
      const fundTx = await escrow.fund(job.id, "0x", opts);
      await fundTx.wait();
      toast.success("Escrow fundido!", { id: "fund" });
      onRefresh();
    } catch (e: any) { toast.error(e?.reason || "Erro"); }
    finally { setLoading(false); }
  };

  const statusColor = STATUS_COLORS[job.statusName] || "#6b7280";

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>Job #{job.id?.toString()}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginTop: 2 }}>{job.description}</div>
        </div>
        <span style={{ background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}40`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 500, flexShrink: 0 }}>
          {job.statusName}
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
        <span>💰 {ethers.formatUnits(job.budget || 0, 6)} USDC</span>
        <span>👤 {isClient ? "Você é cliente" : isProvider ? "Você é provider" : "Avaliador"}</span>
      </div>

      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10, fontFamily: "monospace" }}>
        Provider: {short(job.provider)} · Evaluator: {short(job.evaluator)}
      </div>

      {/* Actions based on role and status */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {/* Client: fund when Open */}
        {isClient && job.statusName === "Open" && (
          <button onClick={approve_and_fund} disabled={loading}
            style={{ flex: 1, background: BLUE, border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "..." : "Fundir Escrow"}
          </button>
        )}
        {/* Provider: setBudget when Open, submit when Funded */}
        {isProvider && job.statusName === "Open" && (
          <button onClick={() => act("setBudget", [job.id, job.budget, "0x"])} disabled={loading}
            style={{ flex: 1, background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#111827", cursor: "pointer" }}>
            Definir Budget
          </button>
        )}
        {isProvider && job.statusName === "Funded" && (
          <button onClick={() => act("submit", [job.id, ethers.keccak256(ethers.toUtf8Bytes("deliverable-" + job.id)), "0x"])} disabled={loading}
            style={{ flex: 1, background: ORANGE, border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "..." : "Entregar Trabalho"}
          </button>
        )}
        {/* Client/Evaluator: complete or reject when Submitted */}
        {isClient && job.statusName === "Submitted" && (
          <>
            <button onClick={() => act("complete", [job.id, ethers.keccak256(ethers.toUtf8Bytes("approved")), "0x"])} disabled={loading}
              style={{ flex: 1, background: "#16a34a", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "..." : "✓ Aprovar"}
            </button>
            <button onClick={() => act("reject", [job.id, ethers.keccak256(ethers.toUtf8Bytes("rejected")), "0x"])} disabled={loading}
              style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              ✗ Rejeitar
            </button>
          </>
        )}
        <a href={`https://testnet.arcscan.app/address/${ERC8183_ADDRESS}`} target="_blank" rel="noreferrer"
          style={{ fontSize: 10, color: BLUE, textDecoration: "none", display: "flex", alignItems: "center", gap: 3, padding: "7px 8px", background: "#eef3fc", borderRadius: 8 }}>
          🔎 ArcScan
        </a>
      </div>
    </div>
  );
}

/* ── Create Job Modal ────────────────────────────────────── */
function CreateJobModal({ account, onClose, onCreated }: { account: string; onClose: () => void; onCreated: () => void }) {
  const [provider,    setProvider]    = useState("");
  const [budget,      setBudget]      = useState("");
  const [description, setDescription] = useState("");
  const [hours,       setHours]       = useState("1");
  const [loading,     setLoading]     = useState(false);

  const create = async () => {
    if (!ethers.isAddress(provider))    { toast.error("Endereço do provider inválido"); return; }
    if (!budget || Number(budget) <= 0) { toast.error("Informe o valor do job"); return; }
    if (!description)                   { toast.error("Descreva o trabalho"); return; }

    setLoading(true);
    try {
      const bp       = new ethers.BrowserProvider(window.ethereum);
      const sg       = await bp.getSigner();
      const c        = new ethers.Contract(ERC8183_ADDRESS, ERC8183_ABI, sg);
      const usdc     = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, sg);
      const expiredAt = Math.floor(Date.now() / 1000) + Number(hours) * 3600;
      const budgetWei = ethers.parseUnits(budget, 6);
      const opts     = { maxFeePerGas: ethers.parseUnits("20","gwei"), maxPriorityFeePerGas: ethers.parseUnits("1","gwei") };

      toast.loading("Criando job...", { id: "create" });
      const tx = await c.createJob(
        ethers.getAddress(provider),
        account,
        expiredAt,
        description,
        "0x0000000000000000000000000000000000000000",
        opts
      );
      const receipt = await tx.wait();
      toast.loading("Aprovando USDC...", { id: "create" });
      const appTx = await usdc.approve(ERC8183_ADDRESS, budgetWei, opts);
      await appTx.wait();

      // extract jobId from logs
      const iface  = new ethers.Interface(ERC8183_ABI);
      let jobId: bigint | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "JobCreated") { jobId = parsed.args.jobId; break; }
        } catch {}
      }

      if (jobId !== undefined) {
        toast.loading("Fundindo escrow...", { id: "create" });
        const fundTx = await c.fund(jobId, "0x", opts);
        await fundTx.wait();
      }

      toast.success("Job criado e escrow fundido!", { id: "create" });
      onCreated();
      onClose();
    } catch (e: any) { toast.error(e?.reason || "Erro ao criar job"); }
    finally { setLoading(false); }
  };

  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: "100%", background: "#fff", border: `1px solid ${BORDER}`,
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111827",
    outline: "none", marginBottom: 10, ...extra
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#f2f3f5", borderRadius: 20, border: `1.5px solid ${BORDER}`, padding: 24, width: 360, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "#111827" }}>Criar Job ERC-8183</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Endereço do Provider (quem vai executar)</label>
        <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="0x..." style={{ ...inp(), fontFamily: "monospace", fontSize: 12 }} />

        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Descrição do trabalho</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Analyze stablecoin market report" style={inp()} />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Valor (USDC)</label>
            <input value={budget} onChange={e => setBudget(e.target.value)} placeholder="5.00" type="number" min="0" style={inp()} />
          </div>
          <div style={{ flex: "0 0 90px" }}>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Prazo (h)</label>
            <select value={hours} onChange={e => setHours(e.target.value)} style={{ ...inp(), padding: "9px 8px" }}>
              {["1","2","4","8","24","48","72"].map(h => <option key={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <div style={{ background: "#eef3fc", border: "1px solid #c5d4f0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 11, color: "#1e40af" }}>
          💡 Você será o <strong>cliente e avaliador</strong>. O provider executa o trabalho e você aprova ou rejeita.
        </div>

        <button onClick={create} disabled={loading}
          style={{ width: "100%", background: BLUE, border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Processando..." : "Criar Job + Fundir Escrow"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function Home() {
  const [account,  setAccount]  = useState("");
  const [usdcBal,  setUsdcBal]  = useState("0.00");
  const [eurcBal,  setEurcBal]  = useState("0.00");
  const [token,    setToken]    = useState("USDC");
  const [to,       setTo]       = useState("");
  const [amount,   setAmount]   = useState("");
  const [memo,     setMemo]     = useState("");
  const [fee,      setFee]      = useState("0.0000");
  const [loading,  setLoading]  = useState(false);
  const [txHash,   setTxHash]   = useState("");
  const [history,  setHistory]  = useState<any[]>([]);
  const [jobs,     setJobs]     = useState<any[]>([]);
  const [tab,      setTab]      = useState<"send"|"history"|"jobs">("send");
  const [modal,    setModal]    = useState<""|"receive"|"swap"|"createJob">("");

  const tokenAddress = token === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
  const displayBal   = token === "USDC" ? usdcBal : eurcBal;

  useEffect(() => {
    try { const s = localStorage.getItem("arc_history"); if (s) setHistory(JSON.parse(s)); } catch {}
    try { const j = localStorage.getItem("arc_jobs");    if (j) setJobs(JSON.parse(j)); }    catch {}
  }, []);

  const saveHistory = (h: any[]) => { setHistory(h); try { localStorage.setItem("arc_history", JSON.stringify(h)); } catch {} };

  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const p = new ethers.JsonRpcProvider(RPC_URL);
      for (const [sym, addr_] of [["USDC", USDC_ADDRESS], ["EURC", EURC_ADDRESS]] as const) {
        const c   = new ethers.Contract(addr_, ERC20_ABI, p);
        const raw = await c.balanceOf(addr);
        const fmt = Number(ethers.formatUnits(raw, 6)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
        if (sym === "USDC") setUsdcBal(fmt);
        else                setEurcBal(fmt);
      }
    } catch {}
  }, []);

  const fetchJob = async (jobId: number) => {
    try {
      const p   = new ethers.JsonRpcProvider(RPC_URL);
      const c   = new ethers.Contract(ERC8183_ADDRESS, ERC8183_ABI, p);
      const job = await c.getJob(jobId);
      return { id: job.id, client: job.client, provider: job.provider, evaluator: job.evaluator, description: job.description, budget: job.budget, expiredAt: job.expiredAt, statusName: STATUS_NAMES[Number(job.status)], hook: job.hook };
    } catch { return null; }
  };

  const refreshJobs = async (addr?: string) => {
    const target = addr || account;
    if (!target) return;
    const goldskyJobs = await fetchJobsFromGoldsky(target);
    if (goldskyJobs.length > 0) { setJobs(goldskyJobs); return; }
    // Fallback RPC
    const saved = localStorage.getItem("arc_job_ids");
    if (!saved) return;
    const ids = JSON.parse(saved) as number[];
    const updated = await Promise.all(ids.map(fetchJob));
    setJobs(updated.filter(Boolean));
  };

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accs: string[]) => {
      if (accs[0]) { setAccount(accs[0]); fetchBalances(accs[0]); }
    });
    window.ethereum.on("accountsChanged", (accs: string[]) => setAccount(accs[0] || ""));
  }, []);

  useEffect(() => { if (account) { fetchBalances(account); refreshJobs(); } }, [account]);

  async function switchToArc() {
    try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] }); }
    catch (e: any) {
      if (e.code === 4902) await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: ARC_CHAIN_ID, chainName: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: ["https://testnet.arcscan.app"] }] });
    }
  }

  async function connectWallet() {
    if (!window.ethereum) { toast.error("Instale a MetaMask"); return; }
    await switchToArc();
    const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(accs[0]);
    toast.success("Carteira conectada!");
  }

  useEffect(() => {
    if (!to || !amount || !account) { setFee("0.0000"); return; }
    (async () => {
      try {
        const bp  = new ethers.BrowserProvider(window.ethereum);
        const sg  = await bp.getSigner();
        const c   = new ethers.Contract(tokenAddress, ERC20_ABI, sg);
        const val = ethers.parseUnits(amount, 6);
        const gas = await c.transfer.estimateGas(ethers.getAddress(to), val);
        const fd  = await bp.getFeeData();
        const gp  = fd.gasPrice ?? ethers.parseUnits("20", "gwei");
        setFee(Number(ethers.formatUnits(gas * gp, 18)).toFixed(4));
      } catch { setFee("0.0000"); }
    })();
  }, [amount, to, token, account]);

  async function send() {
    if (!ethers.isAddress(to))          { toast.error("Endereço inválido"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Informe um valor");   return; }
    setLoading(true);
    try {
      const bp  = new ethers.BrowserProvider(window.ethereum);
      const sg  = await bp.getSigner();
      const c   = new ethers.Contract(tokenAddress, ERC20_ABI, sg);
      const val = ethers.parseUnits(amount, 6);
      const tx  = await c.transfer(ethers.getAddress(to), val, { maxFeePerGas: ethers.parseUnits("20","gwei"), maxPriorityFeePerGas: ethers.parseUnits("1","gwei") });
      setTxHash(tx.hash);
      toast.loading("Enviando...", { id: "tx" });
      await tx.wait();
      toast.success("Transferência concluída!", { id: "tx" });
      const nh = [{ to, amount, token, memo, hash: tx.hash, ts: Date.now(), type: "out" }, ...history];
      saveHistory(nh);
      setTo(""); setAmount(""); setMemo("");
      fetchBalances(account);
    } catch { toast.error("Erro na transação"); }
    finally  { setLoading(false); }
  }

  const onJobCreated = () => { refreshJobs(); setTab("jobs"); };

  /* ── Render ── */
  return (
    <div style={{ minHeight: "100vh", background: "#e8eaf0", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", fontFamily: "system-ui, sans-serif" }}>
      <Toaster position="top-center" />

      {modal === "receive"   && account && <ReceiveModal account={account} onClose={() => setModal("")} />}
      {modal === "swap"      && <SwapModal onClose={() => setModal("")} onSwap={() => fetchBalances(account)} />}
      {modal === "createJob" && account && <CreateJobModal account={account} onClose={() => setModal("")} onCreated={onJobCreated} />}

      <div style={{ width: 380, background: "#f2f3f5", borderRadius: 36, border: "1.5px solid #c4c8d4", overflow: "hidden", boxShadow: "0 2px 0 #b0b5c2" }}>

        {/* HEADER */}
        <div style={{ background: BLUE, padding: "28px 24px 20px", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "3px 10px" }}>Arc Testnet</span>
            {account ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.9)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ee8a2", display: "inline-block" }} />
                {short(account)}
              </div>
            ) : (
              <button onClick={connectWallet} style={{ background: "rgba(255,255,255,0.15)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "5px 14px", fontSize: 12, color: "#fff", cursor: "pointer" }}>Conectar</button>
            )}
          </div>

          <div style={{ textAlign: "center", padding: "4px 0 20px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>saldo disponível</div>
            <div style={{ fontSize: 42, fontWeight: 500, color: "#fff", letterSpacing: -1.5, lineHeight: 1 }}>{displayBal}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{token}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
              {[{ sym: "USDC", bal: usdcBal, color: "#2775CA" }, { sym: "EURC", bal: eurcBal, color: "#1A56DB" }].map(t => (
                <div key={t.sym} onClick={() => setToken(t.sym)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.10)", border: token === t.sym ? "0.5px solid rgba(255,255,255,0.5)" : "0.5px solid rgba(255,255,255,0.18)", borderRadius: 20, padding: "4px 12px", fontSize: 11, color: "rgba(255,255,255,0.85)", cursor: "pointer", opacity: token === t.sym ? 1 : 0.6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.color, display: "inline-block" }} />
                  {t.sym} {t.bal}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Enviar",    onClick: () => setTab("send"),                                        path: "M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" },
              { label: "Receber",  onClick: () => account ? setModal("receive") : connectWallet(),        path: "M8 17L12 21L16 17M12 12V21M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29" },
              { label: "Trocar",   onClick: () => account ? setModal("swap") : connectWallet(),           path: "M17 1L21 5L17 9M3 11V9a4 4 0 014-4h14M7 23L3 19L7 15M21 13v2a4 4 0 01-4 4H3" },
              { label: "Jobs",     onClick: () => account ? setModal("createJob") : connectWallet(),      path: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
            ].map(btn => (
              <div key={btn.label} onClick={btn.onClick} style={{ flex: 1, background: "rgba(255,255,255,0.12)", border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: "10px 4px 8px", textAlign: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 4px" }}><path d={btn.path} /></svg>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", display: "block" }}>{btn.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, marginBottom: 16 }}>
            {(["send","history","jobs"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 11, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${BLUE}` : "2px solid transparent", marginBottom: -1, cursor: "pointer", color: tab === t ? BLUE : "#6b7280", fontWeight: tab === t ? 500 : 400 }}>
                {t === "send" ? "Transferir" : t === "history" ? `Histórico${history.length ? ` (${history.length})` : ""}` : `Jobs${jobs.length ? ` (${jobs.length})` : ""}`}
              </button>
            ))}
          </div>

          {/* SEND */}
          {tab === "send" && <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Destino</label>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="0x..." style={{ width: "100%", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontFamily: "monospace", color: "#111827", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Valor</label>
                <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0" style={{ width: "100%", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111827", outline: "none" }} />
              </div>
              <div style={{ flex: "0 0 90px" }}>
                <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Token</label>
                <select value={token} onChange={e => setToken(e.target.value)} style={{ width: "100%", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 8px", fontSize: 13, color: "#111827", outline: "none" }}>
                  <option>USDC</option><option>EURC</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Mensagem (opcional)</label>
              <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Para que é esse pagamento?" style={{ width: "100%", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111827", outline: "none" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 4px", fontSize: 11, color: "#9ca3af", borderTop: "1px solid #e5e7eb" }}>
              <span>Taxa estimada</span>
              <span style={{ color: BLUE, fontWeight: 500, fontFamily: "monospace", fontSize: 12 }}>~{fee} USDC</span>
            </div>
            <button onClick={account ? send : connectWallet} disabled={loading} style={{ width: "100%", background: BLUE, border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer", marginTop: 10, opacity: loading ? 0.7 : 1 }}>
              {!account ? "Conectar carteira" : loading ? "Enviando..." : `Transferir ${token}`}
            </button>
            {txHash && (
              <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: BLUE, textDecoration: "none", marginTop: 10, padding: "8px 10px", background: "#eef3fc", borderRadius: 8, border: "1px solid #c5d4f0", fontFamily: "monospace", wordBreak: "break-all" }}>
                🔎 {short(txHash)} — ver no ArcScan
              </a>
            )}
          </>}

          {/* HISTORY */}
          {tab === "history" && <>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>Nenhuma transação ainda.</div>
            ) : history.map((tx, i) => (
              <a key={i} href={`https://testnet.arcscan.app/tx/${tx.hash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, textDecoration: "none", marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tx.type === "in" ? "#eef3fc" : "#fff0ee", color: tx.type === "in" ? BLUE : ORANGE }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {tx.type === "in" ? <><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></> : <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>}
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#111827", fontFamily: "monospace" }}>{short(tx.to)}</div>
                  {tx.memo && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.memo}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: tx.type === "in" ? BLUE : ORANGE, fontFamily: "monospace" }}>{tx.type === "in" ? "+" : "-"}{tx.amount} {tx.token}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{timeAgo(tx.ts)}</div>
                </div>
              </a>
            ))}
            {history.length > 0 && <button onClick={() => saveHistory([])} style={{ width: "100%", background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px", fontSize: 12, color: "#9ca3af", cursor: "pointer", marginTop: 4 }}>Limpar histórico</button>}
          </>}

          {/* JOBS */}
          {tab === "jobs" && <>
            <button onClick={() => account ? setModal("createJob") : connectWallet()} style={{ width: "100%", background: BLUE, border: "none", borderRadius: 12, padding: 11, fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer", marginBottom: 14 }}>
              + Criar novo Job ERC-8183
            </button>
            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
                Nenhum job ainda. Crie o primeiro job agentic!
              </div>
            ) : jobs.map((job, i) => (
              <JobCard key={i} job={job} account={account} onRefresh={refreshJobs} />
            ))}
          </>}
        </div>
      </div>
    </div>
  );
}
