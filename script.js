/* =========================================================
   TEAM SEARCH CS2 — OPTIMIZED SCRIPT.JS
   ========================================================= */

// ===== SUPABASE =====
const SUPABASE_URL = 'https://tuhvornfjgbhdygbpoou.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1aHZvcm5mamdiaGR5Z2Jwb291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzY1NzAsImV4cCI6MjEwNjA1MjU3MH0.CIuKaG3fEFTV3_VHH7JwLVbJ5HTbhxOdbReSj7LiiAA';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('Supabase подключён:', SUPABASE_URL);

// =========================================================
// ЧАСТЬ 1 — БАЗА, КЭШИ, УТИЛИТЫ
// =========================================================

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentUser = null;
let currentLang = 'ru';

// ===== КЭШИ (в памяти) =====
window._nickCache = {};      // id -> nick
window._teamCache = {};      // id -> {name, ownerName, max_elo}
window._friendsCache = null; // последний список друзей
window._statusCache = {};    // id -> status
window._cacheTime = {};      // timestamp последнего обновления

// ===== ХЕЛПЕРЫ КЭША =====
const CACHE_TTL = 30000; // 30 секунд

function cacheValid(key) {
  const t = window._cacheTime[key];
  return t && (Date.now() - t) < CACHE_TTL;
}

function setCacheTime(key) {
  window._cacheTime[key] = Date.now();
}

// ===== НИКИ (кэш навсегда до перезагрузки) =====
async function getNick(userId) {
  if (window._nickCache[userId]) return window._nickCache[userId];
  const { data } = await supabaseClient.from('profiles').select('nick').eq('id', userId).single();
  const nick = data?.nick || 'Unknown';
  window._nickCache[userId] = nick;
  return nick;
}

async function getNicks(userIds) {
  const missing = userIds.filter(id => !window._nickCache[id]);
  if (missing.length > 0) {
    const { data } = await supabaseClient.from('profiles').select('id, nick').in('id', missing);
    (data || []).forEach(p => { window._nickCache[p.id] = p.nick; });
  }
  const result = {};
  userIds.forEach(id => { result[id] = window._nickCache[id] || 'Unknown'; });
  return result;
}

// ===== ЭКРАНИРОВАНИЕ HTML =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== TOAST =====
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== МОДАЛКА =====
function openModal(html, options = {}) {
  const el = document.getElementById('modal-content');
  if (el) el.innerHTML = html;
  const bg = document.getElementById('modal-bg');
  bg.classList.add('show');
  if (options.lockBackdrop) {
    bg.classList.add('modal-locked');
  } else {
    bg.classList.remove('modal-locked');
  }
}
function closeModal() {
  document.getElementById('modal-bg').classList.remove('show');
}

// ===== ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ =====
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  // Ленивая загрузка: грузим ТОЛЬКО нужную страницу
  if (page === 'home' || page === 'teams') renderTeams();
  if (page === 'invites') renderInvites();
  if (page === 'friends') renderFriends();
  if (page === 'messages') renderDialogs();
  if (page === 'profile') renderProfile();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== ЯЗЫК =====
function setLang(lang) {
  currentLang = lang;
  const authBtn = document.getElementById('nav-auth-btn');
  if (authBtn) authBtn.textContent = currentUser ? 'Выйти' : 'Войти';
  document.getElementById('lang-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');
}

// =========================================================
// ЧАСТЬ 2 — КОМАНДЫ (ОПТИМИЗИРОВАНО)
// =========================================================

async function renderTeams(force = false) {
  const homeGrid = document.getElementById('home-grid');
  const teamsGrid = document.getElementById('teams-grid');
  if (!homeGrid || !teamsGrid) return;

  // Если есть кэш и не force — используем
  if (!force && window._teamsList && cacheValid('teams')) {
    const cached = window._teamsList;
    renderTeamsList(cached, homeGrid, teamsGrid);
    return;
  }

  // Загружаем всё ПАРАЛЛЕЛЬНО
  const [teamsRes, membersRes, profilesRes] = await Promise.all([
    supabaseClient.from('teams').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('team_members').select('team_id, user_id'),
    supabaseClient.from('profiles').select('id, nick')
  ]);

  if (teamsRes.error) {
    homeGrid.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    teamsGrid.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    return;
  }

  const nickById = {};
  (profilesRes.data || []).forEach(p => {
    nickById[p.id] = p.nick;
    window._nickCache[p.id] = p.nick; // прогреваем кэш ников
  });

  const membersByTeam = {};
  (membersRes.data || []).forEach(m => {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
    membersByTeam[m.team_id].push(m.user_id);
  });

  const allTeams = (teamsRes.data || []).map(t => ({
    id: t.id,
    name: t.name,
    desc: t.description,
    maxElo: t.max_elo,
    req: t.requirements,
    roles: t.roles || [],
    slots: t.slots,
    ownerId: t.owner_id,
    ownerName: nickById[t.owner_id] || 'Unknown',
    members: membersByTeam[t.id] || [],
    memberNames: (membersByTeam[t.id] || []).map(uid => nickById[uid] || 'Unknown')
  }));

  window._teamsList = allTeams;
  setCacheTime('teams');

  renderTeamsList(allTeams, homeGrid, teamsGrid);
}

function renderTeamsList(allTeams, homeGrid, teamsGrid) {
  const search = (document.getElementById('search')?.value || '').toLowerCase();
  const filterRole = document.getElementById('filter-role')?.value || '';
  const filterElo = parseInt(document.getElementById('filter-elo')?.value || '0', 10);

  const filtered = allTeams.filter(t => {
    if (search && !t.name.toLowerCase().includes(search)) return false;
    if (filterRole && !t.roles.includes(filterRole)) return false;
    if (filterElo && t.maxElo < filterElo) return false;
    return true;
  });

  homeGrid.innerHTML = filtered.length
    ? filtered.slice(0, 3).map(teamCard).join('')
    : '<div class="empty">Пока нет команд. Создай первую!</div>';

  teamsGrid.innerHTML = filtered.length
    ? filtered.map(teamCard).join('')
    : '<div class="empty">Ничего не найдено</div>';
}

