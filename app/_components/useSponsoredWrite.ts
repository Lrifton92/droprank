"use client";
import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeFunctionData } from "viem";

const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL ?? "";

type SubmitParams = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

/**
 * One write entrypoint that sponsors gas via EIP-5792 + a Coinbase Paymaster
 * when the connected wallet supports it, and falls back to a normal
 * useWriteContract otherwise. Exposes a uniform pending/success/hash surface so
 * MintButton and CheckinButton share the exact same flow.
 */
export function useSponsoredWrite(chainId: number) {
  const { address } = useAccount();
  const { data: capabilities } = useCapabilities({ account: address });
  const sponsored = useMemo(() => {
    if (!PAYMASTER_URL) return false;
    const forChain = capabilities?.[chainId] as
      | { paymasterService?: { supported?: boolean } }
      | undefined;
    return forChain?.paymasterService?.supported === true;
  }, [capabilities, chainId]);

  // ── Sponsored path (EIP-5792) ──────────────────────────────────────────
  const { sendCallsAsync, isPending: sendingCalls, reset: resetCalls } = useSendCalls();
  const [callsId, setCallsId] = useState<string | null>(null);
  const { data: callsStatus } = useCallsStatus({
    id: callsId ?? "",
    query: { enabled: Boolean(callsId), refetchInterval: ({ state }) =>
      state.data?.status === "success" ? false : 1500 },
  });

  // ── Fallback path (normal tx) ──────────────────────────────────────────
  const { writeContractAsync, reset: resetWrite } = useWriteContract();
  const [fallbackHash, setFallbackHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: fallbackConfirmed } = useWaitForTransactionReceipt({
    hash: fallbackHash ?? undefined,
    chainId,
    query: { enabled: Boolean(fallbackHash) },
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setCallsId(null); setFallbackHash(null); setPending(false); setError(null);
    resetCalls(); resetWrite();
  }, [resetCalls, resetWrite]);

  const submit = useCallback(
    async (p: SubmitParams) => {
      setError(null); setPending(true);
      try {
        if (sponsored) {
          const data = encodeFunctionData({
            abi: p.abi, functionName: p.functionName, args: p.args,
          });
          const res = await sendCallsAsync({
            chainId,
            calls: [{ to: p.address, data }],
            capabilities: { paymasterService: { url: PAYMASTER_URL } },
          });
          // wagmi returns { id } for the batch.
          setCallsId(typeof res === "string" ? res : res.id);
        } else {
          const hash = await writeContractAsync({
            abi: p.abi, address: p.address, functionName: p.functionName,
            args: p.args, chainId,
          });
          setFallbackHash(hash);
        }
      } catch (e) {
        setPending(false);
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      }
    },
    [sponsored, sendCallsAsync, writeContractAsync, chainId],
  );

  const sponsoredReceiptHash =
    (callsStatus?.status === "success" &&
      callsStatus.receipts?.[0]?.transactionHash) || null;
  const isSuccess = Boolean(sponsoredReceiptHash) || fallbackConfirmed;
  const txHash = (sponsoredReceiptHash as `0x${string}` | null) ?? fallbackHash;
  const isPending = pending && !isSuccess;

  // settle the pending flag once either path confirms
  if (isSuccess && pending) setPending(false);

  return { submit, isPending, isSuccess, txHash, error, reset, sponsored,
    sending: sendingCalls };
}
