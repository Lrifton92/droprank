// Génère la clé "signer" backend (sans fonds, signe les scores EIP-712).
// Écrit SIGNER_PRIVATE_KEY dans .env.local, n'affiche QUE l'adresse publique.
// Usage : node scripts/generate-signer.mjs
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

const ENV = ".env.local";
if (existsSync(ENV) && readFileSync(ENV, "utf8").includes("SIGNER_PRIVATE_KEY=")) {
  console.error("SIGNER_PRIVATE_KEY existe déjà dans .env.local — abandon (supprime la ligne pour régénérer).");
  process.exit(1);
}

const pk = generatePrivateKey();
const address = privateKeyToAccount(pk).address;
appendFileSync(ENV, `\n# Signer backend EIP-712 (aucun fonds, signe les scores)\nSIGNER_PRIVATE_KEY=${pk}\n`);
console.log("SIGNER_ADDRESS=" + address);