function teamCard(t) {
  const filled = t.members.length;
  const total = t.slots;
  const dots = Array.from({ length: total }, (_, i) =>
    `<div class="slot-dot ${i < filled ? 'filled' : ''}"></div>`
  ).join('');

  return `
    <div class="card" onclick="showTeam('${t.id}')">
      <div class="card-head">
        <div class="card-title">${escapeHtml(t.name)}</div>
        <div class="elo-badge">${t.maxElo}</div>
      </div>
      <div class="card-desc">${escapeHtml(t.desc || 'Без описания')}</div>
      <div class="roles">${t.roles.map(r => `<span class="role-tag">${r}</span>`).join('') || '<span class="role-tag">—</span>'}</div>
      <div class="card-foot">
        <div class="slots">${dots}<span style="margin-left:6px;">${filled}/${total}</span></div>
        <div>${escapeHtml(t.ownerName)}</div>
      </div>
    </div>
  `;
}

// ===== МОДАЛКА КОМАНДЫ (СРАЗУ ОТКРЫВАЕТСЯ, ДАННЫЕ ПАРАЛЛЕЛЬНО) =====
async function showTeam(id) {
  // Мгновенно показываем модалку из кэша
  const cached = window._teamCache[id];
  openModal(cached ? `
    <h3>${escapeHtml(cached.name)}</h3>
    <p class="sub">Владелец: ${escapeHtml(cached.ownerName)} • Макс. ЭЛО: ${cached.max_elo}</p>
    <div class="empty" style="margin:auto;">Загрузка...</div>
  ` : `<div class="empty" style="margin:auto;">Загрузка...</div>`);

  // 1) Параллельно: команда + участники
  const [teamRes, membersRes] = await Promise.all([
    supabaseClient.from('teams').select('*').eq('id', id).single(),
    supabaseClient.from('team_members').select('user_id').eq('team_id', id)
  ]);

  const t = teamRes.data;
  if (!t) { toast('Команда не найдена'); closeModal(); return; }

  const memberIds = (membersRes.data || []).map(m => m.user_id);
  const allIds = [...new Set([...memberIds, t.owner_id])];

  // 2) Ники + статусы параллельно
  const [nickById, statusRes] = await Promise.all([
    getNicks(allIds),
    allIds.length
      ? supabaseClient.from('user_status').select('user_id, status').in('user_id', allIds)
      : Promise.resolve({ data: [] })
  ]);

  const statusById = {};
  (statusRes.data || []).forEach(s => { statusById[s.user_id] = s.status; });

  const memberNames = memberIds.map(uid => nickById[uid] || 'Unknown');
  const ownerName = nickById[t.owner_id] || 'Unknown';
  const isOwner = currentUser && t.owner_id === currentUser.id;
  const isMember = currentUser && memberIds.includes(currentUser.id);

  window._currentTeamId = t.id;
  window._teamCache[id] = { name: t.name, ownerName, max_elo: t.max_elo };

  // 3) Параллельно: заявка + голосование
  const promises = [];
  let alreadyInvited = false;
  let activeDiss = null;

  if (currentUser && !isOwner && !isMember) {
    promises.push(
      supabaseClient.from('invites').select('id')
        .eq('team_id', id).eq('from_user_id', currentUser.id).eq('status', 'pending')
        .maybeSingle().then(r => { alreadyInvited = !!r.data; })
    );
  }

  if (isOwner) {
    promises.push(
      supabaseClient.from('team_dissolutions').select('id')
        .eq('team_id', t.id).eq('status', 'active').maybeSingle()
        .then(r => { activeDiss = r.data; })
    );
  }

  if (promises.length) await Promise.all(promises);

  // 4) Кнопка действия
  const rolesHtml = (t.roles || []).map(r => `<span class="role-tag">${r}</span>`).join('');
  let actionBtn = '';

  if (!currentUser) {
    actionBtn = `<button class="btn btn-primary btn-block" onclick="closeModal(); go('auth')">Войти, чтобы подать заявку</button>`;
  } else if (isOwner) {
    if (activeDiss) {
      actionBtn = `<button class="btn btn-block" disabled style="opacity:0.5;cursor:default;">Голосование идёт</button>`;
    } else {
      actionBtn = `
        <button class="btn btn-block" disabled style="opacity:0.5;cursor:default;margin-bottom:8px;">Это ваша команда</button>
        <button class="btn btn-block" style="border-color:#553333;color:#ff6666;" onclick="startDissolution('${t.id}')">Распустить команду</button>
      `;
    }
  } else if (isMember) {
    actionBtn = `<button class="btn btn-block" disabled style="opacity:0.5;cursor:default;">Вы уже в команде</button>`;
  } else if (alreadyInvited) {
    actionBtn = `<button class="btn btn-block" disabled style="opacity:0.5;cursor:default;">Заявка отправлена</button>`;
  } else if (memberIds.length >= t.slots) {
    actionBtn = `<button class="btn btn-block" disabled style="opacity:0.5;cursor:default;">Команда заполнена</button>`;
  } else {
    actionBtn = `<button class="btn btn-primary btn-block" onclick="sendInvite('${t.id}')">Подать заявку</button>`;
  }

  // 5) Блок голосования — только для участников
  let dissolutionHtml = '';
  if (isMember) {
    dissolutionHtml = await getDissolutionBlock(t.id, memberIds);
  }

  // 6) Модалка
  openModal(`
    <h3>${escapeHtml(t.name)}</h3>
    <p class="sub">Владелец: ${escapeHtml(ownerName)} • Макс. ЭЛО: ${t.max_elo}</p>

    ${isMember ? `
      <div class="team-tabs">
        <button class="team-tab active" onclick="switchTeamTab('info')">Инфо</button>
        <button class="team-tab" onclick="switchTeamTab('chat')">Чат</button>
      </div>
    ` : ''}

    <div id="team-tab-info" class="team-tab-content active">
      <p style="color:var(--text-dim);font-size:14px;margin-bottom:16px;">${escapeHtml(t.description || 'Без описания')}</p>
      ${dissolutionHtml}

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Нужные роли</div>
        <div class="roles">${rolesHtml || '<span class="role-tag">—</span>'}</div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Требования</div>
        <div style="font-size:14px;color:var(--text);">${escapeHtml(t.requirements || 'Не указаны')}</div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Состав (${memberIds.length}/${t.slots})</div>
        <div style="font-size:14px;">
          ${memberIds.length
            ? memberIds.map((uid, i) =>
                `<div style="margin-bottom:6px;">• <span class="status-dot status-${statusById[uid] || 'offline'}" style="width:8px;height:8px;"></span> <span class="member-link" onclick="openUserProfile('${uid}')">${escapeHtml(memberNames[i])}</span></div>`
              ).join('')
            : 'Пока никого'}
        </div>
      </div>

      ${actionBtn}
    </div>

    ${isMember ? `
      <div id="team-tab-chat" class="team-tab-content" style="display:none;">
        <div id="team-chat-messages" class="team-chat-messages"><div class="empty">Загрузка...</div></div>
        <div class="team-chat-input">
          <input type="text" id="team-chat-input" placeholder="Написать сообщение..." maxlength="2000" onkeydown="if(event.key==='Enter') sendTeamMessage('${t.id}')">
          <button class="btn btn-primary btn-sm" onclick="sendTeamMessage('${t.id}')">Отправить</button>
        </div>
      </div>
    ` : ''}

    <button class="btn btn-block" style="margin-top:8px;" onclick="closeModal()">Закрыть</button>
  `);
}

