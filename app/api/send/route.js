import { kit, adapter } from "../../../lib/arc";

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("BODY:", body);

    const { to, amount } = body;

    const result = await kit.send({
      from: { adapter, chain: "Arc_Testnet" },
      to,
      amount,
      token: "USDC",
    });

    console.log("RESULT:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
    });

  } catch (err) {
    console.error("ERRO REAL:", err); // 🔥 MOSTRA O ERRO DE VERDADE

    return new Response(JSON.stringify({
      error: err.message,
      full: String(err)
    }), {
      status: 500,
    });
  }
}
``