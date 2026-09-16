// --- ИНИЦИАЛИЗАЦИЯ SUPABASE ---
const SUPABASE_URL = 'https://zuljkcwhonygbrnkpsld.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oqqrzm-eAQutmx-azfti5Q_50sBwxcW';
const supabase = supabasejs.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
let currentUser = null;
let currentProfile = null;
let page = 'home';
let chatId = null;
let selectedFile = null;
let realtimeChannel = null;

// Хранилище данных в памяти (для быстрой отрисовки)
let store = {
  users: [],
  friends: [],
  requests: [],
  posts: [],
  likes: [],
  comments: [],
  messages: [],
  notifications: []
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ini = s => (s || "?").trim().slice(0, 2).toUpperCase();
const avatar = (u, cls = "") => `<div class="avatar ${cls}">${u?.avatar ? `<img src="${u.avatar}" alt="">` : ini(u?.name || u?.username)}</div>`;
const toast = t => {
  let e = document.getElementById("toast");
  if (!e) return;
  e.textContent = t;
  e.style.display = "block";
  clearTimeout(window._toast);
  window._toast = setTimeout(() => e.style.display = "none", 1900);
};
const fmt = t => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const online = u => u && u.last_seen && (Date.now() - new Date(u.last_seen).getTime() < 120000);

// --- ТЕМА (DARK / LIGHT) ---
function theme() { return localStorage.getItem("linker_theme_v5") || "dark"; }
function applyTheme() { document.body.classList.toggle("light", theme() === "light"); }
function toggleTheme() {
  localStorage.setItem("linker_theme_v5", theme() === "light" ? "dark" : "light");
  applyTheme();
  render();
}
function themeIcon() { return theme() === "light" ? "☀" : "☾"; }
function themeLabel() { return theme() === "light" ? "Светлая тема" : "Тёмная тема"; }

// --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ---
function authUI(register = false) {
  const root = document.getElementById("root");
  root.innerHTML = `<div class="auth"><div class="authcard"><div class="authlogo"><img src="assets/logo.png">Linker</div><div class="muted">Онлайн социальная сеть на Supabase</div>
  <h1>${register ? "Создать аккаунт" : "С возвращением"}</h1>
  <div class="field"><label>EMAIL</label><input id="ae" type="email" autocomplete="off" placeholder="user@example.com"></div>
  <div class="field"><label>USERNAME</label><input id="au" autocomplete="off" placeholder="dimash"></div>
  ${register ? '<div class="field"><label>ИМЯ</label><input id="an" autocomplete="off" placeholder="Dimash"></div>' : ''}
  <div class="field"><label>ПАРОЛЬ</label><input id="ap" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')${register ? 'register()' : 'login()'}"></div>
  <button class="primary" style="width:100%;margin-top:20px" onclick="${register ? 'register()' : 'login()'}">${register ? "Зарегистрироваться" : "Войти"}</button><div id="authmsg"></div>
  <div class="switch">${register ? "Уже есть аккаунт?" : "Нет аккаунта?"} <span class="link" onclick="authUI(${!register})">${register ? "Войти" : "Зарегистрироваться"}</span></div></div></div>`;
}

async function register() {
  let email = document.getElementById("ae").value.trim();
  let u = document.getElementById("au").value.trim().toLowerCase();
  let n = document.getElementById("an").value.trim();
  let p = document.getElementById("ap").value;
  let m = document.getElementById("authmsg");

  if (!email) return m.innerHTML = '<div class="error">Введите email</div>';
  if (!/^[a-z0-9_.-]{3,24}$/.test(u)) return m.innerHTML = '<div class="error">Username: 3–24 символа, латиница, цифры.</div>';
  if (n.length < 2 || p.length < 6) return m.innerHTML = '<div class="error">Имя ≥ 2 симв., Пароль ≥ 6 симв.</div>';

  const { data, error } = await supabase.auth.signUp({ email, password: p });
  if (error) return m.innerHTML = `<div class="error">${error.message}</div>`;

  if (data.user) {
    const { error: profErr } = await supabase.from('profiles').insert([{
      id: data.user.id,
      username: u,
      name: n,
      bio: "Привет! Я в Linker.",
      avatar: ""
    }]);
    if (profErr) return m.innerHTML = `<div class="error">${profErr.message}</div>`;
    toast("Регистрация успешна!");
    initApp();
  }
}

async function login() {
  let email = document.getElementById("ae").value.trim();
  let p = document.getElementById("ap").value;
  let m = document.getElementById("authmsg");

  if (!email || !p) return m.innerHTML = '<div class="error">Заполните поля</div>';

  const { error } = await supabase.auth.signInWithPassword({ email, password: p });
  if (error) return m.innerHTML = `<div class="error">Неверный логин или пароль</div>`;

  initApp();
}

async function logout() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  authUI();
}