function switchTeamTab(tab) {
  document.querySelectorAll('.team-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.team-tab-content').forEach(c => c.style.display = 'none');
  const btn = document.querySelector(`.team-tab[onclick*="'${tab}'"]`);
  if (btn) btn.classList.add('active');
  const content = document.getElementById('team-tab-' + tab);
  if (content) content.style.display = 'block';
  if (tab === 'chat' && window._currentTeamId) loadTeamChat(window._currentTeamId);
}

async function createTeam() {
  if (!currentUser) { toast('Сначала войди в аккаунт'); go('auth'); return; }

  const name = document.getElementById('t-name').value.trim();
  const desc = document.getElementById('t-desc').value.trim();
  const maxElo = parseInt(document.getElementById('t-elo').value, 10);
  const req = document.getElementById('t-req').value.trim();
  const roles = Array.from(document.querySelectorAll('.role-check input:checked')).map(c => c.value);

  if (!name || name.length < 3) { toast('Название минимум 3 символа'); return; }
  if (!maxElo || maxElo < 0 || maxElo > 5000) { toast('ЭЛО от 0 до 5000'); return; }
  if (!roles.length) { toast('Выбери хотя бы одну роль'); return; }
  if (req.length > 250) { toast('Требования не более 250 символов'); return; }

  toast('Создаём команду...');

  const { data: newTeam, error } = await supabaseClient
    .from('teams')
    .insert({ name, description: desc, max_elo: maxElo, requirements: req, roles, slots: 5, owner_id: currentUser.id })
    .select().single();

  if (error) { toast('Ошибка: ' + error.message); return; }

  await supabaseClient.from('team_members').insert({ team_id: newTeam.id, user_id: currentUser.id });

  toast('Команда создана!');
  window._teamsList = null; // сбрасываем кэш
  window._cacheTime.teams = 0;

  document.getElementById('t-name').value = '';
  document.getElementById('t-desc').value = '';
  document.getElementById('t-elo').value = 2500;
  document.getElementById('t-req').value = '';
  document.querySelectorAll('.role-check input:checked').forEach(c => c.checked = false);

  go('teams');
}

// =========================================================
// ЧАСТЬ 3 — ЗАЯВКИ, РОСПУСК, ДРУЗЬЯ, СТАТУСЫ
// =========================================================

async function sendInvite(teamId) {
  if (!currentUser) { go('auth'); return; }

  const { data: team } = await supabaseClient
    .from('teams').select('id, owner_id').eq('id', teamId).single();
  if (!team) { toast('Команда не найдена'); return; }
  if (team.owner_id === currentUser.id) { toast('Это ваша команда'); return; }

  const { data: already } = await supabaseClient
    .from('invites').select('id').eq('team_id', teamId)
    .eq('from_user_id', currentUser.id).eq('status', 'pending').maybeSingle();
  if (already) { toast('Заявка уже отправлена'); return; }

  const { error } = await supabaseClient.from('invites').insert({
    team_id: teamId, from_user_id: currentUser.id, to_user_id: team.owner_id, status: 'pending'
  });

  if (error) { toast('Ошибка: ' + error.message); return; }

  closeModal();
  toast('Заявка отправлена!');
}

async function renderInvites() {
  const inBox = document.getElementById('invites-in');
  const outBox = document.getElementById('invites-out');
  if (!inBox || !outBox) return;

  if (!currentUser) {
    inBox.innerHTML = '<div class="empty">Войди, чтобы видеть приглашения</div>';
    outBox.innerHTML = '';
    return;
  }

  const [inRes, outRes] = await Promise.all([
    supabaseClient.from('invites').select('*').eq('to_user_id', currentUser.id).order('created_at', { ascending: false }),
    supabaseClient.from('invites').select('*').eq('from_user_id', currentUser.id).order('created_at', { ascending: false })
  ]);

  const incoming = inRes.data || [];
  const outgoing = outRes.data || [];
  const all = [...incoming, ...outgoing];
  const teamIds = [...new Set(all.map(i => i.team_id))];
  const userIds = [...new Set([...all.map(i => i.from_user_id), ...all.map(i => i.to_user_id)])];

  const [teamsRes, nickById] = await Promise.all([
    teamIds.length ? supabaseClient.from('teams').select('id, name').in('id', teamIds) : { data: [] },
    getNicks(userIds)
  ]);

  const teamNameById = {};
  (teamsRes.data || []).forEach(t => { teamNameById[t.id] = t.name; });

  inBox.innerHTML = incoming.length
    ? incoming.map(i => inviteRowIn(i, teamNameById, nickById)).join('')
    : '<div class="empty">Входящих приглашений нет</div>';

  outBox.innerHTML = outgoing.length
    ? outgoing.map(i => inviteRowOut(i, teamNameById, nickById)).join('')
    : '<div class="empty">Исходящих заявок нет</div>';
}

