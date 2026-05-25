import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY,
  chain: "Arc_Testnet",
});

const kit = new AppKit({
  apiKey: process.env.KIT_KEY, // 👈 AQUI ESTÁ O SEGREDO
});

export { kit, adapter };