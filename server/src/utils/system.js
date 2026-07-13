/* ============================================================
   UMRANIGPT SERVER — System Stats
   Cross-platform CPU / RAM / disk / uptime snapshot for the
   admin dashboard. Never throws — every metric degrades to
   null/'unavailable' individually rather than failing the
   whole request.
============================================================ */
'use strict';

const os = require('os');
const fs = require('fs');

/* CPU usage needs two samples a short interval apart. */
const sampleCpuTicks = () => {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const key of Object.keys(cpu.times)) total += cpu.times[key];
    idle += cpu.times.idle;
  }
  return { idle, total };
};

const getCpuUsagePercent = (sampleMs = 150) => new Promise((resolve) => {
  const start = sampleCpuTicks();
  setTimeout(() => {
    const end = sampleCpuTicks();
    const idleDelta = end.idle - start.idle;
    const totalDelta = end.total - start.total;
    if (totalDelta <= 0) return resolve(null);
    const usage = 1 - idleDelta / totalDelta;
    resolve(Math.round(usage * 1000) / 10); // one decimal place
  }, sampleMs);
});

const getMemory = () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usedPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : null,
  };
};

const getDisk = () => {
  try {
    // Node 18.15+. Not available on every platform/version — degrade gracefully.
    if (typeof fs.statfsSync !== 'function') return null;
    const stats = fs.statfsSync(process.platform === 'win32' ? process.cwd() : '/');
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usedPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : null,
    };
  } catch {
    return null;
  }
};

const getSnapshot = async () => {
  const [cpuUsagePercent] = await Promise.all([getCpuUsagePercent()]);
  return {
    cpu: { usagePercent: cpuUsagePercent, cores: os.cpus().length },
    memory: getMemory(),
    disk: getDisk(),
    serverUptimeSeconds: Math.round(process.uptime()),
    platform: os.platform(), // admin-only detail, never sent to normal users
  };
};

module.exports = { getSnapshot };