function inviteRowIn(i, teamNameById, nickById) {
  const teamName = teamNameById[i.team_id] || 'Unknown';
  const fromNick = nickById[i.from_user_id] || 'Unknown';
  let actions = '';
  if (i.status === 'pending') {
    actions = `
      <button class="btn btn-primary btn-sm" onclick="acceptInvite('${i.id}')">Принять</button>
      <button class="btn btn-sm" onclick="declineInvite('${i.id}')">Отклонить</button>
    `;
  } else if (i.status === 'accepted') actions = '<span style="color:var(--text-dim);font-size:13px;">✓ Принято</span>';
  else actions = '<span style="color:var(--text-dim);font-size:13px;">✕ Отклонено</span>';

  return `<div class="invite-row"><div class="invite-info"><div class="name">${escapeHtml(fromNick)}</div><div class="meta">Хочет вступить в <b>${escapeHtml(teamName)}</b></div></div><div class="invite-actions">${actions}</div></div>`;
}

function inviteRowOut(i, teamNameById, nickById) {
  const teamName = teamNameById[i.team_id] || 'Unknown';
  const toNick = nickById[i.to_user_id] || 'Unknown';
  const st = { pending: '⏳ Ожидает', accepted: '✓ Принято', declined: '✕ Отклонено' }[i.status] || '';
  return `<div class="invite-row"><div class="invite-info"><div class="name">${escapeHtml(teamName)}</div><div class="meta">Владелец: ${escapeHtml(toNick)}</div></div><div class="invite-actions"><span style="color:var(--text-dim);font-size:13px;">${st}</span></div></div>`;
}

async function acceptInvite(inviteId) {
  const { data: inv } = await supabaseClient.from('invites').select('*').eq('id', inviteId).single();
  if (!inv) return;

  const { error } = await supabaseClient.from('team_members').insert({
    team_id: inv.team_id, user_id: inv.from_user_id
  });

  if (error) { toast('Ошибка: ' + error.message); return; }

  await supabaseClient.from('invites').update({ status: 'accepted' }).eq('id', inviteId);
  toast('Игрок принят!');
  renderInvites();
  window._teamsList = null;
}

async function declineInvite(inviteId) {
  await supabaseClient.from('invites').update({ status: 'declined' }).eq('id', inviteId);
  toast('Заявка отклонена');
  renderInvites();
}

// ===== РОСПУСК =====
async function startDissolution(teamId) {
  if (!currentUser) return;
  if (!confirm('Запустить голосование за роспуск?')) return;

  const { error } = await supabaseClient.rpc('start_dissolution', { p_team_id: teamId });
  if (error) { toast('Ошибка: ' + error.message); return; }

  toast('Голосование запущено!');
  closeModal();
  setTimeout(() => showTeam(teamId), 300);
}

async function voteDissolution(dissolutionId, vote) {
  if (!currentUser) return;
  const { error } = await supabaseClient.from('dissolution_votes').insert({
    dissolution_id: dissolutionId, user_id: currentUser.id, vote
  });
  if (error) { toast(error.message.includes('duplicate') ? 'Ты уже голосовал' : 'Ошибка'); return; }
  toast('Голос принят');
  closeModal();
}

async function getDissolutionBlock(teamId, memberIds) {
  if (!currentUser) return '';
  const { data: d } = await supabaseClient.from('team_dissolutions').select('*')
    .eq('team_id', teamId).eq('status', 'active').maybeSingle();
  if (!d) return '';

  const { data: votes } = await supabaseClient.from('dissolution_votes').select('*').eq('dissolution_id', d.id);
  const yes = (votes || []).filter(v => v.vote === 'yes').length;
  const no = (votes || []).filter(v => v.vote === 'no').length;
  const needed = Math.floor(memberIds.length / 2) + 1;
  const myVote = (votes || []).find(v => v.user_id === currentUser.id);
  const isMember = memberIds.includes(currentUser.id);

  let btn = '';
  if (isMember && !myVote) {
    btn = `<div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn btn-primary" style="flex:1;" onclick="voteDissolution('${d.id}', 'yes')">За</button>
      <button class="btn" style="flex:1;" onclick="voteDissolution('${d.id}', 'no')">Против</button>
    </div>`;
  } else if (myVote) {
    btn = `<div style="color:var(--text-dim);font-size:13px;margin-top:10px;">Ты проголосовал: <b>${myVote.vote === 'yes' ? 'За' : 'Против'}</b></div>`;
  }

  return `<div style="background:#1a0f0f;border:1px solid #553333;border-radius:10px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;color:#ff9999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:700;">🗳 Голосование</div>
    <div style="font-size:14px;margin-bottom:4px;">За: <b>${yes}</b> из <b>${needed}</b></div>
    <div style="font-size:13px;color:var(--text-dim);">Против: ${no}</div>
    ${btn}
  </div>`;
}

// ===== ДРУЗЬЯ =====
async function sendFriendRequest(friendId) {
  if (!currentUser) return;
  if (friendId === currentUser.id) { toast('Это ты сам'); return; }

  const { error } = await supabaseClient.from('friendships').insert({
    user_id: currentUser.id, friend_id: friendId, status: 'pending'
  });
  if (error) { toast('Ошибка: ' + error.message); return; }

  toast('Запрос отправлен!');
  closeModal();
  window._friendsCache = null;
  updateFriendsBadge();
}

async function acceptFriend(fid) {
  await supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', fid);
  toast('Теперь вы друзья!');
  window._friendsCache = null;
  renderFriends();
  updateFriendsBadge();
}

async function declineFriend(fid) {
  await supabaseClient.from('friendships').update({ status: 'declined' }).eq('id', fid);
  toast('Отклонено');
  window._friendsCache = null;
  renderFriends();
  updateFriendsBadge();
}

async function cancelFriendRequest(fid) {
  if (!confirm('Отменить запрос?')) return;
  await supabaseClient.from('friendships').delete().eq('id', fid);
  toast('Отменено');
  window._friendsCache = null;
  renderFriends();
  updateFriendsBadge();
}

async function updateFriendsBadge() {
  const badge = document.getElementById('friends-badge');
  if (!badge) return;
  if (!currentUser) { badge.style.display = 'none'; return; }

  const { count } = await supabaseClient.from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('friend_id', currentUser.id).eq('status', 'pending');

  badge.style.display = (count || 0) > 0 ? 'block' : 'none';
}

