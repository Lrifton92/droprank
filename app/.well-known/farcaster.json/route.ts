import { withValidManifest } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "../../../minikit.config";

// `minikitConfig` carries the Base-specific `baseBuilder` field, which is part of
// the on-disk manifest spec but absent from OnchainKit's MiniAppManifest type.
// Next 15.5's stricter typecheck flags it as an excess property and fails the
// `MiniAppManifest | LegacyMiniAppManifest` generic. The field is emitted at
// runtime as intended; we satisfy the helper's input type via the base shape.
type ManifestArg = Parameters<typeof withValidManifest>[0];

export async function GET() {
  return Response.json(withValidManifest(minikitConfig as ManifestArg));
}
