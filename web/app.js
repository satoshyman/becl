/* BeeClaimer Full (Telegram WebApp) - Frontend
 * - UI kept from original single-page app
 * - All money logic moved to Backend (Render) + MongoDB
 */

(() => {
  const tele = window.Telegram?.WebApp;
  if (tele) {
    tele.ready();
    tele.expand();
  }

  // Change this after deploying the backend (Render Web Service)
  const API_BASE = window.API_BASE || (new URLSearchParams(location.search).get('api') || 'http://localhost:8080');

  const initData = tele?.initData || '';
  const teleUser = tele?.initDataUnsafe?.user || null;
  const startParam = tele?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';

  // Lightweight fallback for non-Telegram testing
  const localUid = localStorage.getItem('bee_uid') || ('user_' + Math.random().toString(36).slice(2));
  localStorage.setItem('bee_uid', localUid);
  const userId = teleUser ? String(teleUser.id) : localUid;

  // Referral URL (keep your bot username)
  const botUsername = 'beeclaimer_bot';
  const finalRefURL = `https://t.me/${botUsername}?start=${userId}`;
  const refEl = document.getElementById('refURL');
  if (refEl) refEl.innerText = finalRefURL;

  // UI state
  let config = {
    money: { cooldowns: { mineSec: 300, faucetSec: 300 }, speedUpSec: 120 },
    rewards: { mine: 0.00001, faucet: 0.00001, daily: 0.0001 },
    ads: { mine: '#', faucet: '#', daily: '#', double: '#' },
    adsScripts: { mine: '', faucet: '', daily: '' },
    limits: { minWithdrawTon: 0.0001, minWithdrawUsdt: 1 },
    withdraw: { enabledMethods: { faucetpayTon: true, binanceUsdtBep20: true } },
    referral: { bonusTon: 0.002 },
    tasks: { defaultDurationSec: 15 }
  };

  let balance = 0;
  let lockedBalance = 0;
  let friends = 0;
  let refEarned = 0;
  let currentReward = 0;

  // --- helpers ---
  function alertMsg(msg) {
    if (tele?.showAlert) tele.showAlert(msg);
    else window.alert(msg);
  }

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || `API error (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function updateStaticUI() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };
    set('ui_mine_val', `(+${Number(config.rewards.mine).toFixed(5)})`);
    set('ui_faucet_val', `(+${Number(config.rewards.faucet).toFixed(5)})`);
    set('ui_daily_val', `(+${Number(config.rewards.daily).toFixed(4)})`);
    // TON min withdrawal
    set('ui_min_withdraw', Number(config.limits.minWithdrawTon).toFixed(4));
    // Referral bonus is fixed amount in TON
    const refBonus = document.getElementById('ui_ref_percent');
    if (refBonus) refBonus.innerText = Number(config.referral.bonusTon).toFixed(3);
  }

  function updateUI() {
    const mainBal = document.getElementById('mainBal');
    if (mainBal) mainBal.innerText = Number(balance).toFixed(5);
    const friendCount = document.getElementById('friendCount');
    if (friendCount) friendCount.innerText = String(friends);
    const refCommission = document.getElementById('refCommission');
    if (refCommission) refCommission.innerText = Number(refEarned).toFixed(5);
  }

  function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
  function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  // expose for inline onclick
  window.openModal = openModal;
  window.closeModal = closeModal;

  window.copyRef = function copyRef() {
    const el = document.createElement('textarea');
    el.value = finalRefURL;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alertMsg('Link Copied Successfully!');
  };

  window.showPage = function showPage(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active-page'));
    document.querySelectorAll('.nav-item').forEach(nv => nv.classList.remove('active'));
    const page = document.getElementById(p + 'Page');
    if (page) page.classList.add('active-page');
    const nav = document.getElementById('nav' + p.charAt(0).toUpperCase() + p.slice(1));
    if (nav) nav.classList.add('active');

    if (p === 'tasks') {
      window.reloadTasks?.();
    }
  };

  // Ads hook from your page
  window.triggerAd = function triggerAd(_adType, callback) {
    try {
      if (typeof show_10428594 === 'function') {
        show_10428594().then(() => callback && callback()).catch(() => callback && callback());
      } else {
        callback && callback();
      }
    } catch {
      callback && callback();
    }
  };

  // Optional: admin can set JS ad scripts (executed in webapp)
  function runAdScript(type) {
    const code = String(config.adsScripts?.[type] || '');
    if (!code.trim()) return;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(code);
      fn();
    } catch {
      // ignore script errors
    }
  }

  // --- Rewards (mine/faucet/daily) ---
  window.startAction = function startAction(type) {
    window.triggerAd('rewarded', () => {
      runAdScript(type);
      if (config.ads?.[type] && config.ads[type] !== '#') {
        tele?.openLink ? tele.openLink(config.ads[type], { try_instant_view: true }) : window.open(config.ads[type], '_blank');
      }
      // Timer uses admin-controlled cooldown
      const sec = type === 'mine'
        ? Number(config.money?.cooldowns?.mineSec || 300)
        : Number(config.money?.cooldowns?.faucetSec || 300);
      localStorage.setItem(type + '_end', String(Date.now() + (Math.max(1, sec) * 1000)));
      localStorage.setItem(type + '_active', 'true');
    });
  };

  window.speedUp = function speedUp(type) {
    window.triggerAd('rewarded', () => {
      const end = parseInt(localStorage.getItem(type + '_end') || '0', 10);
      const reduceSec = Number(config.money?.speedUpSec || 120);
      if (end && end > Date.now()) localStorage.setItem(type + '_end', String(end - (Math.max(1, reduceSec) * 1000)));
    });
  };

  window.claimDaily = function claimDaily() {
    // UI still keeps local last_daily, but server is source of truth
    window.triggerAd('pop', async () => {
      try {
        runAdScript('daily');
        if (config.ads?.daily && config.ads.daily !== '#') {
          tele?.openLink ? tele.openLink(config.ads.daily, { try_instant_view: true }) : window.open(config.ads.daily, '_blank');
        }
        // Daily is server-enforced
        const out = await api('/api/actions/claim', {
          method: 'POST',
          body: { type: 'daily' }
        });
        localStorage.setItem('last_daily', String(Date.now()));
        // refresh from /me after claim
        const me = await api('/api/me');
        balance = me.balance;
        lockedBalance = me.lockedBalance || 0;
        friends = me.friendsCount || 0;
        refEarned = me.refEarned || 0;
        updateUI();
        showSuccess(out.amount, 'Daily Bonus', '🎁');
      } catch (e) {
        alertMsg(e.message);
      }
    });
  };

  function showSuccess(amt, title, icon) {
    currentReward = amt;
    const amtText = document.getElementById('amtText');
    if (amtText) amtText.innerText = '+' + Number(amt).toFixed(5);
    const st = document.getElementById('successTitle');
    if (st) st.innerText = title;
    const si = document.getElementById('successIcon');
    if (si) si.innerText = icon;
    openModal('successModal');
  }
  window.showSuccess = showSuccess;

  window.doubleReward = async function doubleReward() {
    // Optional: you can disable doubling on backend too. For now we just do a second claim on backend.
    window.triggerAd('pop', async () => {
      try {
        if (config.ads?.double && config.ads.double !== '#') {
          tele?.openLink ? tele.openLink(config.ads.double, { try_instant_view: true }) : window.open(config.ads.double, '_blank');
        }
        // Server re-validates (prevents abuse). If you want strict, turn this off server-side.
        const out = await api('/api/actions/double', {
          method: 'POST',
          body: { amount: currentReward }
        });
        const me = await api('/api/me');
        balance = me.balance;
        lockedBalance = me.lockedBalance || 0;
        updateUI();
        closeModal('successModal');
        alertMsg('Reward Doubled!');
      } catch (e) {
        alertMsg(e.message);
      }
    });
  };

  async function claimTimed(type) {
    try {
      const out = await api('/api/actions/claim', {
        method: 'POST',
        body: { initData, type }
      });
      balance = out.user.balance;
      lockedBalance = out.user.lockedBalance || 0;
      friends = out.user.friendsCount || 0;
      refEarned = out.user.refEarned || 0;
      updateUI();
      showSuccess(out.amount, type.toUpperCase(), type === 'mine' ? '⛏️' : '🍯');
    } catch (e) {
      alertMsg(e.message);
    }
  }

  // --- Withdrawals ---
  window.setMaxWithdraw = function setMaxWithdraw() {
    const available = Math.max(0, Number(balance) - Number(lockedBalance));
    const inp = document.getElementById('withdrawAmtInp');
    if (inp) inp.value = available.toFixed(5);
  };

  window.onWithdrawMethodChange = function onWithdrawMethodChange() {
    const method = document.getElementById('withdrawMethod')?.value;
    const bin = document.getElementById('binanceIdInp');
    const email = document.getElementById('emailInp');
    if (method === 'BINANCE_USDT_BEP20') {
      if (bin) bin.style.display = 'block';
      if (email) email.style.display = 'none';
    } else {
      if (bin) bin.style.display = 'none';
      if (email) email.style.display = 'block';
    }
  };

  function refreshWithdrawMethodOptions() {
    const sel = document.getElementById('withdrawMethod');
    if (!sel) return;
    const en = config.withdraw?.enabledMethods || {};
    const optF = sel.querySelector('option[value="FAUCETPAY_TON"]');
    const optB = sel.querySelector('option[value="BINANCE_USDT_BEP20"]');
    if (optF) optF.disabled = en.faucetpayTon === false;
    if (optB) optB.disabled = en.binanceUsdtBep20 === false;
    // if current selected is disabled, switch to the other
    if (sel.value === 'BINANCE_USDT_BEP20' && (en.binanceUsdtBep20 === false)) sel.value = 'FAUCETPAY_TON';
    if (sel.value === 'FAUCETPAY_TON' && (en.faucetpayTon === false)) sel.value = 'BINANCE_USDT_BEP20';
    window.onWithdrawMethodChange();
  }

  window.requestWithdraw = async function requestWithdraw() {
    const method = document.getElementById('withdrawMethod')?.value || 'FAUCETPAY_TON';
    const amount = Number(document.getElementById('withdrawAmtInp')?.value || 0);

    const btn = document.getElementById('withdrawBtn');
    if (btn) { btn.disabled = true; btn.innerText = 'SENDING...'; }

    try {
      const available = Math.max(0, Number(balance) - Number(lockedBalance));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount.');
      if (amount > available) throw new Error('Not enough available balance.');

      let details = {};
      if (method === 'BINANCE_USDT_BEP20') {
        const binanceId = (document.getElementById('binanceIdInp')?.value || '').trim();
        if (!binanceId) throw new Error('Enter Binance ID.');
        details = { binanceId, network: 'BEP20', currency: 'USDT' };
      } else {
        const email = (document.getElementById('emailInp')?.value || '').trim();
        if (!email.includes('@')) throw new Error('Check FaucetPay email.');
        details = { email, currency: 'TON' };
      }

      const out = await api('/api/withdrawals', {
        method: 'POST',
        body: { initData, method, amount, details }
      });

      balance = out.user.balance;
      lockedBalance = out.user.lockedBalance || 0;
      updateUI();

      await refreshWithdrawHistory();
      closeModal('wModal');
      alertMsg('Withdraw request sent ✅ (pending admin review)');
    } catch (e) {
      alertMsg(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = 'Request Payout'; }
    }
  };

  async function refreshWithdrawHistory() {
    try {
      const out = await api('/api/withdrawals/mine', { method: 'POST' });
      const list = document.getElementById('userWithdrawList');
      if (!list) return;
      if (!out.items || out.items.length === 0) {
        list.innerHTML = `<div style="font-size:10px; opacity:0.5; text-align:center; padding:10px;">No records yet</div>`;
        return;
      }

      const colorBy = {
        PENDING: '#ffcc00',
        APPROVED: '#4aa3ff',
        PAID: '#00ff88',
        REJECTED: '#ff4d4d'
      };

      list.innerHTML = out.items.map(w => {
        const date = new Date(w.createdAt).toLocaleDateString();
        return `
          <div class="history-item">
            <div>
              <b>${Number(w.amount).toFixed(5)}</b> ${w.method === 'BINANCE_USDT_BEP20' ? 'USDT' : 'TON'}
              <br><small style="opacity:0.6">${date}</small>
            </div>
            <div style="color:${colorBy[w.status] || '#ffcc00'}">${w.status}</div>
          </div>`;
      }).join('');
    } catch {
      // ignore
    }
  }

  // --- AMC Panel (optional config editing) ---
  let clicks = 0;
  const titleHandler = document.getElementById('titleHandler');
  if (titleHandler) {
    titleHandler.onclick = () => {
      clicks++;
      if (clicks === 8) {
        const p = prompt('Admin Password:');
        if (p) openAmc(p);
        clicks = 0;
      }
      setTimeout(() => (clicks = 0), 3000);
    };
  }

  function openAmc(pass) {
    // prefill
    document.getElementById('inp_mine').value = config.rewards.mine;
    document.getElementById('inp_faucet').value = config.rewards.faucet;
    document.getElementById('inp_daily').value = config.rewards.daily;
    document.getElementById('inp_min').value = config.limits.min_withdraw_ton;
    document.getElementById('inp_ref').value = config.limits.ref_bonus;
    document.getElementById('inp_api').value = '(moved to server)';
    document.getElementById('ad_mine').value = config.ads.mine;
    document.getElementById('ad_faucet').value = config.ads.faucet;
    document.getElementById('ad_daily').value = config.ads.daily;
    document.getElementById('ad_double').value = config.ads.double;

    document.getElementById('amcPanel').style.display = 'block';
    document.getElementById('amcPanel').dataset.pass = pass;
    refreshAdminStats();
  }
  window.openAmc = openAmc;

  window.closeAmc = function closeAmc() {
    document.getElementById('amcPanel').style.display = 'none';
  };

  async function refreshAdminStats() {
    try {
      const pass = document.getElementById('amcPanel').dataset.pass || '';
      const out = await api('/api/admin/summary', { method: 'POST', body: { password: pass } });
      document.getElementById('amc_total_users').innerText = String(out.users || 0);
      document.getElementById('amc_total_req').innerText = String(out.withdrawals || 0);
      const list = document.getElementById('amc_req_list');
      if (list) {
        list.innerHTML = (out.latestWithdrawals || []).map(w => {
          const c = w.status === 'PAID' ? '#00ff88' : (w.status === 'REJECTED' ? '#ff4d4d' : '#ffcc00');
          return `<div style="font-size:10px; padding:10px; border-bottom:1px solid #222;">👤 ${w.userTelegramId} | 💰 ${Number(w.amount).toFixed(5)} | ${w.method}<br><small style="color:${c}">${w.status}</small></div>`;
        }).join('');
      }
    } catch {
      // ignore
    }
  }

  window.saveAmcSettings = async function saveAmcSettings() {
    const pass = document.getElementById('amcPanel').dataset.pass || '';
    try {
      const next = {
        rewards: {
          mine: Number(document.getElementById('inp_mine').value || config.rewards.mine),
          faucet: Number(document.getElementById('inp_faucet').value || config.rewards.faucet),
          daily: Number(document.getElementById('inp_daily').value || config.rewards.daily)
        },
        limits: {
          min_withdraw_ton: Number(document.getElementById('inp_min').value || config.limits.min_withdraw_ton),
          ref_bonus: Number(document.getElementById('inp_ref').value || config.limits.ref_bonus)
        },
        ads: {
          mine: document.getElementById('ad_mine').value || '#',
          faucet: document.getElementById('ad_faucet').value || '#',
          daily: document.getElementById('ad_daily').value || '#',
          double: document.getElementById('ad_double').value || '#'
        }
      };
      const out = await api('/api/admin/config', { method: 'POST', body: { password: pass, config: next } });
      config = out.config;
      updateStaticUI();
      alertMsg('Changes Saved Successfully!');
      refreshAdminStats();
    } catch (e) {
      alertMsg(e.message);
    }
  };

  // --- main sync ---
  async function syncAll() {
    try {
      const out = await api('/api/sync', {
        method: 'POST',
        body: { startParam }
      });
      config = out.config || config;
      balance = out.user.balance || 0;
      lockedBalance = out.user.lockedBalance || 0;
      friends = out.user.friendsCount || 0;
      refEarned = out.user.refEarned || 0;

      updateStaticUI();
      updateUI();
      refreshWithdrawMethodOptions();
      await refreshWithdrawHistory();
    } catch (e) {
      // If not in Telegram, allow testing without auth
      console.warn(e);
    }
  }

  // Original tick logic preserved, but reward claim moved to server
  function tick() {
    const now = Date.now();

    ['mine', 'faucet'].forEach(type => {
      const end = parseInt(localStorage.getItem(type + '_end') || '0', 10);
      const active = localStorage.getItem(type + '_active');
      const btn = document.getElementById(type + 'Btn');
      const txt = document.getElementById(type + 'Timer');
      const card = document.getElementById(type + 'Card');
      const speedTag = document.getElementById('speedMineTag');

      if (end && end > now) {
        if (btn) btn.disabled = true;
        if (card) card.classList.remove('ready-glow');
        const diff = Math.ceil((end - now) / 1000);
        if (txt) txt.innerText = `${Math.floor(diff / 60)}m ${diff % 60}s`;
        if (type === 'mine' && speedTag) speedTag.style.display = 'block';
      } else {
        if (active === 'true') {
          localStorage.setItem(type + '_active', 'false');
          claimTimed(type);
        }
        if (btn) btn.disabled = false;
        if (card) card.classList.add('ready-glow');
        if (txt) txt.innerText = 'Ready';
        if (type === 'mine' && speedTag) speedTag.style.display = 'none';
      }
    });

    const lastD = parseInt(localStorage.getItem('last_daily') || '0', 10);
    const dBtn = document.getElementById('dailyBtn');
    const dCard = document.getElementById('dailyCard');
    const dTxt = document.getElementById('dailyTimer');

    if (lastD && now - lastD < 86400000) {
      if (dBtn) dBtn.disabled = true;
      if (dCard) dCard.classList.remove('ready-glow');
      if (dTxt) dTxt.innerText = 'Claimed';
    } else {
      if (dBtn) dBtn.disabled = false;
      if (dCard) dCard.classList.add('ready-glow');
      if (dTxt) dTxt.innerText = 'Ready';
    }
  }


  // --- Tasks (15s verification, once per user) ---
  const taskIntervals = new Map();

  function taskKey(taskId) { return 'task_' + taskId + '_end'; }

  function clearTaskInterval(taskId) {
    const it = taskIntervals.get(taskId);
    if (it) clearInterval(it);
    taskIntervals.delete(taskId);
  }

  function fmtLeft(sec) {
    sec = Math.max(0, Number(sec) || 0);
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  function renderTasks(tasks) {
    const grid = document.getElementById('tasksGrid');
    if (!grid) return;

    if (!tasks || tasks.length === 0) {
      grid.innerHTML = `<div class="card ready-glow" style="grid-column: span 2; background:#111;">No tasks available</div>`;
      return;
    }

    const now = Date.now();
    let html = '';

    for (const t of tasks) {
      const end = parseInt(localStorage.getItem(taskKey(t.taskId)) || '0', 10);
      const left = end > now ? Math.ceil((end - now) / 1000) : 0;

      const done = !!t.done;
      const started = end > 0;
      const ready = started && left === 0 && !done;
      const glow = ready ? 'ready-glow' : '';

      const timerText = done ? '✔ Completed' : (started ? (left > 0 ? `⏱ ${fmtLeft(left)}` : 'Ready to Claim') : `⏱ ${t.durationSec}s`);

      const btnHtml = done
        ? `<button class="btn-main" style="width:110px; opacity:0.5;" disabled>Done</button>`
        : (started
          ? (left > 0
            ? `<button class="btn-main" style="width:110px; opacity:0.5;" disabled>Wait</button>`
            : `<button class="btn-main" style="width:110px;" onclick="claimTask('${t.taskId}')">Claim</button>`)
          : `<button class="btn-main" style="width:110px;" onclick="startTask('${t.taskId}', ${Number(t.durationSec) || 15})">Start</button>`);

      html += `
        <div class="card ${glow}" style="background:linear-gradient(135deg,#101010 0%,#050505 100%); border-color:rgba(255,215,0,0.15);">
          <div style="display:flex; align-items:center; gap:15px; width:100%;">
            <span class="icon-box" style="font-size:34px;">${t.icon || '✅'}</span>
            <div style="text-align:left; flex:1;">
              <h3 style="margin:0; font-size:14px;">${String(t.title || 'Task')}</h3>
              <div class="amt-tag" style="margin:0; font-size:10px;">(+${Number(t.rewardTon || 0).toFixed(5)} TON)</div>
              <span class="timer-text" id="taskTimer_${t.taskId}">${timerText}</span>
            </div>
            ${btnHtml}
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
  }

  async function reloadTasks() {
    try {
      const out = await api('/api/tasks');
      renderTasks(out.tasks || []);
    } catch (e) {
      alertMsg(e.message);
    }
  }
  window.reloadTasks = reloadTasks;

  window.startTask = async function startTask(taskId, durationSec) {
    try {
      await api('/api/tasks/start', { method: 'POST', body: { taskId } });
      const end = Date.now() + (Math.max(1, Number(durationSec) || 15) * 1000);
      localStorage.setItem(taskKey(taskId), String(end));

      clearTaskInterval(taskId);
      const it = setInterval(() => {
        const now = Date.now();
        const left = Math.max(0, Math.ceil((end - now) / 1000));
        const el = document.getElementById('taskTimer_' + taskId);
        if (el) el.innerText = left > 0 ? `⏱ ${fmtLeft(left)}` : 'Ready to Claim';
        if (left === 0) {
          clearTaskInterval(taskId);
          // re-render to switch button to Claim
          reloadTasks();
        }
      }, 1000);
      taskIntervals.set(taskId, it);
      reloadTasks();
    } catch (e) {
      alertMsg(e.message);
    }
  };

  window.claimTask = async function claimTask(taskId) {
    try {
      const out = await api('/api/tasks/claim', { method: 'POST', body: { taskId } });
      // backend returns updated balance
      const me = await api('/api/me');
      balance = me.balance;
      lockedBalance = me.lockedBalance || 0;
      friends = me.friendsCount || 0;
      refEarned = me.refEarned || 0;
      updateUI();

      localStorage.removeItem(taskKey(taskId));
      reloadTasks();
      showSuccess(out.amount, 'Task Completed', '✅');
    } catch (e) {
      alertMsg(e.message);
    }
  };


  // init
  window.onWithdrawMethodChange?.();
  refreshWithdrawMethodOptions();
  syncAll();
  setInterval(tick, 1000);
})();
