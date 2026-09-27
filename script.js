/* =========================================================
   TEAM SEARCH CS2 — полный script.js
   ========================================================= */

// ===== SUPABASE =====
const SUPABASE_URL = 'https://tuhvornfjgbhdygbpoou.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1aHZvcm5mamdiaGR5Z2Jwb291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzY1NzAsImV4cCI6MjEwNjA1MjU3MH0.CIuKaG3fEFTV3_VHH7JwLVbJ5HTbhxOdbReSj7LiiAA';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('Supabase подключён:', SUPABASE_URL);

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentUser = null;
let currentLang = 'ru';

// ===== КЭШ НИКОВ =====
window._nickCache = {};

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-bg').classList.remove('show');
}

// ===== ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ =====
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

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
  if (authBtn) {
    authBtn.textContent = currentUser ? 'Выйти' : 'Войти';
  }
  document.getElementById('lang-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');
}
// ===== ОТРИСОВКА КОМАНД =====
async function renderTeams() {
  const homeGrid = document.getElementById('home-grid');
  const teamsGrid = document.getElementById('teams-grid');
  if (!homeGrid || !teamsGrid) return;

  const { data: dbTeams, error } = await supabaseClient
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    homeGrid.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    teamsGrid.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    return;
  }

  const { data: membersData } = await supabaseClient
    .from('team_members')
    .select('team_id, user_id');

  const { data: profilesData } = await supabaseClient
    .from('profiles')
    .select('id, nick');

  const membersByTeam = {};
  (membersData || []).forEach(m => {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
    membersByTeam[m.team_id].push(m.user_id);
  });

  const nickById = {};
  (profilesData || []).forEach(p => { nickById[p.id] = p.nick; });

  const allTeams = (dbTeams || []).map(t => ({
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

  const search = (document.getElementById('search')?.value || '').toLowerCase();
  const filterRole = document.getElementById('filter-role')?.value || '';
  const filterElo = parseInt(document.getElementById('filter-elo')?.value || '0', 10);

  let filtered = allTeams.filter(t => {
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

// ===== КАРТОЧКА КОМАНДЫ =====
function teamCard(t) {
  const filled = t.members.length;
  const total = t.slots;
  const dots = Array.from({ length: total }, (_, i) =>
    `<div class="slot-dot ${i < filled ? 'filled' : ''}"></div>`
  ).join('');

  const rolesHtml = t.roles.map(r => `<span class="role-tag">${r}</span>`).join('');

  return `
    <div class="card" onclick="showTeam('${t.id}')">
      <div class="card-head">
        <div class="card-title">${escapeHtml(t.name)}</div>
        <div class="elo-badge">${t.maxElo}</div>
      </div>
      <div class="card-desc">${escapeHtml(t.desc || 'Без описания')}</div>
      <div class="roles">${rolesHtml || '<span class="role-tag">—</span>'}</div>
      <div class="card-foot">
        <div class="slots">${dots}<span style="margin-left:6px;">${filled}/${total}</span></div>
        <div>${escapeHtml(t.ownerName)}</div>
      </div>
    </div>
  `;
}

// ===== МОДАЛКА КОМАНДЫ =====
async function showTeam(id) {
  const { data: t, error } = await supabaseClient
    .from('teams')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !t) { toast('Команда не найдена'); return; }

  const { data: membersData } = await supabaseClient
    .from('team_members')
    .select('user_id')
    .eq('team_id', id);

  const memberIds = (membersData || []).map(m => m.user_id);

  const allIds = [...new Set([...memberIds, t.owner_id])];
  const nickById = await getNicks(allIds);

  const memberNames = memberIds.map(uid => nickById[uid] || 'Unknown');
  const ownerName = nickById[t.owner_id] || 'Unknown';

  const isOwner = currentUser && t.owner_id === currentUser.id;
  const isMember = currentUser && memberIds.includes(currentUser.id);

  // Сохраняем ID команды для чата
  window._currentTeamId = t.id;

  let alreadyInvited = false;
  if (currentUser && !isOwner && !isMember) {
    const { data: existing } = await supabaseClient
      .from('invites')
      .select('id')
      .eq('team_id', id)
      .eq('from_user_id', currentUser.id)
      .eq('status', 'pending')
      .maybeSingle();
    alreadyInvited = !!existing;
  }

  const rolesHtml = (t.roles || []).map(r => `<span class="role-tag">${r}</span>`).join('');

  // Кнопка действия
  let actionBtn = '';
  if (!currentUser) {
    actionBtn = `<button class="btn btn-primary btn-block" onclick="closeModal(); go('auth')">Войти, чтобы подать заявку</button>`;
  } else if (isOwner) {
    const { data: activeDiss } = await supabaseClient
      .from('team_dissolutions')
      .select('id')
      .eq('team_id', t.id)
      .eq('status', 'active')
      .maybeSingle();

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

  const dissolutionHtml = await getDissolutionBlock(t.id, memberIds);

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
                `<div style="margin-bottom:6px;">• <span class="member-link" onclick="openUserProfile('${uid}')">${escapeHtml(memberNames[i])}</span></div>`
              ).join('')
            : 'Пока никого'}
        </div>
      </div>

      ${actionBtn}
    </div>

    ${isMember ? `
      <div id="team-tab-chat" class="team-tab-content" style="display:none;">
        <div id="team-chat-messages" class="team-chat-messages">
          <div class="empty">Загрузка сообщений...</div>
        </div>
        <div class="team-chat-input">
          <input type="text" id="team-chat-input" placeholder="Написать сообщение..." maxlength="2000" onkeydown="if(event.key==='Enter') sendTeamMessage('${t.id}')">
          <button class="btn btn-primary btn-sm" onclick="sendTeamMessage('${t.id}')">Отправить</button>
        </div>
      </div>
    ` : ''}

    <button class="btn btn-block" style="margin-top:8px;" onclick="closeModal()">Закрыть</button>
  `);
}

// ===== ВКЛАДКИ =====
function switchTeamTab(tab) {
  document.querySelectorAll('.team-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.team-tab-content').forEach(c => c.style.display = 'none');

  const btn = document.querySelector(`.team-tab[onclick*="'${tab}'"]`);
  if (btn) btn.classList.add('active');

  const content = document.getElementById('team-tab-' + tab);
  if (content) content.style.display = 'block';

  if (tab === 'chat') {
    const teamId = window._currentTeamId;
    if (teamId) loadTeamChat(teamId);
  }
}

// ===== СОЗДАНИЕ КОМАНДЫ =====
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

  const { data: newTeam, error: teamError } = await supabaseClient
    .from('teams')
    .insert({
      name, description: desc, max_elo: maxElo,
      requirements: req, roles: roles, slots: 5,
      owner_id: currentUser.id
    })
    .select()
    .single();

  if (teamError) { toast('Ошибка: ' + teamError.message); console.error(teamError); return; }

  await supabaseClient.from('team_members').insert({
    team_id: newTeam.id,
    user_id: currentUser.id
  });

  toast('Команда создана!');

  document.getElementById('t-name').value = '';
  document.getElementById('t-desc').value = '';
  document.getElementById('t-elo').value = 2500;
  document.getElementById('t-req').value = '';
  document.querySelectorAll('.role-check input:checked').forEach(c => c.checked = false);

  go('teams');
}
// ===== ОТПРАВКА ЗАЯВКИ =====
async function sendInvite(teamId) {
  if (!currentUser) { go('auth'); return; }

  const { data: team } = await supabaseClient
    .from('teams')
    .select('id, owner_id, slots')
    .eq('id', teamId)
    .single();

  if (!team) { toast('Команда не найдена'); return; }
  if (team.owner_id === currentUser.id) { toast('Это ваша команда'); return; }

  const { data: alreadyMember } = await supabaseClient
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (alreadyMember) { toast('Ты уже в команде'); return; }

  const { data: existingInvite } = await supabaseClient
    .from('invites')
    .select('id')
    .eq('team_id', teamId)
    .eq('from_user_id', currentUser.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingInvite) { toast('Заявка уже отправлена'); return; }

  const { error } = await supabaseClient
    .from('invites')
    .insert({
      team_id: teamId,
      from_user_id: currentUser.id,
      to_user_id: team.owner_id,
      status: 'pending'
    });

  if (error) { toast('Ошибка: ' + error.message); console.error(error); return; }

  closeModal();
  toast('Заявка отправлена!');
  renderTeams();
  renderInvites();
}

// ===== ПРИГЛАШЕНИЯ =====
async function renderInvites() {
  const inBox = document.getElementById('invites-in');
  const outBox = document.getElementById('invites-out');
  if (!inBox || !outBox) return;

  if (!currentUser) {
    inBox.innerHTML = '<div class="empty">Войди, чтобы видеть приглашения</div>';
    outBox.innerHTML = '';
    return;
  }

  const { data: incoming } = await supabaseClient
    .from('invites').select('*')
    .eq('to_user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const { data: outgoing } = await supabaseClient
    .from('invites').select('*')
    .eq('from_user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const allInvites = [...(incoming || []), ...(outgoing || [])];
  const teamIds = [...new Set(allInvites.map(i => i.team_id))];
  const userIds = [...new Set([
    ...allInvites.map(i => i.from_user_id),
    ...allInvites.map(i => i.to_user_id)
  ])];

  const { data: teamsData } = teamIds.length
    ? await supabaseClient.from('teams').select('id, name').in('id', teamIds)
    : { data: [] };

  const teamNameById = {};
  (teamsData || []).forEach(t => { teamNameById[t.id] = t.name; });

  const nickById = await getNicks(userIds);

  inBox.innerHTML = (incoming && incoming.length)
    ? incoming.map(i => inviteRowIn(i, teamNameById, nickById)).join('')
    : '<div class="empty">Входящих приглашений нет</div>';

  outBox.innerHTML = (outgoing && outgoing.length)
    ? outgoing.map(i => inviteRowOut(i, teamNameById, nickById)).join('')
    : '<div class="empty">Исходящих заявок нет</div>';
}

function inviteRowIn(i, teamNameById, nickById) {
  const teamName = teamNameById[i.team_id] || 'Unknown Team';
  const fromNick = nickById[i.from_user_id] || 'Unknown';

  let actions = '';
  if (i.status === 'pending') {
    actions = `
      <button class="btn btn-primary btn-sm" onclick="acceptInvite('${i.id}')">Принять</button>
      <button class="btn btn-sm" onclick="declineInvite('${i.id}')">Отклонить</button>
    `;
  } else if (i.status === 'accepted') {
    actions = '<span style="color:var(--text-dim);font-size:13px;">✓ Принято</span>';
  } else {
    actions = '<span style="color:var(--text-dim);font-size:13px;">✕ Отклонено</span>';
  }

  return `
    <div class="invite-row">
      <div class="invite-info">
        <div class="name">${escapeHtml(fromNick)}</div>
        <div class="meta">Хочет вступить в <b>${escapeHtml(teamName)}</b></div>
      </div>
      <div class="invite-actions">${actions}</div>
    </div>
  `;
}

function inviteRowOut(i, teamNameById, nickById) {
  const teamName = teamNameById[i.team_id] || 'Unknown Team';
  const toNick = nickById[i.to_user_id] || 'Unknown';
  const statusText = { pending: '⏳ Ожидает', accepted: '✓ Принято', declined: '✕ Отклонено' }[i.status] || '';

  return `
    <div class="invite-row">
      <div class="invite-info">
        <div class="name">${escapeHtml(teamName)}</div>
        <div class="meta">Владелец: ${escapeHtml(toNick)}</div>
      </div>
      <div class="invite-actions">
        <span style="color:var(--text-dim);font-size:13px;">${statusText}</span>
      </div>
    </div>
  `;
}

async function acceptInvite(inviteId) {
  const { data: invite } = await supabaseClient
    .from('invites').select('*').eq('id', inviteId).single();
  if (!invite) { toast('Заявка не найдена'); return; }

  const { data: team } = await supabaseClient
    .from('teams').select('id, slots').eq('id', invite.team_id).single();
  if (!team) { toast('Команда не найдена'); return; }

  const { count } = await supabaseClient
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id);

  if ((count || 0) >= team.slots) { toast('В команде нет свободных мест'); return; }

  const { error } = await supabaseClient
    .from('team_members')
    .insert({ team_id: invite.team_id, user_id: invite.from_user_id });

  if (error) { toast('Ошибка: ' + error.message); return; }

  await supabaseClient.from('invites').update({ status: 'accepted' }).eq('id', inviteId);

  toast('Игрок принят в команду!');
  renderInvites();
  renderTeams();
}

async function declineInvite(inviteId) {
  await supabaseClient.from('invites').update({ status: 'declined' }).eq('id', inviteId);
  toast('Заявка отклонена');
  renderInvites();
}

// ===== РОСПУСК КОМАНДЫ =====
async function startDissolution(teamId) {
  if (!currentUser) { toast('Войди в аккаунт'); return; }
  if (!confirm('Запустить голосование за роспуск команды? Нужно большинство голосов "За".')) return;

  toast('Запускаем голосование...');

  const { error } = await supabaseClient.rpc('start_dissolution', { p_team_id: teamId });

  if (error) { toast('Ошибка: ' + error.message); console.error(error); return; }

  toast('Голосование запущено!');
  closeModal();
  renderTeams();
  setTimeout(() => showTeam(teamId), 300);
}

async function voteDissolution(dissolutionId, vote) {
  if (!currentUser) { toast('Войди в аккаунт'); return; }

  const { error } = await supabaseClient
    .from('dissolution_votes')
    .insert({ dissolution_id: dissolutionId, user_id: currentUser.id, vote });

  if (error) {
    if (error.message.includes('duplicate')) toast('Ты уже голосовал');
    else toast('Ошибка: ' + error.message);
    return;
  }

  toast(vote === 'yes' ? 'Голос "За" принят' : 'Голос "Против" принят');
  closeModal();
  renderTeams();
}

async function getDissolutionBlock(teamId, memberIds) {
  if (!currentUser) return '';

  const { data: dissolution } = await supabaseClient
    .from('team_dissolutions').select('*')
    .eq('team_id', teamId).eq('status', 'active').maybeSingle();

  if (!dissolution) return '';

  const { data: votes } = await supabaseClient
    .from('dissolution_votes').select('*').eq('dissolution_id', dissolution.id);

  const yesVotes = (votes || []).filter(v => v.vote === 'yes').length;
  const noVotes = (votes || []).filter(v => v.vote === 'no').length;
  const totalMembers = memberIds.length;
  const needed = Math.floor(totalMembers / 2) + 1;

  const myVote = (votes || []).find(v => v.user_id === currentUser.id);
  const isMember = memberIds.includes(currentUser.id);

  let voteButtons = '';
  if (isMember && !myVote) {
    voteButtons = `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" onclick="voteDissolution('${dissolution.id}', 'yes')">За</button>
        <button class="btn" style="flex:1;" onclick="voteDissolution('${dissolution.id}', 'no')">Против</button>
      </div>
    `;
  } else if (myVote) {
    voteButtons = `<div style="color:var(--text-dim);font-size:13px;margin-top:10px;">Ты проголосовал: <b>${myVote.vote === 'yes' ? 'За' : 'Против'}</b></div>`;
  }

  return `
    <div style="background:#1a0f0f;border:1px solid #553333;border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;color:#ff9999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:700;">🗳 Голосование за роспуск</div>
      <div style="font-size:14px;margin-bottom:4px;">За: <b>${yesVotes}</b> из <b>${needed}</b> нужно</div>
      <div style="font-size:13px;color:var(--text-dim);">Против: ${noVotes} • Всего участников: ${totalMembers}</div>
      ${voteButtons}
    </div>
  `;
}

// ===== ДРУЗЬЯ =====
async function sendFriendRequest(friendId) {
  if (!currentUser) { toast('Войди в аккаунт'); return; }
  if (friendId === currentUser.id) { toast('Это ты сам'); return; }

  const { data: existing } = await supabaseClient
    .from('friendships').select('id, status')
    .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') toast('Вы уже друзья');
    else if (existing.status === 'pending') toast('Запрос уже отправлен');
    return;
  }

  const { error } = await supabaseClient
    .from('friendships')
    .insert({ user_id: currentUser.id, friend_id: friendId, status: 'pending' });

  if (error) { toast('Ошибка: ' + error.message); return; }

  toast('Запрос в друзья отправлен!');
  closeModal();
  renderFriends();
  updateFriendsBadge();
}

async function acceptFriend(friendshipId) {
  const { error } = await supabaseClient
    .from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);

  if (error) { toast('Ошибка: ' + error.message); return; }

  toast('Теперь вы друзья!');
  renderFriends();
  updateFriendsBadge();
}

async function declineFriend(friendshipId) {
  await supabaseClient.from('friendships').update({ status: 'declined' }).eq('id', friendshipId);
  toast('Запрос отклонён');
  renderFriends();
  updateFriendsBadge();
}

async function cancelFriendRequest(friendshipId) {
  if (!confirm('Отменить запрос в друзья?')) return;
  await supabaseClient.from('friendships').delete().eq('id', friendshipId);
  toast('Запрос отменён');
  renderFriends();
  updateFriendsBadge();
}

async function updateFriendsBadge() {
  const badge = document.getElementById('friends-badge');
  if (!badge) return;

  if (!currentUser) { badge.style.display = 'none'; return; }

  const { count } = await supabaseClient
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('friend_id', currentUser.id)
    .eq('status', 'pending');

  badge.style.display = (count || 0) > 0 ? 'block' : 'none';
}

async function renderFriends() {
  const inBox = document.getElementById('friends-incoming');
  const outBox = document.getElementById('friends-outgoing');
  const listBox = document.getElementById('friends-list');
  if (!inBox || !outBox || !listBox) return;

  if (!currentUser) {
    inBox.innerHTML = '<div class="empty">Войди, чтобы видеть друзей</div>';
    outBox.innerHTML = '';
    listBox.innerHTML = '';
    return;
  }

  const { data: friendships } = await supabaseClient
    .from('friendships').select('*')
    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);

  if (!friendships || friendships.length === 0) {
    inBox.innerHTML = '<div class="empty">Входящих запросов нет</div>';
    outBox.innerHTML = '<div class="empty">Исходящих запросов нет</div>';
    listBox.innerHTML = '<div class="empty">У тебя пока нет друзей</div>';
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
    : '<div class="empty">Входящих запросов нет</div>';

  outBox.innerHTML = outgoing.length
    ? outgoing.map(f => friendRow(f.friend_id, f.id, 'outgoing', nickById, statusById)).join('')
    : '<div class="empty">Исходящих запросов нет</div>';

  listBox.innerHTML = friends.length
    ? friends.map(f => {
        const friendId = f.user_id === currentUser.id ? f.friend_id : f.user_id;
        return friendRow(friendId, f.id, 'friend', nickById, statusById);
      }).join('')
    : '<div class="empty">У тебя пока нет друзей</div>';
}

function friendRow(userId, friendshipId, type, nickById, statusById) {
  const nick = nickById[userId] || 'Unknown';
  const status = statusById[userId] || 'offline';

  let actions = '';
  if (type === 'incoming') {
    actions = `
      <button class="btn btn-primary btn-sm" onclick="acceptFriend('${friendshipId}')">Принять</button>
      <button class="btn btn-sm" onclick="declineFriend('${friendshipId}')">Отклонить</button>
    `;
  } else if (type === 'outgoing') {
    actions = `<button class="btn btn-sm" onclick="cancelFriendRequest('${friendshipId}')">Отменить</button>`;
  } else {
    actions = `<button class="btn btn-primary btn-sm" onclick="openChat('${userId}')">Написать</button>`;
  }

  return `
    <div class="friend-row">
      <div class="friend-info">
        <span class="status-dot status-${status}"></span>
        <div>
          <div class="name" onclick="openUserProfile('${userId}')">${escapeHtml(nick)}</div>
        </div>
      </div>
      <div class="friend-actions">${actions}</div>
    </div>
  `;
}

// ===== МИНИ-ПРОФИЛЬ =====
async function openUserProfile(userId) {
  if (!currentUser) { toast('Войди в аккаунт'); return; }

  const { data: profile } = await supabaseClient
    .from('profiles').select('*').eq('id', userId).single();

  if (!profile) { toast('Игрок не найден'); return; }

  const { data: statusData } = await supabaseClient
    .from('user_status').select('status').eq('user_id', userId).maybeSingle();

  const status = statusData?.status || 'offline';

  const { data: friendship } = await supabaseClient
    .from('friendships').select('*')
    .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUser.id})`)
    .maybeSingle();

  let actionsHtml = '';
  if (userId === currentUser.id) {
    actionsHtml = `<button class="btn btn-block" disabled style="opacity:0.5;">Это твой профиль</button>`;
  } else if (!friendship) {
    actionsHtml = `<button class="btn btn-primary btn-block" onclick="sendFriendRequest('${userId}')">Добавить в друзья</button>`;
  } else if (friendship.status === 'pending') {
    if (friendship.user_id === currentUser.id) {
      actionsHtml = `<button class="btn btn-block" onclick="cancelFriendRequest('${friendship.id}')">Отменить запрос</button>`;
    } else {
      actionsHtml = `
        <button class="btn btn-primary btn-block" style="margin-bottom:8px;" onclick="acceptFriend('${friendship.id}')">Принять запрос</button>
        <button class="btn btn-block" onclick="declineFriend('${friendship.id}')">Отклонить</button>
      `;
    }
  } else if (friendship.status === 'accepted') {
    actionsHtml = `<button class="btn btn-primary btn-block" onclick="openChat('${userId}')">Написать сообщение</button>`;
  } else {
    actionsHtml = `<button class="btn btn-primary btn-block" onclick="sendFriendRequest('${userId}')">Добавить в друзья</button>`;
  }

  openModal(`
    <h3>${escapeHtml(profile.nick)}</h3>
    <p class="sub"><span class="status-dot status-${status}"></span> ${profile.elo} ELO • ${profile.role}</p>

    <div style="margin-bottom:20px;">
      <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">ЭЛО</div>
      <div style="font-size:22px;font-weight:800;">${profile.elo}</div>
    </div>

    ${actionsHtml}
    <button class="btn btn-block" style="margin-top:8px;" onclick="closeModal()">Закрыть</button>
  `);
}

// ===== СТАТУСЫ =====
async function setStatus(status) {
  if (!currentUser) return;

  await supabaseClient.from('user_status').upsert({
    user_id: currentUser.id,
    status: status,
    last_seen: new Date().toISOString()
  });

  const dot = document.getElementById('pf-status-dot');
  if (dot) dot.className = 'status-dot status-' + status;

  const labels = { online: 'Онлайн', away: 'Отошёл', offline: 'Оффлайн' };
  toast('Статус: ' + labels[status]);
}

async function loadAndShowStatus() {
  if (!currentUser) return;

  const { data } = await supabaseClient
    .from('user_status').select('status').eq('user_id', currentUser.id).maybeSingle();

  const status = data?.status || 'online';
  const dot = document.getElementById('pf-status-dot');
  const sel = document.getElementById('pf-status-select');

  if (dot) dot.className = 'status-dot status-' + status;
  if (sel) sel.value = status;
}

function startHeartbeat() {
  if (!currentUser) return;

  const beat = async () => {
    if (!currentUser) return;
    const { data } = await supabaseClient
      .from('user_status').select('status').eq('user_id', currentUser.id).maybeSingle();

    await supabaseClient.from('user_status').upsert({
      user_id: currentUser.id,
      status: data?.status || 'online',
      last_seen: new Date().toISOString()
    });
  };

  beat();
  setInterval(beat, 60000);
  setInterval(updateMessagesBadge, 15000);
}
// ===== ЧАТ КОМАНДЫ =====
let chatInterval = null;

async function loadTeamChat(teamId, options = {}) {
  const container = document.getElementById('team-chat-messages');
  if (!container) return;

  const { data: messages, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Ошибка загрузки чата:', error);
    container.innerHTML = '<div class="empty">Ошибка загрузки сообщений</div>';
    return;
  }

  const senderIds = [...new Set((messages || []).map(m => m.sender_id))];
  const nickById = await getNicks(senderIds);

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty" style="margin:auto;">Сообщений пока нет. Напиши первое!</div>';
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
    }, 5000);
  }
}