async function renderFriends(force = false) {
  const inBox = document.getElementById('friends-incoming');
  const outBox = document.getElementById('friends-outgoing');
  const listBox = document.getElementById('friends-list');
  if (!inBox || !outBox || !listBox) return;

  if (!currentUser) {
    inBox.innerHTML = '<div class="empty">Войди</div>';
    outBox.innerHTML = '';
    listBox.innerHTML = '';
    return;
  }

  const { data: friendships } = await supabaseClient
    .from('friendships').select('*')
    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);

  if (!friendships || friendships.length === 0) {
    inBox.innerHTML = '<div class="empty">Входящих нет</div>';
    outBox.innerHTML = '<div class="empty">Исходящих нет</div>';
    listBox.innerHTML = '<div class="empty">Нет друзей</div>';
    return;
  }

  const incoming = friendships.filter(f => f.friend_id === currentUser.id && f.status === 'pending');
  const outgoing = friendships.filter(f => f.user_id === currentUser.id && f.status === 'pending');
  const friends = friendships.filter(f => f.status === 'accepted');

  const userIds = [...new Set([
    ...incoming.map(f => f.user_id),
    ...outgoing.map(f => f.friend_id),
    ...friends.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id)
  ])];

  const nickById = await getNicks(userIds);

  const { data: statuses } = userIds.length
    ? await supabaseClient.from('user_status').select('user_id, status').in('user_id', userIds)
    : { data: [] };

  const statusById = {};
  (statuses || []).forEach(s => { statusById[s.user_id] = s.status; });

  inBox.innerHTML = incoming.length
    ? incoming.map(f => friendRow(f.user_id, f.id, 'incoming', nickById, statusById)).join('')
    : '<div class="empty">Входящих нет</div>';

  outBox.innerHTML = outgoing.length
    ? outgoing.map(f => friendRow(f.friend_id, f.id, 'outgoing', nickById, statusById)).join('')
    : '<div class="empty">Исходящих нет</div>';

  listBox.innerHTML = friends.length
    ? friends.map(f => {
        const fid = f.user_id === currentUser.id ? f.friend_id : f.user_id;
        return friendRow(fid, f.id, 'friend', nickById, statusById);
      }).join('')
    : '<div class="empty">Нет друзей</div>';
}

function friendRow(userId, fid, type, nickById, statusById) {
  const nick = nickById[userId] || 'Unknown';
  const status = statusById[userId] || 'offline';

  let actions = '';
  if (type === 'incoming') {
    actions = `<button class="btn btn-primary btn-sm" onclick="acceptFriend('${fid}')">Принять</button>
               <button class="btn btn-sm" onclick="declineFriend('${fid}')">Отклонить</button>`;
  } else if (type === 'outgoing') {
    actions = `<button class="btn btn-sm" onclick="cancelFriendRequest('${fid}')">Отменить</button>`;
  } else {
    actions = `<button class="btn btn-primary btn-sm" onclick="openChat('${userId}')">Написать</button>`;
  }

  return `<div class="friend-row">
    <div class="friend-info">
      <span class="status-dot status-${status}"></span>
      <div><div class="name" onclick="openUserProfile('${userId}')">${escapeHtml(nick)}</div></div>
    </div>
    <div class="friend-actions">${actions}</div>
  </div>`;
}

