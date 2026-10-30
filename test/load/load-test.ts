import { performance } from "node:perf_hooks";

interface LoadTestOptions {
  totalRequests: number;
  concurrency: number;
  baseUrl: string;
}

async function runLoadTest(options: LoadTestOptions) {
  console.log("=================================================");
  console.log("       JUNGLE GAMING - LOAD TEST EXPERIMENT      ");
  console.log("=================================================");
  console.log(`Target URL: ${options.baseUrl}`);
  console.log(`Total Requests: ${options.totalRequests}`);
  console.log(`Concurrency Batch Size: ${options.concurrency}`);
  console.log("-------------------------------------------------");

  // 1. Criar carteira para o teste
  const playerId = `player-load-${crypto.randomUUID()}`;
  let walletId: string = "";

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
  let rejectedCount = 0;
  let errorCount = 0;

  const startTime = performance.now();

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
        successCount++;
      } else if (res.status === 422) {
        rejectedCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  });

  // Executar em chunks de concorrência
  for (let i = 0; i < requests.length; i += options.concurrency) {
    const chunk = requests.slice(i, i + options.concurrency);
    await Promise.all(chunk.map((fn) => fn()));
  }

  const totalDurationSeconds = (performance.now() - startTime) / 1000;
  const throughput = options.totalRequests / totalDurationSeconds;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Consultar reconciliação final para provar consistência
  const reconRes = await fetch(`${options.baseUrl}/wallets/${walletId}/reconciliation`, { method: "POST" });
  const reconData = await reconRes.json();

  console.log("\n================ RESULTADOS ================");
  console.log(`Duração Total:         ${totalDurationSeconds.toFixed(2)}s`);
  console.log(`Throughput:            ${throughput.toFixed(2)} req/s`);
  console.log(`Sucessos (PROCESSED):  ${successCount}`);
  console.log(`Rejeições de Saldo:    ${rejectedCount}`);
  console.log(`Falhas Técnicas / 5xx: ${errorCount} (Taxa de Erro: ${((errorCount / options.totalRequests) * 100).toFixed(2)}%)`);
  console.log(`Latência p50:          ${p50.toFixed(2)} ms`);
  console.log(`Latência p95:          ${p95.toFixed(2)} ms`);
  console.log(`Latência p99:          ${p99.toFixed(2)} ms`);
  console.log("--------------------------------------------");
  console.log(`Reconciliação Final da Carteira:`);
  console.log(`  - Saldo Armazenado:   R$ ${reconData.storedBalance.amount}`);
  console.log(`  - Saldo do Ledger:    R$ ${reconData.calculatedBalance.amount}`);
  console.log(`  - Diferença:          R$ ${reconData.difference.amount}`);
  console.log(`  - Consistente:        ${reconData.consistent ? "SIM (100% íntegro)" : "NÃO"}`);
  console.log("============================================\n");
}

const totalRequests = Number(process.env.LOAD_REQUESTS) || 200;
const concurrency = Number(process.env.LOAD_CONCURRENCY) || 20;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

runLoadTest({ totalRequests, concurrency, baseUrl });

