export async function POST(req) {
  try {
    const body = await req.json();

    const { to, amount } = body;

    console.log("BODY:", body);

    // validações simples
    if (!to || !amount) {
      return new Response(
        JSON.stringify({ error: "Faltando dados" }),
        { status: 400 }
      );
    }

    // aqui futuramente entra a blockchain
    console.log("Enviando", amount, "para", to);

    return Response.json({
      success: true,
      message: "Simulação de envio OK",
    });
  } catch (err) {
    console.error("ERRO NO SEND:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}