async function openUserProfile(userId) {
  if (!currentUser) return;
  const [profRes, statusRes, friendRes] = await Promise.all([
    supabaseClient.from('profiles').select('*').eq('id', userId).single(),
    supabaseClient.from('user_status').select('status').eq('user_id', userId).maybeSingle(),
    supabaseClient.from('friendships').select('*')
      .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUser.id})`)
      .maybeSingle()
  ]);

  const p = profRes.data;
  if (!p) { toast('Не найден'); return; }

  const status = statusRes.data?.status || 'offline';
  const fs = friendRes.data;

  let actions = '';
  if (userId === currentUser.id) actions = `<button class="btn btn-block" disabled style="opacity:0.5;">Это твой профиль</button>`;
  else if (!fs) actions = `<button class="btn btn-primary btn-block" onclick="sendFriendRequest('${userId}')">Добавить в друзья</button>`;
  else if (fs.status === 'pending') {
    if (fs.user_id === currentUser.id) actions = `<button class="btn btn-block" onclick="cancelFriendRequest('${fs.id}')">Отменить</button>`;
    else actions = `<button class="btn btn-primary btn-block" style="margin-bottom:8px;" onclick="acceptFriend('${fs.id}')">Принять</button>
                    <button class="btn btn-block" onclick="declineFriend('${fs.id}')">Отклонить</button>`;
  } else if (fs.status === 'accepted') actions = `<button class="btn btn-primary btn-block" onclick="openChat('${userId}')">Написать</button>`;
  else actions = `<button class="btn btn-primary btn-block" onclick="sendFriendRequest('${userId}')">Добавить в друзья</button>`;

  openModal(`
    <h3>${escapeHtml(p.nick)}</h3>
    <p class="sub"><span class="status-dot status-${status}"></span> ${p.elo} ELO • ${p.role}</p>
    ${actions}
    <button class="btn btn-block" style="margin-top:8px;" onclick="closeModal()">Закрыть</button>
  `);
}

// ===== СТАТУСЫ =====
async function setStatus(status) {
  if (!currentUser) return;
  await supabaseClient.from('user_status').upsert({
    user_id: currentUser.id, status, last_seen: new Date().toISOString()
  });
  const dot = document.getElementById('pf-status-dot');
  if (dot) dot.className = 'status-dot status-' + status;
  window._statusCache[currentUser.id] = status;
  toast('Статус: ' + ({ online: 'Онлайн', away: 'Отошёл', offline: 'Оффлайн' }[status] || status));
}

async function loadAndShowStatus() {
  if (!currentUser) return;
  const { data } = await supabaseClient.from('user_status').select('status')
    .eq('user_id', currentUser.id).maybeSingle();
  const status = data?.status || 'online';
  window._statusCache[currentUser.id] = status;
  const dot = document.getElementById('pf-status-dot');
  const sel = document.getElementById('pf-status-select');
  if (dot) dot.className = 'status-dot status-' + status;
  if (sel) sel.value = status;
}

function startHeartbeat() {
  if (!currentUser) return;
  const beat = async () => {
    if (!currentUser) return;
    const { data } = await supabaseClient.from('user_status').select('status')
      .eq('user_id', currentUser.id).maybeSingle();
    await supabaseClient.from('user_status').upsert({
      user_id: currentUser.id,
      status: data?.status || 'online',
      last_seen: new Date().toISOString()
    });
  };
  beat();
  setInterval(beat, 120000);          // раз в 2 минуты
  setInterval(updateMessagesBadge, 30000); // раз в 30 секунд
}

// =========================================================
// ЧАСТЬ 4 — ЧАТ КОМАНДЫ (ОПТИМИСТИЧНЫЙ)
// =========================================================

let chatInterval = null;

async function loadTeamChat(teamId, options = {}) {
  const container = document.getElementById('team-chat-messages');
  if (!container) return;

  const { data: messages, error } = await supabaseClient
    .from('messages').select('*').eq('team_id', teamId)
    .order('created_at', { ascending: true }).limit(100);

  if (error) {
    container.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    return;
  }

  const senderIds = [...new Set((messages || []).map(m => m.sender_id))];
  const nickById = await getNicks(senderIds);

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty" style="margin:auto;">Сообщений нет. Напиши первое!</div>';
    return;
  }

  container.innerHTML = messages.map(m => renderChatMessage(m, nickById)).join('');
  container.scrollTop = container.scrollHeight;

  if (!options.skipInterval) {
    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(() => {
      if (document.getElementById('team-chat-messages')) {
        loadTeamChat(teamId, { skipInterval: true });
      } else {
        clearInterval(chatInterval);
        chatInterval = null;
      }
    }, 7000); // раз в 7 секунд
  }
}

function renderChatMessage(m, nickById) {
  const isOwn = currentUser && m.sender_id === currentUser.id;
  const nick = isOwn ? 'Ты' : (nickById[m.sender_id] || 'Unknown');
  const time = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `<div class="chat-msg ${isOwn ? 'own' : 'other'}" data-msg-id="${m.id || 'temp'}">
    <div class="author">${escapeHtml(nick)}</div>
    <div>${escapeHtml(m.text)}</div>
    <div class="time">${time}</div>
  </div>`;
}

async function sendTeamMessage(teamId) {
  if (!currentUser) return;
  const input = document.getElementById('team-chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  // Оптимистичный рендер
  const container = document.getElementById('team-chat-messages');
  const tempId = 'temp_' + Date.now();
  if (container) {
    const html = renderChatMessage({
      id: tempId, sender_id: currentUser.id, text, created_at: new Date().toISOString()
    }, { [currentUser.id]: currentUser.nick });
    const empty = container.querySelector('.empty');
    if (empty) empty.remove();
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }

  const { data, error } = await supabaseClient.from('messages')
    .insert({ sender_id: currentUser.id, team_id: teamId, text })
    .select().single();

  if (error) {
    toast('Ошибка: ' + error.message);
    document.querySelector(`[data-msg-id="${tempId}"]`)?.remove();
    return;
  }

  document.querySelector(`[data-msg-id="${tempId}"]`)?.setAttribute('data-msg-id', data.id);
}

// =========================================================
// ЧАСТЬ 5 — ЛИЧНЫЕ СООБЩЕНИЯ (ОПТИМИСТИЧНЫЕ)
// =========================================================

let dialogInterval = null;
let activeDialogUserId = null;

async function renderDialogs() {
  const container = document.getElementById('dialogs-list');
  if (!container) return;
  if (!currentUser) { container.innerHTML = '<div class="empty">Войди</div>'; return; }

  const [friendsRes, msgsRes, readsRes] = await Promise.all([
    supabaseClient.from('friendships').select('*')
      .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`).eq('status', 'accepted'),
    supabaseClient.from('messages').select('*').is('team_id', null)
      .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false }),
    supabaseClient.from('message_reads').select('message_id').eq('user_id', currentUser.id)
  ]);

  const friendships = friendsRes.data || [];
  if (!friendships.length) {
    container.innerHTML = '<div class="empty">Нет друзей</div>';
    return;
  }

  const friendIds = friendships.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id);
  const nickById = await getNicks(friendIds);
  const allMsgs = msgsRes.data || [];
  const readSet = new Set((readsRes.data || []).map(r => r.message_id));

  const lastMsg = {};
  allMsgs.forEach(m => {
    const o = m.sender_id === currentUser.id ? m.recipient_id : m.sender_id;
    if (!lastMsg[o]) lastMsg[o] = m;
  });

  const unread = {};
  allMsgs.forEach(m => {
    if (m.recipient_id === currentUser.id && !readSet.has(m.id)) {
      unread[m.sender_id] = (unread[m.sender_id] || 0) + 1;
    }
  });

  const sorted = [...friendIds].sort((a, b) =>
    (lastMsg[b]?.created_at || '').localeCompare(lastMsg[a]?.created_at || '')
  );

  container.innerHTML = sorted.map(uid => {
    const nick = nickById[uid] || 'Unknown';
    const last = lastMsg[uid];
    const u = unread[uid] || 0;
    const preview = last ? (last.sender_id === currentUser.id ? 'Ты: ' : '') + last.text.slice(0, 30) : 'Начни переписку';
    return `<div class="dialog-item ${activeDialogUserId === uid ? 'active' : ''} ${u > 0 ? 'unread' : ''}" onclick="openDialog('${uid}')">
      <div class="name">${escapeHtml(nick)}${u > 0 ? `<span class="unread-count">${u}</span>` : ''}</div>
      <div class="preview">${escapeHtml(preview)}</div>
    </div>`;
  }).join('');
}

async function openDialog(userId) {
  if (!currentUser) return;
  activeDialogUserId = userId;
  renderDialogs();

  const nick = await getNick(userId);
  const h = document.getElementById('dialog-header');
  if (h) h.textContent = nick;

  const w = document.getElementById('dialog-input-wrap');
  if (w) w.style.display = 'flex';

  await loadDialogMessages(userId);

  if (dialogInterval) clearInterval(dialogInterval);
  dialogInterval = setInterval(() => {
    if (activeDialogUserId === userId) loadDialogMessages(userId);
    else { clearInterval(dialogInterval); dialogInterval = null; }
  }, 7000);
}

