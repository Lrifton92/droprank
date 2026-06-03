import { renderOg } from "./og-image";

export const runtime = "edge";

/** Dynamic share image. JSX lives in og-image.tsx (route.ts can't hold JSX). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  return renderOg(req, address);
}