function renderChatMessage(m, nickById) {
  const isOwn = currentUser && m.sender_id === currentUser.id;
  const nick = isOwn ? 'Ты' : (nickById[m.sender_id] || 'Unknown');
  const time = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="chat-msg ${isOwn ? 'own' : 'other'}" data-msg-id="${m.id || 'temp'}">
      <div class="author">${escapeHtml(nick)}</div>
      <div>${escapeHtml(m.text)}</div>
      <div class="time">${time}</div>
    </div>
  `;
}

async function sendTeamMessage(teamId) {
  if (!currentUser) { toast('Войди в аккаунт'); return; }

  const input = document.getElementById('team-chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  const container = document.getElementById('team-chat-messages');
  const tempId = 'temp_' + Date.now();
  const tempMsg = {
    id: tempId,
    sender_id: currentUser.id,
    team_id: teamId,
    text: text,
    created_at: new Date().toISOString()
  };

  if (container) {
    const nickById = { [currentUser.id]: currentUser.nick };
    const html = renderChatMessage(tempMsg, nickById);
    const empty = container.querySelector('.empty');
    if (empty) empty.remove();
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }

  const { data, error } = await supabaseClient
    .from('messages')
    .insert({
      sender_id: currentUser.id,
      team_id: teamId,
      text: text
    })
    .select()
    .single();

  if (error) {
    toast('Ошибка: ' + error.message);
    console.error(error);
    const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
    if (tempEl) tempEl.remove();
    return;
  }

  const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
  if (tempEl && data) tempEl.setAttribute('data-msg-id', data.id);
}
// ===== ЛИЧНЫЕ СООБЩЕНИЯ =====
let dialogInterval = null;
let activeDialogUserId = null;

async function renderDialogs() {
  const container = document.getElementById('dialogs-list');
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = '<div class="empty">Войди в аккаунт</div>';
    return;
  }

  const { data: friendships } = await supabaseClient
    .from('friendships')
    .select('*')
    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
    .eq('status', 'accepted');

  if (!friendships || friendships.length === 0) {
    container.innerHTML = '<div class="empty">Нет друзей. Добавь друзей чтобы общаться.</div>';
    return;
  }

  const friendIds = friendships.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id);
  const nickById = await getNicks(friendIds);

  const { data: allMsgs } = await supabaseClient
    .from('messages')
    .select('*')
    .is('team_id', null)
    .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  const lastMsgByUser = {};
  (allMsgs || []).forEach(m => {
    const otherId = m.sender_id === currentUser.id ? m.recipient_id : m.sender_id;
    if (!lastMsgByUser[otherId]) lastMsgByUser[otherId] = m;
  });

  const { data: reads } = await supabaseClient
    .from('message_reads').select('message_id').eq('user_id', currentUser.id);

  const readIds = new Set((reads || []).map(r => r.message_id));

  const unreadByUser = {};
  (allMsgs || []).forEach(m => {
    if (m.recipient_id === currentUser.id && !readIds.has(m.id)) {
      unreadByUser[m.sender_id] = (unreadByUser[m.sender_id] || 0) + 1;
    }
  });

  const sorted = [...friendIds].sort((a, b) => {
    const aMsg = lastMsgByUser[a]?.created_at || '';
    const bMsg = lastMsgByUser[b]?.created_at || '';
    return bMsg.localeCompare(aMsg);
  });

  container.innerHTML = sorted.map(uid => {
    const nick = nickById[uid] || 'Unknown';
    const last = lastMsgByUser[uid];
    const unread = unreadByUser[uid] || 0;
    const preview = last
      ? (last.sender_id === currentUser.id ? 'Ты: ' : '') + last.text.slice(0, 30)
      : 'Начни переписку';
    const isActive = activeDialogUserId === uid;
    const isUnread = unread > 0;

    return `
      <div class="dialog-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}" onclick="openDialog('${uid}')">
        <div class="name">
          ${escapeHtml(nick)}
          ${unread > 0 ? `<span class="unread-count">${unread}</span>` : ''}
        </div>
        <div class="preview">${escapeHtml(preview)}</div>
      </div>
    `;
  }).join('');
}

async function openDialog(userId) {
  if (!currentUser) return;
  activeDialogUserId = userId;

  renderDialogs();

  const nick = await getNick(userId);

  const header = document.getElementById('dialog-header');
  if (header) header.textContent = nick;

  const inputWrap = document.getElementById('dialog-input-wrap');
  if (inputWrap) inputWrap.style.display = 'flex';

  await loadDialogMessages(userId);

  if (dialogInterval) clearInterval(dialogInterval);
  dialogInterval = setInterval(() => {
    if (activeDialogUserId === userId) {
      loadDialogMessages(userId);
    } else {
      clearInterval(dialogInterval);
      dialogInterval = null;
    }
  }, 5000);
}

async function loadDialogMessages(userId) {
  if (!currentUser) return;
  const container = document.getElementById('dialog-messages');
  if (!container) return;

  const { data: msgs } = await supabaseClient
    .from('messages')
    .select('*')
    .is('team_id', null)
    .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true })
    .limit(200);

  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<div class="empty" style="margin:auto;">Начни переписку!</div>';
    return;
  }

  const unreadIds = msgs.filter(m => m.recipient_id === currentUser.id).map(m => m.id);

  if (unreadIds.length > 0) {
    const { data: existingReads } = await supabaseClient
      .from('message_reads').select('message_id')
      .eq('user_id', currentUser.id).in('message_id', unreadIds);

    const existingSet = new Set((existingReads || []).map(r => r.message_id));
    const toInsert = unreadIds.filter(id => !existingSet.has(id));

    if (toInsert.length > 0) {
      await supabaseClient.from('message_reads').insert(
        toInsert.map(id => ({ user_id: currentUser.id, message_id: id }))
      );
    }
  }

  container.innerHTML = msgs.map(m => renderPersonalMessage(m)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderPersonalMessage(m) {
  const isOwn = m.sender_id === currentUser.id;
  const time = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="chat-msg ${isOwn ? 'own' : 'other'}" data-msg-id="${m.id || 'temp'}">
      <div>${escapeHtml(m.text)}</div>
      <div class="time">${time}</div>
    </div>
  `;
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
  const tempMsg = {
    id: tempId,
    sender_id: currentUser.id,
    recipient_id: activeDialogUserId,
    text: text,
    created_at: new Date().toISOString()
  };

  if (container) {
    const html = renderPersonalMessage(tempMsg);
    const empty = container.querySelector('.empty');
    if (empty) empty.remove();
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }

  const { data, error } = await supabaseClient
    .from('messages')
    .insert({
      sender_id: currentUser.id,
      recipient_id: activeDialogUserId,
      text: text
    })
    .select()
    .single();

  if (error) {
    toast('Ошибка: ' + error.message);
    console.error(error);
    const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
    if (tempEl) tempEl.remove();
    return;
  }

  const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
  if (tempEl && data) tempEl.setAttribute('data-msg-id', data.id);

  renderDialogs();
}

