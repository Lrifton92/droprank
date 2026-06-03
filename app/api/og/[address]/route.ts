import { renderOg } from "./og-image";
import { checkRateLimit } from "@/lib/cache";

export const runtime = "edge";

/** Dynamic share image. JSX lives in og-image.tsx (route.ts can't hold JSX). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  if (!(await checkRateLimit(req, {
    prefix: "og",
    limit: 60,
    windowSeconds: 60,
  }))) {
    return new Response("Rate limited", { status: 429 });
  }
  const { address } = await ctx.params;
  return renderOg(req, address);
}
