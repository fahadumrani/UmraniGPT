/* ============================================================
   UMRANIGPT — Admin Activity Chart
   Live line chart: how many users are active, over time.
   Polls every 20s while the Dashboard tab is visible so the
   chart genuinely moves — not just a static historical graph.
============================================================ */
'use strict';

window.AdminActivity = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));

  let chart = null;
  let usageChart = null;
  let pollTimer = null;
  let currentHours = 24;
  let currentUsageHours = 24;

  const POLL_MS = 20 * 1000; // live refresh cadence

  const getThemeColors = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      online:   styles.getPropertyValue('--accent-primary').trim()   || '#8b5cf6',
      loggedIn: styles.getPropertyValue('--accent-secondary').trim() || '#ec4899',
      grid:     'rgba(255,255,255,0.06)',
      text:     styles.getPropertyValue('--text-secondary').trim()   || '#a1a1aa',
    };
  };

  const formatTimeLabel = (ts, hours) => {
    const d = new Date(ts);
    if (hours <= 24) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' '
         + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const buildChart = (points) => {
    const canvas = $('#admin-activity-chart');
    if (!canvas || !window.Chart) return;

    const colors = getThemeColors();
    const labels = points.map(p => formatTimeLabel(p.t, currentHours));
    const onlineData   = points.map(p => p.online);
    const loggedInData = points.map(p => p.loggedIn);

    const config = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Online now',
            data: onlineData,
            borderColor: colors.online,
            backgroundColor: colors.online + '22',
            fill: true,
            tension: 0.35,
            pointRadius: (ctx) => (ctx.dataIndex === onlineData.length - 1 ? 4 : 0),
            pointBackgroundColor: colors.online,
            borderWidth: 2,
          },
          {
            label: 'Logged in (active sessions)',
            data: loggedInData,
            borderColor: colors.loggedIn,
            backgroundColor: colors.loggedIn + '15',
            fill: false,
            tension: 0.35,
            pointRadius: (ctx) => (ctx.dataIndex === loggedInData.length - 1 ? 4 : 0),
            pointBackgroundColor: colors.loggedIn,
            borderWidth: 2,
            borderDash: [4, 3],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid:  { color: colors.grid },
            ticks: { color: colors.text, maxTicksLimit: 8, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid:  { color: colors.grid },
            ticks: { color: colors.text, precision: 0, font: { size: 11 } },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: colors.text, boxWidth: 12, font: { size: 11 }, usePointStyle: true },
          },
          tooltip: {
            backgroundColor: 'rgba(20,20,30,0.9)',
            padding: 10,
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
          },
        },
      },
    };

    if (chart) {
      chart.data = config.data;
      chart.update('none'); // no re-animation on live refresh — smoother
    } else {
      chart = new window.Chart(canvas, config);
    }
  };

  const formatUsageTimeLabel = (ts, hours) => {
    const d = new Date(ts);
    if (hours <= 24) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' '
         + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const buildUsageChart = (points) => {
    const canvas = $('#admin-usage-chart');
    if (!canvas || !window.Chart) return;

    if (!points.length) {
      // Nothing sent through the AI yet — clear rather than show a
      // misleading flat zero line.
      if (usageChart) { usageChart.destroy(); usageChart = null; }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const colors   = getThemeColors();
    const labels   = points.map(p => formatUsageTimeLabel(p.t, currentUsageHours));
    const tokens   = points.map(p => p.tokens);
    const requests = points.map(p => p.requests);

    const config = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tokens', data: tokens,
            borderColor: colors.online, backgroundColor: colors.online + '22',
            fill: true, tension: 0.35, yAxisID: 'tokens', pointRadius: 0, borderWidth: 2,
          },
          {
            label: 'Requests', data: requests,
            borderColor: colors.loggedIn, backgroundColor: 'transparent',
            fill: false, tension: 0.35, yAxisID: 'requests', pointRadius: 0, borderWidth: 2,
            borderDash: [4, 3],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxTicksLimit: 8, font: { size: 11 } } },
          tokens: {
            position: 'left', beginAtZero: true,
            grid: { color: colors.grid },
            ticks: { color: colors.online, precision: 0, font: { size: 11 } },
            title: { display: true, text: 'Tokens', color: colors.online, font: { size: 11 } },
          },
          requests: {
            position: 'right', beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { color: colors.loggedIn, precision: 0, font: { size: 11 } },
            title: { display: true, text: 'Requests', color: colors.loggedIn, font: { size: 11 } },
          },
        },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { color: colors.text, boxWidth: 12, font: { size: 11 }, usePointStyle: true } },
          tooltip: { backgroundColor: 'rgba(20,20,30,0.9)', padding: 10 },
        },
      },
    };

    if (usageChart) { usageChart.data = config.data; usageChart.update('none'); }
    else usageChart = new window.Chart(canvas, config);
  };

  const loadUsage = async () => {
    try {
      const data = await window.AppApi.adminActivityUsage(currentUsageHours);
      buildUsageChart(data.points || []);
    } catch (err) {
      console.warn('[AdminActivity:usage]', err.message);
    }
  };

  const load = async () => {
    try {
      const data = await window.AppApi.adminActivity(currentHours);
      buildChart(data.points || []);
      pulseLiveDot();
    } catch (err) {
      console.warn('[AdminActivity]', err.message);
    }
    loadUsage();
  };

  const pulseLiveDot = () => {
    const dot = $('#admin-activity-live-dot');
    if (!dot) return;
    dot.classList.remove('is-pulsing');
    void dot.offsetWidth; // restart animation
    dot.classList.add('is-pulsing');
  };

  const startPolling = () => {
    stopPolling();
    pollTimer = setInterval(() => {
      // Only poll while the Dashboard tab is the visible one and tab is focused
      const dashboardVisible = document.getElementById('view-dashboard')?.classList.contains('is-active');
      if (dashboardVisible && !document.hidden) load();
    }, POLL_MS);
  };

  const stopPolling = () => { if (pollTimer) clearInterval(pollTimer); pollTimer = null; };

  const init = () => {
    $('#admin-activity-range')?.addEventListener('change', (e) => {
      currentHours = Number(e.target.value) || 24;
      load();
    });
    $('#admin-usage-range')?.addEventListener('change', (e) => {
      currentUsageHours = Number(e.target.value) || 24;
      loadUsage();
    });
    startPolling();
  };

  init();

  return { refresh: load };
})();
