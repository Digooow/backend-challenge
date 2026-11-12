import { performance } from "node:perf_hooks";

interface LoadTestOptions {
  totalRequests: number;
  duplicateBurstSize: number;
  concurrency: number;
  baseUrl: string;
}

async function runLoadTest(options: LoadTestOptions) {
  console.log("=================================================");
  console.log("       JUNGLE GAMING - LOAD TEST EXPERIMENT      ");
  console.log("=================================================");
  console.log(`Target URL:           ${options.baseUrl}`);
  console.log(`Distinct Requests:    ${options.totalRequests}`);
  console.log(`Duplicate Burst Size: ${options.duplicateBurstSize}`);
  console.log(`Concurrency Batch:    ${options.concurrency}`);
  console.log("-------------------------------------------------");

  // 1. Criar carteira para o teste
  const playerId = `player-load-${crypto.randomUUID()}`;
  let walletId = "";

  try {
    const createWalletRes = await fetch(`${options.baseUrl}/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        initialBalance: { amount: "100000.00", currency: "BRL" },
      }),
    });

    if (!createWalletRes.ok) {
      console.error(`Falha ao preparar carteira para teste: HTTP ${createWalletRes.status}`);
      process.exit(1);
    }

    const walletData = await createWalletRes.json();
    walletId = walletData.id;
    console.log(`[Setup] Carteira criada: ${walletId} com saldo R$ 100.000,00`);
  } catch (error) {
    console.error("Não foi possível conectar ao servidor em " + options.baseUrl + ". O servidor está rodando?");
    console.error(error);
    process.exit(1);
  }

  const latencies: number[] = [];
  let successCount = 0;
  let replayCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;

  const startTime = performance.now();

  // Fase 1: Rajada simultânea de 50 requisições idênticas (Hot Wallet Idempotency Stress)
  const sharedDupExtId = `load-dup-${crypto.randomUUID()}`;
  const sharedDupKey = `provider-load:${sharedDupExtId}`;
  const duplicateRequests = Array.from({ length: options.duplicateBurstSize }, () => async () => {
    const reqStart = performance.now();
    try {
      const res = await fetch(`${options.baseUrl}/wagering/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": sharedDupKey,
        },
        body: JSON.stringify({
          providerId: "provider-load",
          externalTransactionId: sharedDupExtId,
          playerId,
          walletId,
          roundId: "round-dup-burst",
          gameId: "fortune-chimp",
          kind: "BET",
          money: { amount: "10.00", currency: "BRL" },
        }),
      });
      latencies.push(performance.now() - reqStart);
      if (res.status === 200) {
        const body = await res.json();
        if (body.idempotentReplay) replayCount++;
        else successCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  });

  await Promise.all(duplicateRequests.map((fn) => fn()));

  // Fase 2: Rajadas concorrentes de apostas distintas na mesma carteira
  const requests = Array.from({ length: options.totalRequests }, (_, i) => async () => {
    const reqStart = performance.now();
    const extId = `load-tx-${i}-${crypto.randomUUID()}`;
    const idempotencyKey = `provider-load:${extId}`;

    try {
      const res = await fetch(`${options.baseUrl}/wagering/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          providerId: "provider-load",
          externalTransactionId: extId,
          playerId,
          walletId,
          roundId: `round-${Math.floor(i / 10)}`,
          gameId: "fortune-chimp",
          kind: "BET",
          money: { amount: "10.00", currency: "BRL" },
        }),
      });

      const elapsed = performance.now() - reqStart;
      latencies.push(elapsed);

      if (res.status === 200) {
        const body = await res.json();
        if (body.idempotentReplay) replayCount++;
        else successCount++;
      } else if (res.status === 422) {
        rejectedCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  });

  for (let i = 0; i < requests.length; i += options.concurrency) {
    const chunk = requests.slice(i, i + options.concurrency);
    await Promise.all(chunk.map((fn) => fn()));
  }

  const totalSent = options.totalRequests + options.duplicateBurstSize;
  const totalDurationSeconds = (performance.now() - startTime) / 1000;
  const throughput = totalSent / totalDurationSeconds;

  latencies.sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.max(0, Math.ceil(latencies.length * p) - 1))]
      : 0;

  const p50 = percentile(0.5);
  const p95 = percentile(0.95);
  const p99 = percentile(0.99);

  // Consultar reconciliação final para provar consistência matemática
  const reconRes = await fetch(`${options.baseUrl}/wallets/${walletId}/reconciliation`, { method: "POST" });
  const reconData = await reconRes.json();

  // Consultar métricas de telemetria
  const metricsRes = await fetch(`${options.baseUrl}/metrics`, {
    headers: { Accept: "application/json" },
  });
  const metricsData = await metricsRes.json();

  console.log("\n================ RESULTADOS ================");
  console.log(`Total de Requisições:  ${totalSent}`);
  console.log(`Duração Total:         ${totalDurationSeconds.toFixed(2)}s`);
  console.log(`Throughput:            ${throughput.toFixed(2)} req/s`);
  console.log(`Processadas (Novas):   ${successCount}`);
  console.log(`Replays Idempotentes:  ${replayCount}`);
  console.log(`Rejeições de Saldo:    ${rejectedCount}`);
  console.log(`Falhas Técnicas / 5xx: ${errorCount} (Taxa de Erro: ${((errorCount / totalSent) * 100).toFixed(2)}%)`);
  console.log(`Latência p50:          ${p50.toFixed(2)} ms`);
  console.log(`Latência p95:          ${p95.toFixed(2)} ms`);
  console.log(`Latência p99:          ${p99.toFixed(2)} ms`);
  console.log("--------------------------------------------");
  console.log(`Reconciliação Final da Carteira:`);
  console.log(`  - Saldo Armazenado:   R$ ${reconData.storedBalance.amount}`);
  console.log(`  - Saldo do Ledger:    R$ ${reconData.calculatedBalance.amount}`);
  console.log(`  - Diferença:          R$ ${reconData.difference.amount}`);
  console.log(`  - Entradas no Ledger: ${reconData.checkedEntries}`);
  console.log(`  - Consistente:        ${reconData.consistent ? "SIM (100% íntegro)" : "NÃO"}`);
  console.log("--------------------------------------------");
  console.log(`Telemetria (/metrics):`);
  console.log(`  - Duplicatas Detectadas: ${metricsData.duplicatesDetected}`);
  console.log(`  - Conflitos de Lock:     ${metricsData.lockConflictsTotal}`);
  console.log(`  - Outbox Lag Atual:      ${metricsData.outboxLag}`);
  console.log("============================================\n");

  if (!reconData.consistent || errorCount > 0) {
    process.exit(1);
  }
}

const totalRequests = Number(process.env.LOAD_REQUESTS) || 200;
const duplicateBurstSize = Number(process.env.LOAD_DUPLICATES) || 50;
const concurrency = Number(process.env.LOAD_CONCURRENCY) || 20;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

runLoadTest({ totalRequests, duplicateBurstSize, concurrency, baseUrl });