async function loadDialogMessages(userId) {
  if (!currentUser) return;
  const container = document.getElementById('dialog-messages');
  if (!container) return;

  const { data: msgs } = await supabaseClient.from('messages').select('*').is('team_id', null)
    .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true }).limit(200);

  if (!msgs || !msgs.length) {
    container.innerHTML = '<div class="empty" style="margin:auto;">Начни переписку!</div>';
    return;
  }

  const unreadIds = msgs.filter(m => m.recipient_id === currentUser.id).map(m => m.id);
  if (unreadIds.length) {
    const { data: ex } = await supabaseClient.from('message_reads').select('message_id')
      .eq('user_id', currentUser.id).in('message_id', unreadIds);
    const exSet = new Set((ex || []).map(r => r.message_id));
    const toIns = unreadIds.filter(id => !exSet.has(id));
    if (toIns.length) {
      await supabaseClient.from('message_reads').insert(
        toIns.map(id => ({ user_id: currentUser.id, message_id: id }))
      );
    }
  }

  container.innerHTML = msgs.map(renderPersonalMessage).join('');
  container.scrollTop = container.scrollHeight;
}

function renderPersonalMessage(m) {
  const isOwn = m.sender_id === currentUser.id;
  const time = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `<div class="chat-msg ${isOwn ? 'own' : 'other'}" data-msg-id="${m.id || 'temp'}">
    <div>${escapeHtml(m.text)}</div>
    <div class="time">${time}</div>
  </div>`;
}

async function sendPersonalMessage() {
  if (!currentUser || !activeDialogUserId) return;
  const input = document.getElementById('dialog-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const container = document.getElementById('dialog-messages');
  const tempId = 'temp_' + Date.now();
  if (container) {
    const html = renderPersonalMessage({
      id: tempId, sender_id: currentUser.id, text, created_at: new Date().toISOString()
    });
    const empty = container.querySelector('.empty');
    if (empty) empty.remove();
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }

  const { data, error } = await supabaseClient.from('messages')
    .insert({ sender_id: currentUser.id, recipient_id: activeDialogUserId, text })
    .select().single();

  if (error) {
    toast('Ошибка: ' + error.message);
    document.querySelector(`[data-msg-id="${tempId}"]`)?.remove();
    return;
  }
  document.querySelector(`[data-msg-id="${tempId}"]`)?.setAttribute('data-msg-id', data.id);
}

async function updateMessagesBadge() {
  const badge = document.getElementById('messages-badge');
  if (!badge) return;
  if (!currentUser) { badge.style.display = 'none'; return; }

  const { data: msgs } = await supabaseClient.from('messages').select('id')
    .eq('recipient_id', currentUser.id).is('team_id', null);

  if (!msgs || !msgs.length) { badge.style.display = 'none'; return; }

  const { data: reads } = await supabaseClient.from('message_reads')
    .select('message_id').eq('user_id', currentUser.id);

  const readSet = new Set((reads || []).map(r => r.message_id));
  const unread = msgs.filter(m => !readSet.has(m.id)).length;

  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'block';
  } else badge.style.display = 'none';
}

function openChat(userId) {
  closeModal();
  go('messages');
  setTimeout(() => openDialog(userId), 200);
}

// =========================================================
// ЧАСТЬ 6 — АВТОРИЗАЦИЯ, ПРОФИЛЬ, ЗАПУСК
// =========================================================

function switchAuth(mode) {
  const lt = document.getElementById('tab-login');
  const rt = document.getElementById('tab-register');
  const lb = document.getElementById('auth-login');
  const rb = document.getElementById('auth-register');
  if (mode === 'login') {
    lt.classList.add('active'); rt.classList.remove('active');
    lb.style.display = 'block'; rb.style.display = 'none';
  } else {
    rt.classList.add('active'); lt.classList.remove('active');
    lb.style.display = 'none'; rb.style.display = 'block';
  }
}

async function doRegister() {
  const nick = document.getElementById('reg-nick').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const elo = parseInt(document.getElementById('reg-elo').value, 10) || 0;
  const role = document.getElementById('reg-role').value;

  if (!nick || nick.length < 3) { toast('Ник минимум 3 символа'); return; }
  if (!email || !email.includes('@')) { toast('Некорректный Email'); return; }
  if (!pass || pass.length < 6) { toast('Пароль минимум 6 символов'); return; }

  toast('Регистрируем...');
  const { data, error } = await supabaseClient.auth.signUp({
    email, password: pass,
    options: { data: { nick, elo, role }, emailRedirectTo: window.location.origin }
  });

  if (error) { toast('Ошибка: ' + error.message); return; }

  if (data.session) {
    toast('Добро пожаловать, ' + nick + '!');
    setTimeout(() => { updateAuthUI(); go('profile'); }, 500);
  } else {
    toast('Проверь почту ' + email);
    setTimeout(() => switchAuth('login'), 1500);
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) { toast('Заполни поля'); return; }

  toast('Входим...');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (error) { toast('Ошибка: ' + error.message); return; }

  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) { toast('Профиль не найден'); return; }

  currentUser = { id: profile.id, nick: profile.nick, email: data.user.email, elo: profile.elo, role: profile.role };
  window._nickCache[profile.id] = profile.nick;

  toast('С возвращением, ' + currentUser.nick + '!');
  updateAuthUI();
  go('profile');
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  window._nickCache = {};
  window._teamCache = {};
  window._friendsCache = null;
  window._statusCache = {};
  toast('Вышел');
  updateAuthUI();
  go('home');
}

async function discordAuth() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin }
  });
  if (error) toast('Ошибка: ' + error.message);
}

function updateAuthUI() {
  const btn = document.getElementById('nav-auth-btn');
  if (btn) btn.textContent = currentUser ? 'Выйти' : 'Войти';
}

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { currentUser = null; return; }

  const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', data.session.user.id).single();
  if (p) {
    currentUser = { id: p.id, nick: p.nick, email: data.session.user.email, elo: p.elo, role: p.role };
    window._nickCache[p.id] = p.nick;
  }

  if (currentUser) {
    setTimeout(startHeartbeat, 500);
    setTimeout(updateFriendsBadge, 800);
    setTimeout(updateMessagesBadge, 1000);
  }
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', event);
    if (event === 'SIGNED_IN' && session) {
      const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
      if (p) {
        currentUser = { id: p.id, nick: p.nick, email: session.user.email, elo: p.elo, role: p.role };
        window._nickCache[p.id] = p.nick;
        updateAuthUI();
        toast('Добро пожаловать, ' + p.nick + '!');
        go('profile');
      }
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      updateAuthUI();
    }
  });
}