// --- ЗАГРУЗКА ДАННЫХ ИЗ SUPABASE ---
async function fetchAllData() {
  const [uRes, fRes, rRes, pRes, lRes, cRes, mRes, nRes] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('friends').select('*'),
    supabase.from('requests').select('*'),
    supabase.from('posts').select('*').order('created_at', { ascending: false }),
    supabase.from('likes').select('*'),
    supabase.from('comments').select('*'),
    supabase.from('messages').select('*').order('created_at', { ascending: true }),
    supabase.from('notifications').select('*').order('created_at', { ascending: false })
  ]);

  store.users = uRes.data || [];
  store.friends = fRes.data || [];
  store.requests = rRes.data || [];
  store.posts = pRes.data || [];
  store.likes = lRes.data || [];
  store.comments = cRes.data || [];
  store.messages = mRes.data || [];
  store.notifications = nRes.data || [];
}

// --- REALTIME ПОДПИСКА (ЧАТЫ И УВЕДОМЛЕНИЯ) ---
function setupRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);

  realtimeChannel = supabase.channel('public_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
      if (payload.eventType === 'INSERT') {
        store.messages.push(payload.new);
        if (page === 'messages') render();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, payload => {
      if (payload.eventType === 'INSERT' && payload.new.to === currentUser.id) {
        store.notifications.unshift(payload.new);
        toast("Новое уведомление!");
        render();
      }
    })
    .subscribe();
}

// --- ПРОВЕРКА ДРУЖБЫ И ПОЛЬЗОВАТЕЛЕЙ ---
function isFriend(a, b) {
  return store.friends.some(f => (f.a === a && f.b === b) || (f.a === b && f.b === a));
}
function pending(a, b) {
  return store.requests.some(r => r.status === "pending" && r.from === a && r.to === b);
}
function friendIds(uId) {
  return store.friends.map(f => f.a === uId ? f.b : f.b === uId ? f.a : null).filter(Boolean);
}
function getUser(id) {
  return store.users.find(x => x.id === id);
}