async function updateMessagesBadge() {
  const badge = document.getElementById('messages-badge');
  if (!badge) return;

  if (!currentUser) { badge.style.display = 'none'; return; }

  const { data: allMsgs } = await supabaseClient
    .from('messages').select('id')
    .eq('recipient_id', currentUser.id).is('team_id', null);

  if (!allMsgs || allMsgs.length === 0) { badge.style.display = 'none'; return; }

  const { data: reads } = await supabaseClient
    .from('message_reads').select('message_id').eq('user_id', currentUser.id);

  const readSet = new Set((reads || []).map(r => r.message_id));
  const unread = allMsgs.filter(m => !readSet.has(m.id)).length;

  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function openChat(userId) {
  closeModal();
  go('messages');
  setTimeout(() => openDialog(userId), 300);
}
// ===== АВТОРИЗАЦИЯ =====
function switchAuth(mode) {
  const loginTab = document.getElementById('tab-login');
  const regTab = document.getElementById('tab-register');
  const loginBox = document.getElementById('auth-login');
  const regBox = document.getElementById('auth-register');

  if (mode === 'login') {
    loginTab.classList.add('active');
    regTab.classList.remove('active');
    loginBox.style.display = 'block';
    regBox.style.display = 'none';
  } else {
    regTab.classList.add('active');
    loginTab.classList.remove('active');
    loginBox.style.display = 'none';
    regBox.style.display = 'block';
  }
}

async function doRegister() {
  const nick = document.getElementById('reg-nick').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const elo = parseInt(document.getElementById('reg-elo').value, 10) || 0;
  const role = document.getElementById('reg-role').value;

  if (!nick || nick.length < 3) { toast('Никнейм минимум 3 символа'); return; }
  if (!email || !email.includes('@')) { toast('Введи корректный Email'); return; }
  if (!pass || pass.length < 6) { toast('Пароль минимум 6 символов'); return; }
  if (elo < 0 || elo > 5000) { toast('ЭЛО от 0 до 5000'); return; }

  toast('Регистрируем...');

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: pass,
    options: {
      data: { nick: nick, elo: elo, role: role },
      emailRedirectTo: window.location.origin
    }
  });

  if (error) { toast('Ошибка: ' + error.message); console.error(error); return; }

  if (data.session) {
    toast('Добро пожаловать, ' + nick + '!');
    setTimeout(() => { updateAuthUI(); go('profile'); }, 800);
  } else {
    toast('Проверь почту ' + email + ' — там письмо для подтверждения');
    document.getElementById('reg-nick').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-pass').value = '';
    setTimeout(() => switchAuth('login'), 2000);
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;

  if (!email || !pass) { toast('Заполни Email и пароль'); return; }

  toast('Входим...');

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: pass
  });

  if (error) { toast('Ошибка: ' + error.message); console.error(error); return; }

  const { data: profile } = await supabaseClient
    .from('profiles').select('*').eq('id', data.user.id).single();

  if (!profile) { toast('Профиль не найден'); return; }

  currentUser = {
    id: profile.id,
    nick: profile.nick,
    email: data.user.email,
    elo: profile.elo,
    role: profile.role
  };

  toast('С возвращением, ' + currentUser.nick + '!');
  updateAuthUI();
  go('profile');
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  window._nickCache = {};
  toast('Ты вышел из аккаунта');
  updateAuthUI();
  go('home');
}

