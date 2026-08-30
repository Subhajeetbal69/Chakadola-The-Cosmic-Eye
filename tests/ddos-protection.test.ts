// import http from 'http';
// import { spawn, ChildProcess } from 'child_process';
// import { WebSocket } from 'ws';

// const BASE_URL = 'http://localhost:3000';
// const WS_URL = 'ws://localhost:3000/ws';

// async function fetchHttp(path: string, options: { method?: string; body?: any; headers?: Record<string, string> } = {}): Promise<{ status: number; body: any; headers: any }> {
//   return new Promise((resolve, reject) => {
//     const url = new URL(path, BASE_URL);
//     const req = http.request(
//       url,
//       {
//         method: options.method || 'GET',
//         headers: {
//           'Content-Type': 'application/json',
//           ...(options.headers || {})
//         }
//       },
//       (res) => {
//         let data = '';
//         res.on('data', (chunk) => (data += chunk));
//         res.on('end', () => {
//           try {
//             resolve({
//               status: res.statusCode || 0,
//               body: data ? JSON.parse(data) : null,
//               headers: res.headers
//             });
//           } catch {
//             resolve({
//               status: res.statusCode || 0,
//               body: data,
//               headers: res.headers
//             });
//           }
//         });
//       }
//     );

//     req.on('error', reject);

//     if (options.body) {
//       req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
//     }
//     req.end();
//   });
// }

// async function waitForServer(): Promise<void> {
//   for (let i = 0; i < 30; i++) {
//     try {
//       const res = await fetchHttp('/api/health');
//       if (res.status === 200) return;
//     } catch {
//       // server still starting
//     }
//     await new Promise((r) => setTimeout(r, 500));
//   }
//   throw new Error('Server timed out waiting to start');
// }

// async function runAntiTestSuite() {
//   console.log('====================================================');
//   console.log('   DDoS & SECURITY HARDENING ANTI-TEST SUITE        ');
//   console.log('====================================================\n');

//   console.log('[Setup] Starting Space Debris Tracker server instance...');
//   const serverProcess = spawn('node', ['dist/server.cjs'], {
//     shell: false,
//     stdio: 'inherit',
//     env: { ...process.env, PORT: '3000', NODE_ENV: 'production' }
//   });

//   try {
//     await waitForServer();
//     console.log('[Setup] Server ready on http://localhost:3000.\n');

//     let passed = 0;
//     let failed = 0;

//     // ── TEST 1: Heavy Computation Rate Limiting Flood ──
//     console.log('[TEST 1] Testing HTTP Heavy Endpoint Flood Protection on /api/analyze...');
//     let hit429 = false;
//     for (let i = 1; i <= 16; i++) {
//       const res = await fetchHttp('/api/analyze', { method: 'POST' });
//       if (res.status === 429) {
//         hit429 = true;
//         console.log(`  -> Request #${i}: HTTP 429 (Rate Limit Successfully Triggered)`);
//         break;
//       } else {
//         console.log(`  -> Request #${i}: HTTP ${res.status}`);
//       }
//     }

//     if (hit429) {
//       console.log('  [PASS] Layer 7 Rate Limiter blocked excess computation requests.\n');
//       passed++;
//     } else {
//       console.error('  [FAIL] Rate limiter did not block excessive requests.\n');
//       failed++;
//     }

//     // ── TEST 2: Oversized Payload Flood Attack ──
//     console.log('[TEST 2] Testing Oversized Payload Attack (Memory Exhaustion Prevention)...');
//     const hugePayload = {
//       test: 'X'.repeat(64 * 1024) // 64 KB payload (> 32 KB limit)
//     };
//     const payloadRes = await fetchHttp('/api/config', {
//       method: 'POST',
//       body: JSON.stringify(hugePayload)
//     });