// --- ОТРЕСОВКА ИНТЕРФЕЙСА (RENDER) ---
async function render() {
  if (!currentUser) return authUI();

  currentProfile = store.users.find(x => x.id === currentUser.id);
  const fids = friendIds(currentUser.id);
  const incoming = store.requests.filter(r => r.to === currentUser.id && r.status === "pending").length;
  const unread = store.notifications.filter(n => n.to === currentUser.id && !n.read).length;

  const root = document.getElementById("root");
  root.innerHTML = `<div class="app"><aside class="rail"><div class="logo"><img src="assets/logo.png"></div>
  <button class="railbtn ${page === "home" ? "active" : ""}" onclick="go('home')" title="Главная">⌂</button>
  <button class="railbtn ${page === "friends" ? "active" : ""}" onclick="go('friends')" title="Друзья">♧</button>
  <button class="railbtn ${page === "messages" ? "active" : ""}" onclick="go('messages')" title="Сообщения">◫</button>
  <button class="railbtn ${page === "notifications" ? "active" : ""}" onclick="go('notifications')" title="Уведомления">♢</button>
  <div class="railbottom"><button class="railbtn ${page === "profile" ? "active" : ""}" onclick="go('profile')" title="Профиль">●</button><button class="railbtn" onclick="toggleTheme()" title="Сменить тему">${themeIcon()}</button><button class="railbtn" onclick="go('settings')" title="Настройки">⚙</button></div></aside>
  <aside class="side"><div class="brand"><img src="assets/logo.png">Linker</div><div class="me">${avatar(currentProfile)}<div><div class="name">${esc(currentProfile?.name || 'Пользователь')}</div><div class="handle">@${esc(currentProfile?.username || '')}</div></div></div>
  <div class="navtitle">Workspace</div><button class="nav ${page === "home" ? "active" : ""}" onclick="go('home')">⌂ Главная</button>
  <button class="nav ${page === "friends" ? "active" : ""}" onclick="go('friends')">♧ Друзья <span class="count">${fids.length}</span></button>
  <button class="nav ${page === "messages" ? "active" : ""}" onclick="go('messages')">◫ Сообщения</button>
  <button class="nav ${page === "notifications" ? "active" : ""}" onclick="go('notifications')">♢ Уведомления ${unread ? `<span class="count">${unread}</span>` : ""}</button>
  <div class="navtitle">Account</div><button class="nav ${page === "profile" ? "active" : ""}" onclick="go('profile')">● Профиль</button><button class="nav ${page === "settings" ? "active" : ""}" onclick="go('settings')">⚙ Настройки</button><button class="themeToggle" onclick="toggleTheme()"><span class="themeDot">${themeIcon()}</span><span>${themeLabel()}</span></button></aside>
  <main class="main">${content(fids, incoming, unread)}</main></div>`;
}

async function go(p) {
  page = p;
  await fetchAllData();
  render();
}

function header(t, s, button = "") { return `<div class="top"><div><h1>${t}</h1><p>${s}</p></div>${button}</div>`; }

function content(fids, incoming, unread) {
  if (page === "friends") return header("Друзья", "Поиск, запросы и список друзей.") + friendsPage(fids, incoming);
  if (page === "messages") return header("Сообщения", "Личные чаты между друзьями.") + messagesPage(fids);
  if (page === "notifications") return header("Уведомления", "Все события твоего аккаунта.", `<button class="ghost" onclick="readAll()">Прочитать всё</button>`) + notificationsPage();
  if (page === "profile") return header("Профиль", "Твоя публичная страница.") + profilePage(fids);
  if (page === "settings") return header("Настройки", "Параметры аккаунта.") + settingsPage();
  return header("Главная", "Твоя социальная лента.", `<button class="logout" onclick="logout()">Выйти</button>`) + homePage(fids);
}

// --- СТРАНИЦЫ ---

function homePage(fids) {
  let posts = store.posts;
  let people = store.users.filter(x => x.id !== currentUser.id).slice(0, 6);

  return `<div class="hero"><h2>Добро пожаловать в Linker, ${esc((currentProfile?.name || "Друг").split(" ")[0])}.</h2><p>Общайся, делись постами и публикуй медиа в режиме реального времени.</p><div class="kpis"><div class="kpi"><b>${posts.length}</b><span>Постов</span></div><div class="kpi"><b>${fids.length}</b><span>Друзей</span></div><div class="kpi"><b>${store.users.length}</b><span>Аккаунтов</span></div></div></div>
  <div class="grid"><section><div class="panel"><div class="panelhead"><h2>Пользователи</h2></div><div class="stories">${people.map(x => `<div class="story">${avatar(x)}<span>${esc(x.name || x.username)}</span></div>`).join("")}</div></div>
  <div class="panel composer"><div class="panelhead"><h2>Что нового?</h2></div>
  <textarea id="postText" placeholder="Напиши пост..."></textarea>
  <div style="display:flex;align-items:center;gap:9px;margin-top:10px;flex-wrap:wrap">
  <label class="ghost" style="cursor:pointer;display:inline-flex;align-items:center;gap:7px">📷 Добавить фото
  <input id="postImage" type="file" accept="image/*" style="display:none" onchange="previewPostImage(event)">
  </label>
  <button class="ghost tiny" id="removePostImage" style="display:none" onclick="removePostImage()">Убрать фото</button>
  </div>
  <div id="postPreview" style="display:none;margin-top:12px">
  <img id="postPreviewImg" style="display:block;width:100%;max-height:420px;object-fit:cover;border-radius:12px;border:1px solid #333" alt="Превью">
  </div>
  <div class="composerfoot"><span class="muted">Публикация в Supabase.</span><button class="primary" onclick="createPost()">Опубликовать</button></div></div>
  ${posts.length ? posts.map(p => postHTML(p)).join("") : '<div class="panel empty">Лента пустая. Создай первый пост.</div>'}</section>
  <aside><div class="panel"><div class="panelhead"><h2>Люди</h2><span class="muted">${store.users.length}</span></div>${people.map(x => personRow(x, fids)).join("") || '<div class="empty">Пока никого нет.</div>'}</div></aside></div>`;
}