async function renderProfile() {
  const nickEl = document.getElementById('pf-nick');
  const emailEl = document.getElementById('pf-email');
  const avatarEl = document.getElementById('pf-avatar');
  const eloEl = document.getElementById('pf-elo');
  const roleEl = document.getElementById('pf-role');
  const teamEl = document.getElementById('pf-team');
  const statusEl = document.getElementById('pf-status');
  const grid = document.getElementById('profile-grid');
  if (!nickEl) return;

  if (!currentUser) {
    nickEl.textContent = 'Гость';
    emailEl.textContent = 'Войди';
    avatarEl.textContent = '?';
    eloEl.textContent = '—'; roleEl.textContent = '—';
    teamEl.textContent = 'Нет'; statusEl.textContent = '—';
    grid.innerHTML = '<div class="empty">Войди</div>';
    return;
  }

  nickEl.textContent = currentUser.nick;
  emailEl.textContent = currentUser.email;
  avatarEl.textContent = currentUser.nick[0].toUpperCase();
  eloEl.textContent = currentUser.elo;
  roleEl.textContent = currentUser.role;
  loadAndShowStatus();

  const { data: myTeams } = await supabaseClient.from('team_members')
    .select('team_id, teams (id, name, description, max_elo, requirements, roles, slots, owner_id)')
    .eq('user_id', currentUser.id);

  if (!myTeams || !myTeams.length) {
    teamEl.textContent = 'Нет';
    statusEl.textContent = 'Свободен';
    grid.innerHTML = '<div class="empty">Нет команд</div>';
    return;
  }

  teamEl.textContent = myTeams[0].teams.name;
  statusEl.textContent = 'В команде';
  grid.innerHTML = myTeams.map(row => {
    const t = row.teams;
    return `<div class="card" onclick="showTeam('${t.id}')">
      <div class="card-head"><div class="card-title">${escapeHtml(t.name)}</div><div class="elo-badge">${t.max_elo}</div></div>
      <div class="card-desc">${escapeHtml(t.description || 'Без описания')}</div>
      <div class="roles">${(t.roles || []).map(r => `<span class="role-tag">${r}</span>`).join('')}</div>
      <div class="card-foot"><div>${t.slots} слотов</div></div>
    </div>`;
  }).join('');
}

function initFormHandlers() {
  const ra = document.getElementById('t-req');
  const rc = document.getElementById('req-counter');
  if (ra && rc) {
    ra.addEventListener('input', () => { rc.textContent = ra.value.length + ' / 250'; });
  }
  const ei = document.getElementById('t-elo');
  const ev = document.getElementById('elo-val');
  if (ei && ev) {
    ei.addEventListener('input', () => {
      let v = parseInt(ei.value, 10) || 0;
      if (v > 5000) { v = 5000; ei.value = 5000; }
      if (v < 0) { v = 0; ei.value = 0; }
      ev.textContent = v;
    });
  }
  ['search', 'filter-role', 'filter-elo'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderTeams);
  });
  const btn = document.getElementById('nav-auth-btn');
  if (btn) btn.onclick = () => { currentUser ? doLogout() : go('auth'); };
}

// ===== ЗАПУСК =====
// ===== РЕДАКТИРОВАНИЕ ПРОФИЛЯ =====
async function editProfile() {
  if (!currentUser) { toast('Войди в аккаунт'); return; }

  openModal(`
    <h3>Редактировать профиль</h3>
    <p class="sub">Измени свой ник, ЭЛО или роль</p>

    <div class="field">
      <label>Никнейм</label>
      <input type="text" id="edit-nick" value="${escapeHtml(currentUser.nick)}" maxlength="20">
    </div>

    <div class="field">
      <label>ЭЛО</label>
      <input type="number" id="edit-elo" min="0" max="5000" value="${currentUser.elo}">
    </div>

    <div class="field">
      <label>Роль</label>
      <select id="edit-role">
        <option value="Rifler" ${currentUser.role === 'Rifler' ? 'selected' : ''}>Rifler</option>
        <option value="IGL" ${currentUser.role === 'IGL' ? 'selected' : ''}>IGL</option>
        <option value="AWPer" ${currentUser.role === 'AWPer' ? 'selected' : ''}>AWPer</option>
        <option value="Entry" ${currentUser.role === 'Entry' ? 'selected' : ''}>Entry</option>
        <option value="Support" ${currentUser.role === 'Support' ? 'selected' : ''}>Support</option>
        <option value="Lurker" ${currentUser.role === 'Lurker' ? 'selected' : ''}>Lurker</option>
      </select>
    </div>

    <button class="btn btn-primary btn-block" onclick="saveProfile()">Сохранить</button>
    <button class="btn btn-block" style="margin-top:8px;" onclick="closeModal()">Отмена</button>
  `);
}

async function saveProfile() {
  const nick = document.getElementById('edit-nick').value.trim();
  const elo = parseInt(document.getElementById('edit-elo').value, 10) || 0;
  const role = document.getElementById('edit-role').value;

  if (!nick || nick.length < 3) { toast('Ник минимум 3 символа'); return; }
  if (elo < 0 || elo > 5000) { toast('ЭЛО от 0 до 5000'); return; }

  const { error } = await supabaseClient
    .from('profiles')
    .update({ nick, elo, role })
    .eq('id', currentUser.id);

  if (error) { toast('Ошибка: ' + error.message); return; }

  currentUser.nick = nick;
  currentUser.elo = elo;
  currentUser.role = role;
  window._nickCache[currentUser.id] = nick;

  toast('Профиль обновлён!');
  closeModal();
  renderProfile();
}


document.addEventListener('DOMContentLoaded', async () => {
  initFormHandlers();
  await checkSession();
  updateAuthUI();
  await renderTeams();
  await renderInvites();
  await renderFriends();
  await renderProfile();
  go('home');
});
