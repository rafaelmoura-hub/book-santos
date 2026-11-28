async function monitor(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/')
    throw Error('Configure BOOK_MONITOR_URL como origem HTTPS.');
  const results = [];
  for (const route of ['/health', '/ready']) {
    const start = performance.now(),
      response = await fetch(new URL(route, url), {
        signal: AbortSignal.timeout(45000),
        redirect: 'error',
      });
    const body = await response.json();
    if (!response.ok || body.status !== 'ok')
      throw Error('Falha em ' + route + ' (HTTP ' + response.status + ').');
    results.push({ route, ms: Math.round(performance.now() - start), version: body.version });
  }
  console.log(JSON.stringify({ event: 'availability_check', results }));
}
module.exports = { monitor };
if (require.main === module)
  monitor(process.env.BOOK_MONITOR_URL).catch((e) => {
    console.error('Monitoramento falhou: ' + e.message);
    process.exitCode = 1;
  });