function discordAuth() {
  toast('Discord OAuth появится позже');
}

function updateAuthUI() {
  const authBtn = document.getElementById('nav-auth-btn');
  if (!authBtn) return;
  authBtn.textContent = currentUser ? 'Выйти' : 'Войти';
}

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { currentUser = null; return; }

  const { data: profile } = await supabaseClient
    .from('profiles').select('*').eq('id', data.session.user.id).single();

  if (profile) {
    currentUser = {
      id: profile.id,
      nick: profile.nick,
      email: data.session.user.email,
      elo: profile.elo,
      role: profile.role
    };
  }

  if (currentUser) {
    setTimeout(startHeartbeat, 1000);
    setTimeout(updateFriendsBadge, 1500);
    setTimeout(updateMessagesBadge, 2000);
  }
}

// ===== ПРОФИЛЬ =====
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
    emailEl.textContent = 'Войди в аккаунт';
    avatarEl.textContent = '?';
    eloEl.textContent = '—';
    roleEl.textContent = '—';
    teamEl.textContent = 'Нет';
    statusEl.textContent = '—';
    grid.innerHTML = '<div class="empty">Войди, чтобы увидеть свои команды</div>';
    return;
  }

  nickEl.textContent = currentUser.nick;
  emailEl.textContent = currentUser.email;
  avatarEl.textContent = currentUser.nick[0].toUpperCase();
  eloEl.textContent = currentUser.elo;
  roleEl.textContent = currentUser.role;

  loadAndShowStatus();

  const { data: myTeams, error } = await supabaseClient
    .from('team_members')
    .select('team_id, teams (id, name, description, max_elo, requirements, roles, slots, owner_id)')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error(error);
    grid.innerHTML = '<div class="empty">Ошибка загрузки команд</div>';
    return;
  }

  if (!myTeams || myTeams.length === 0) {
    teamEl.textContent = 'Нет';
    statusEl.textContent = 'Свободен';
    grid.innerHTML = '<div class="empty">У тебя пока нет команд. Создай первую!</div>';
    return;
  }

  teamEl.textContent = myTeams[0].teams.name;
  statusEl.textContent = 'В команде';

  grid.innerHTML = myTeams.map(row => {
    const t = row.teams;
    return `
      <div class="card" onclick="showTeam('${t.id}')">
        <div class="card-head">
          <div class="card-title">${escapeHtml(t.name)}</div>
          <div class="elo-badge">${t.max_elo}</div>
        </div>
        <div class="card-desc">${escapeHtml(t.description || 'Без описания')}</div>
        <div class="roles">${(t.roles || []).map(r => `<span class="role-tag">${r}</span>`).join('')}</div>
        <div class="card-foot"><div>${t.slots} слотов</div></div>
      </div>
    `;
  }).join('');
}

// ===== ОБРАБОТЧИКИ =====
function initFormHandlers() {
  const reqArea = document.getElementById('t-req');
  const reqCounter = document.getElementById('req-counter');
  if (reqArea && reqCounter) {
    reqArea.addEventListener('input', () => {
      const len = reqArea.value.length;
      reqCounter.textContent = len + ' / 250';
    });
  }

  const eloInput = document.getElementById('t-elo');
  const eloVal = document.getElementById('elo-val');
  if (eloInput && eloVal) {
    eloInput.addEventListener('input', () => {
      let v = parseInt(eloInput.value, 10) || 0;
      if (v > 5000) { v = 5000; eloInput.value = 5000; }
      if (v < 0) { v = 0; eloInput.value = 0; }
      eloVal.textContent = v;
    });
  }

  ['search', 'filter-role', 'filter-elo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderTeams);
  });

  const authBtn = document.getElementById('nav-auth-btn');
  if (authBtn) {
    authBtn.onclick = () => {
      if (currentUser) doLogout();
      else go('auth');
    };
  }
}

// ===== ЗАПУСК =====
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
