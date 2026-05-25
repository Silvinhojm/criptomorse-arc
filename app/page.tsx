"use client";
import { useState } from "react";

export default function Home() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const send = async () => {
    console.log("clicou");

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        body: JSON.stringify({ to, amount }),
      });

      const text = await res.text();

      console.log("Resposta bruta:", text);

      const data = text ? JSON.parse(text) : {};

      console.log("Resposta JSON:", data);

    } catch (err) {
      console.error("Erro:", err);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>ArcFlow</h1>
      <p>Bem-vindo à sua wallet onchain com USDC</p>

      <br />

      <input
        placeholder="Endereço (0x...)"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ width: "300px", padding: "5px" }}
      />

      <br /><br />

      <input
        placeholder="Valor (ex: 0.01)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: "200px", padding: "5px" }}
      />

      <br /><br />

      <button
        onClick={send}
        style={{
          padding: "10px 20px",
          background: "black",
          color: "white",
          border: "none",
          cursor: "pointer"
        }}
      >
        Enviar USDC
      </button>
    </div>
  );
}