function personRow(x, fids) {
  let relation = isFriend(currentUser.id, x.id);
  let sent = pending(currentUser.id, x.id);
  let received = pending(x.id, currentUser.id);
  let act = relation ? `<button class="ghost tiny" onclick="openChat('${x.id}')">Чат</button>` : sent ? '<span class="badge">Отправлен</span>' : received ? '<span class="badge">Ждёт ответа</span>' : `<button class="ghost tiny" onclick="sendReq('${x.id}')">Добавить</button>`;
  return `<div class="userrow"><div class="userleft">${avatar(x, "sm")}<div><div class="name">${esc(x.name || x.username)}</div><div class="handle">@${esc(x.username)}</div></div></div>${act}</div>`;
}

function postHTML(p) {
  let a = getUser(p.user_id);
  let liked = store.likes.some(x => x.post_id === p.id && x.user_id === currentUser.id);
  let lc = store.likes.filter(x => x.post_id === p.id).length;
  let cs = store.comments.filter(x => x.post_id === p.id);

  return `<article class="panel"><div class="posthead">${avatar(a)}<div><div class="name">${esc(a?.name || a?.username)}</div><div class="handle">@${esc(a?.username)} · ${fmt(p.created_at)}</div></div><div class="postmenu">${p.user_id === currentUser.id ? `<button class="action tiny" onclick="deletePost('${p.id}')">Удалить</button>` : ""}</div></div>
  ${p.image_url ? `<img src="${p.image_url}" style="display:block;width:100%;max-height:520px;object-fit:cover;border-radius:12px;margin:14px 0">` : ""}
  <div class="posttext">${esc(p.text || "").replace(/\n/g, "<br>")}</div>
  <div class="postactions"><button class="action ${liked ? "liked" : ""}" onclick="likePost('${p.id}')">♡ ${lc}</button><button class="action">◌ ${cs.length}</button></div>
  ${cs.map(c => { let x = getUser(c.user_id); return `<div class="comment"><b>${esc(x?.name || x?.username)}</b>: ${esc(c.text)}</div>`; }).join("")}
  <div class="commentrow"><input class="commentinput" id="comment-${p.id}" placeholder="Комментарий..." onkeydown="if(event.key==='Enter')comment('${p.id}')"><button class="ghost tiny" onclick="comment('${p.id}')">Отправить</button></div></article>`;
}

// --- РАБОТА С ПОСТАМИ И СТОРАДЖЕМ ---
function previewPostImage(ev) {
  selectedFile = ev.target.files[0];
  if (!selectedFile) return;
  let reader = new FileReader();
  reader.onload = () => {
    document.getElementById("postPreviewImg").src = reader.result;
    document.getElementById("postPreview").style.display = "block";
    document.getElementById("removePostImage").style.display = "inline-flex";
  };
  reader.readAsDataURL(selectedFile);
}