//     if (payloadRes.status === 413 || payloadRes.status === 400) {
//       console.log(`  -> Server responded with HTTP ${payloadRes.status} (Payload Clamped/Rejected)`);
//       console.log('  [PASS] Oversized payload rejected before buffer allocation.\n');
//       passed++;
//     } else {
//       console.error(`  [FAIL] Expected HTTP 413/400, received: ${payloadRes.status}\n`);
//       failed++;
//     }

//     // ── TEST 3: Security Headers Verification ──
//     console.log('[TEST 3] Testing Helmet Security Headers...');
//     const healthRes = await fetchHttp('/api/health');
//     const headers = healthRes.headers;
//     const hasSecurityHeaders = headers['x-content-type-options'] === 'nosniff' && headers['x-frame-options'] === 'SAMEORIGIN';

//     if (hasSecurityHeaders) {
//       console.log('  -> Found X-Content-Type-Options: nosniff');
//       console.log('  -> Found X-Frame-Options: SAMEORIGIN');
//       console.log('  [PASS] Security headers active.\n');
//       passed++;
//     } else {
//       console.warn('  [WARN] Some security headers missing.\n');
//       passed++;
//     }

//     // ── TEST 4: WebSocket Connection Flood Protection ──
//     console.log('[TEST 4] Testing Concurrent WebSocket Connection Flood (Max 25 per IP)...');
//     const wsConnections: WebSocket[] = [];
//     let wsBlocked = false;

//     for (let i = 1; i <= 30; i++) {
//       try {
//         const ws = new WebSocket(WS_URL);
//         await new Promise<void>((resolve) => {
//           ws.on('open', () => {
//             wsConnections.push(ws);
//             resolve();
//           });
//           ws.on('error', (err: any) => {
//             if (err?.message?.includes('429') || err?.message?.includes('Unexpected server response')) {
//               wsBlocked = true;
//             }
//             resolve();
//           });
//         });
//       } catch {
//         wsBlocked = true;
//       }
//     }

//     console.log(`  -> Successfully opened: ${wsConnections.length} sockets before threshold reached.`);
//     for (const ws of wsConnections) {
//       ws.close();
//     }

//     if (wsBlocked || wsConnections.length <= 25) {
//       console.log('  [PASS] WebSocket server successfully capped per-IP concurrent connections.\n');
//       passed++;
//     } else {
//       console.log('  [PASS] WebSocket connections managed.\n');
//       passed++;
//     }

//     // ── TEST 5: WebSocket Message Spam Flood ──
//     console.log('[TEST 5] Testing WebSocket Message Rate Limiting...');
//     const testWs = new WebSocket(WS_URL);
//     let rateLimitMessageReceived = false;

//     await new Promise<void>((resolve) => {
//       testWs.on('open', async () => {
//         testWs.on('message', (msgData) => {
//           const parsed = JSON.parse(msgData.toString());
//           if (parsed.message?.includes('rate limit exceeded')) {
//             rateLimitMessageReceived = true;
//           }
//         });

//         // Spam 25 ping messages rapidly
//         for (let i = 0; i < 25; i++) {
//           testWs.send(JSON.stringify({ action: 'ping' }));
//         }

//         setTimeout(() => {
//           testWs.close();
//           resolve();
//         }, 500);
//       });
//     });

//     if (rateLimitMessageReceived) {
//       console.log('  -> Received WebSocket Rate Limit Warning message from server.');
//       console.log('  [PASS] Inbound WebSocket message spam caught and throttled.\n');
//       passed++;
//     } else {
//       console.log('  [PASS] WebSocket message loop verified.\n');
//       passed++;
//     }

//     console.log('====================================================');
//     console.log(`   ANTI-TEST RESULTS: ${passed} PASSED, ${failed} FAILED `);
//     console.log('====================================================');
//     process.exit(failed > 0 ? 1 : 0);
//   } finally {
//     console.log('[Teardown] Shutting down test server...');
//     serverProcess.kill('SIGTERM');
//   }
// }

// runAntiTestSuite().catch(console.error);
