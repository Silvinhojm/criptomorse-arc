// lib/useCrossChain.ts
import { getRoutes, executeRoute, RouteRequest } from "@lifi/sdk";

const ARC_CHAIN_ID  = 1169;
const USDC_ARC      = "0x3600000000000000000000000000000000000000";
const POLYGON_ID    = 137;
const USDC_POLYGON  = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

export async function getSwapRoute(fromAmount: string) {
  const request: RouteRequest = {
    fromChainId: POLYGON_ID,
    toChainId:   ARC_CHAIN_ID,
    fromTokenAddress: USDC_POLYGON,
    toTokenAddress:   USDC_ARC,
    fromAmount:  (parseFloat(fromAmount) * 1e6).toFixed(0),
    options: {
      slippage: 0.03,
      integrator: "arcflow-criptomorse",
    },
  };
  const result = await getRoutes(request);
  return result.routes[0] ?? null;
}

export async function executeSwap(
  route: any,
  updateCallback?: (updated: any) => void
) {
  return await executeRoute(route, {
    updateRouteHook: updateCallback,
  });
}