function removePostImage() {
  selectedFile = null;
  document.getElementById("postPreview").style.display = "none";
  document.getElementById("removePostImage").style.display = "none";
}

async function createPost() {
  let text = document.getElementById("postText").value.trim();
  let imageUrl = "";

  if (!text && !selectedFile) return toast("Добавьте текст или фото");

  if (selectedFile) {
    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabase.storage.from('avatars').upload(`posts/${fileName}`, selectedFile);
    if (error) return toast("Ошибка загрузки картинки");
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(`posts/${fileName}`);
    imageUrl = urlData.publicUrl;
  }

  const { error } = await supabase.from('posts').insert([{
    user_id: currentUser.id,
    text: text,
    image_url: imageUrl
  }]);

  if (error) return toast(error.message);

  selectedFile = null;
  toast("Пост опубликован!");
  await fetchAllData();
  render();
}

async function likePost(postId) {
  let existing = store.likes.find(x => x.post_id === postId && x.user_id === currentUser.id);
  if (existing) {
    await supabase.from('likes').delete().eq('id', existing.id);
  } else {
    await supabase.from('likes').insert([{ post_id: postId, user_id: currentUser.id }]);
  }
  await fetchAllData();
  render();
}

async function comment(postId) {
  let e = document.getElementById("comment-" + postId);
  let t = e.value.trim();
  if (!t) return;
  await supabase.from('comments').insert([{ post_id: postId, user_id: currentUser.id, text: t }]);
  await fetchAllData();
  render();
}

async function deletePost(postId) {
  if (!confirm("Удалить пост?")) return;
  await supabase.from('posts').delete().eq('id', postId);
  await fetchAllData();
  render();
}

// --- СТРАНИЦА ДРУЗЕЙ ---
function friendsPage(fids, incoming) {
  return `<div class="panel"><div class="panelhead"><h2>Входящие запросы</h2><span class="badge">${incoming}</span></div>${store.requests.filter(r => r.to === currentUser.id && r.status === "pending").map(r => {
    let x = getUser(r.from);
    return `<div class="requestrow"><div class="userleft">${avatar(x)}<div><div class="name">${esc(x?.name || x?.username)}</div></div></div><div class="actions"><button class="primary tiny" onclick="acceptReq('${r.id}', '${r.from}')">Принять</button></div></div>`;
  }).join("") || '<div class="empty">Нет новых запросов.</div>'}</div>
  <div class="panel"><div class="panelhead"><h2>Мои друзья</h2><span class="muted">${fids.length}</span></div>${fids.map(fid => {
    let x = getUser(fid);
    return `<div class="friendrow"><div class="userleft">${avatar(x)}<div><div class="name">${esc(x?.name || x?.username)}</div></div></div><div class="actions"><button class="ghost tiny" onclick="openChat('${x.id}')">Написать</button></div></div>`;
  }).join("") || '<div class="empty">Пока нет друзей.</div>'}</div>`;
}

async function sendReq(toId) {
  await supabase.from('requests').insert([{ from: currentUser.id, to: toId, status: 'pending' }]);
  await supabase.from('notifications').insert([{ to: toId, from: currentUser.id, type: 'request' }]);
  toast("Запрос отправлен");
  await fetchAllData();
  render();
}

async function acceptReq(reqId, fromId) {
  await supabase.from('requests').update({ status: 'accepted' }).eq('id', reqId);
  await supabase.from('friends').insert([{ a: currentUser.id, b: fromId }]);
  await supabase.from('notifications').insert([{ to: fromId, from: currentUser.id, type: 'accepted' }]);
  toast("Теперь вы друзья");
  await fetchAllData();
  render();
}

// --- ЧАТ И СООБЩЕНИЯ ---
function openChat(fid) {
  chatId = fid;
  page = "messages";
  render();
}

