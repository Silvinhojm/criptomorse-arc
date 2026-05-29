import { ethers } from "ethers";

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const ABI = ["function balanceOf(address) view returns (uint256)"];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) return Response.json({ error: "address obrigatório" }, { status: 400 });

  try {
    const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.xyz");
    const contract = new ethers.Contract(USDC_CONTRACT, ABI, provider);
    const raw      = await contract.balanceOf(address);
    return Response.json({ balance: ethers.formatUnits(raw, 6) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}