function messagesPage(fids) {
  let friends = fids.map(getUser).filter(Boolean);
  if (!friends.length) return `<div class="panel empty">Сначала добавьте кого-нибудь в друзья.</div>`;
  if (!chatId || !friends.some(x => x.id === chatId)) chatId = friends[0].id;
  
  let target = getUser(chatId);
  let msgs = store.messages.filter(m => (m.from === currentUser.id && m.to === target.id) || (m.from === target.id && m.to === currentUser.id));

  return `<div class="panel chatlayout"><div class="chatlist">${friends.map(x => `<div class="chatitem ${x.id === target.id ? "active" : ""}" onclick="openChat('${x.id}')">${avatar(x, "sm")}<div><div class="name">${esc(x.name || x.username)}</div></div></div>`).join("")}</div>
  <div class="chatarea"><div class="posthead">${avatar(target, "sm")}<div><div class="name">${esc(target.name || target.username)}</div></div></div>
  <div class="messages" id="messages">${msgs.map(m => `<div class="bubble ${m.from === currentUser.id ? "mine" : ""}">${esc(m.text)}<div class="bubbletime">${fmt(m.created_at)}</div></div>`).join("")}</div>
  <div class="chatcomposer"><input class="chatinput" id="chatInput" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter')sendMsg('${target.id}')"><button class="primary" onclick="sendMsg('${target.id}')">Отправить</button></div></div></div>`;
}

async function sendMsg(toId) {
  let input = document.getElementById("chatInput");
  let text = input.value.trim();
  if (!text) return;
  input.value = "";

  await supabase.from('messages').insert([{ from: currentUser.id, to: toId, text }]);
  await supabase.from('notifications').insert([{ to: toId, from: currentUser.id, type: 'message' }]);
}

// --- УВЕДОМЛЕНИЯ И ПРОФИЛЬ ---
function notificationsPage() {
  let ns = store.notifications.filter(n => n.to === currentUser.id);
  return `<div class="panel">${ns.length ? ns.map(n => {
    let x = getUser(n.from);
    return `<div class="notice">Уведомление от <b>${esc(x?.name || x?.username)}</b> (${n.type})<small>${fmt(n.created_at)}</small></div>`;
  }).join("") : '<div class="empty">Уведомлений нет.</div>'}</div>`;
}

async function readAll() {
  await supabase.from('notifications').update({ read: true }).eq('to', currentUser.id);
  await fetchAllData();
  render();
}

function profilePage(fids) {
  return `<div class="panel"><div class="profilecover"></div><div class="profileinfo">${avatar(currentProfile, "big")}<div><h2>${esc(currentProfile?.name || '')}</h2><div class="handle">@${esc(currentProfile?.username || '')}</div></div></div><div class="profilebio">${esc(currentProfile?.bio || '')}</div></div>
  <div class="panel"><div class="panelhead"><h2>Редактировать профиль</h2></div>
  <div class="field"><label>ИМЯ</label><input id="pname" value="${esc(currentProfile?.name || '')}"></div>
  <div class="field"><label>ОПИСАНИЕ</label><textarea id="pbio">${esc(currentProfile?.bio || '')}</textarea></div>
  <div class="profileactions"><button class="primary" onclick="saveProfile()">Сохранить</button></div></div>`;
}

async function saveProfile() {
  let name = document.getElementById("pname").value.trim();
  let bio = document.getElementById("pbio").value.trim();

  await supabase.from('profiles').update({ name, bio }).eq('id', currentUser.id);
  toast("Профиль сохранен");
  await fetchAllData();
  render();
}

function settingsPage() {
  return `<div class="panel"><h2>Настройки</h2><p class="muted">Выберете тему оформления проекта.</p><button class="themeToggle" onclick="toggleTheme()"><span class="themeDot">${themeIcon()}</span><span>${themeLabel()}</span></button></div>`;
}

// --- ИНИЦИАЛИЗАЦИЯ ПРИ СТАРТЕ ---
async function initApp() {
  applyTheme();
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    currentUser = data.user;
    await fetchAllData();
    setupRealtime();
    render();
  } else {
    authUI();
  }
}

// Запуск при загрузке страницы
document.addEventListener("DOMContentLoaded", initApp);