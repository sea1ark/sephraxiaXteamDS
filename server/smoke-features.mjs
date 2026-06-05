// End-to-end smoke test for friends, moderation, DM edit/delete/reply, replies.
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:4000';
const prisma = new PrismaClient();
const log = (...a) => console.log(...a);
const rnd = () => Math.random().toString(36).slice(2, 8);
let pass = 0;
let fail = 0;
const check = (cond, label) => {
  if (cond) { pass++; log('  ✓', label); } else { fail++; log('  ✗ FAIL:', label); }
};

const post = (path, token, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const get = (path, token) =>
  fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.json());

const reg = (username) => post('/auth/register', null, { username, password: 'password123' }).then((r) => r.json());

function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  return new Promise((res, rej) => {
    s.on('connect', () => res(s));
    s.on('connect_error', (e) => rej(e));
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
}
const waitFor = (sock, evt, ms = 3000) =>
  new Promise((res) => {
    const t = setTimeout(() => res(null), ms);
    sock.once(evt, (d) => { clearTimeout(t); res(d); });
  });

async function main() {
  const owner = await reg(`owner_${rnd()}`);
  const a = await reg(`alice_${rnd()}`);
  const b = await reg(`bob_${rnd()}`);
  await prisma.user.update({ where: { id: owner.user.id }, data: { isOwner: true } });
  log('registered owner/alice/bob');

  // ---- Friends ----
  log('\n[friends]');
  let r = await post('/friends/request', a.accessToken, { username: b.user.username });
  check(r.status === 201, 'alice requests bob (201)');
  let bf = await get('/friends', b.accessToken);
  check(bf.incoming.length === 1 && bf.incoming[0].user.id === a.user.id, 'bob sees 1 incoming');
  const reqId = bf.incoming[0].id;
  r = await post(`/friends/${reqId}/accept`, b.accessToken);
  check(r.status === 200, 'bob accepts');
  const af = await get('/friends', a.accessToken);
  check(af.friends.some((f) => f.id === b.user.id), 'alice now friends with bob');
  const search = await get(`/users/search?q=bob`, a.accessToken);
  check(Array.isArray(search) && search.some((u) => u.id === b.user.id), 'search finds bob');
  r = await fetch(`${BASE}/friends/${b.user.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.accessToken}` } });
  check(r.status === 200, 'alice removes bob');
  check((await get('/friends', a.accessToken)).friends.length === 0, 'no friends after remove');

  // ---- Channel reply ----
  log('\n[channel reply]');
  const channels = await get('/channels', a.accessToken);
  const channelId = channels[0].id;
  const sockA = await connect(a.accessToken);
  let got = waitFor(sockA, 'message:new');
  sockA.emit('message:send', { channelId, content: 'parent message' });
  const parent = await got;
  check(parent && parent.content === 'parent message', 'alice sends parent message');
  got = waitFor(sockA, 'message:new');
  sockA.emit('message:send', { channelId, content: 'a reply', replyToId: parent.id });
  const replyMsg = await got;
  check(replyMsg?.replyTo?.id === parent.id, 'reply carries replyTo preview');
  check(replyMsg?.replyTo?.authorName === a.user.username, 'reply preview has author name');

  // ---- DM send/edit/reply/delete ----
  log('\n[dm]');
  const sockB = await connect(b.accessToken);
  let gotB = waitFor(sockB, 'dm:new');
  sockA.emit('dm:send', { toId: b.user.id, content: 'hi bob' });
  const dm = await gotB;
  check(dm && dm.content === 'hi bob', 'bob receives dm');
  let gotEdit = waitFor(sockB, 'dm:update');
  sockA.emit('dm:edit', { dmId: dm.id, content: 'hi bob (edited)' });
  const edited = await gotEdit;
  check(edited?.content === 'hi bob (edited)' && edited?.editedAt, 'dm edit works');
  let gotReply = waitFor(sockB, 'dm:new');
  sockA.emit('dm:send', { toId: b.user.id, content: 're', replyToId: dm.id });
  const dmReply = await gotReply;
  check(dmReply?.replyTo?.id === dm.id, 'dm reply carries replyTo');
  // bob cannot edit alice's dm
  sockB.emit('dm:edit', { dmId: dm.id, content: 'hacked' });
  await new Promise((r2) => setTimeout(r2, 400));
  const hist = await get(`/dms/${a.user.id}`, b.accessToken);
  check(!hist.some((m) => m.content === 'hacked'), 'bob cannot edit alice dm');
  // alice deletes her dm
  let gotDel = waitFor(sockB, 'dm:delete');
  sockA.emit('dm:delete', { dmId: dm.id });
  const del = await gotDel;
  check(del?.id === dm.id, 'dm delete broadcast');

  // ---- Moderation: timeout ----
  log('\n[moderation: timeout]');
  r = await post(`/users/${a.user.id}/timeout`, owner.accessToken, { minutes: 5 });
  check(r.status === 200, 'owner times out alice');
  got = waitFor(sockA, 'message:new', 1200);
  sockA.emit('message:send', { channelId, content: 'should be blocked' });
  check((await got) === null, 'timed-out alice cannot send');
  r = await post(`/users/${a.user.id}/timeout`, owner.accessToken, { minutes: 0 });
  check(r.status === 200, 'owner removes timeout');
  got = waitFor(sockA, 'message:new', 1500);
  sockA.emit('message:send', { channelId, content: 'now allowed' });
  check((await got)?.content === 'now allowed', 'alice can send after timeout removed');

  // ---- Moderation: permission + owner protection ----
  log('\n[moderation: authz]');
  r = await post(`/users/${b.user.id}/ban`, a.accessToken);
  check(r.status === 403, 'non-mod alice cannot ban (403)');
  r = await post(`/users/${owner.user.id}/timeout`, owner.accessToken, { minutes: 5 });
  check(r.status === 400, 'cannot moderate yourself (400)');
  // Make bob a moderator with canBan, then verify the owner is still protected.
  const modRole = await (await post('/roles', owner.accessToken, { name: `mod_${rnd()}`, color: '#7d6fc4', symbol: '⚔', canBan: true })).json();
  await fetch(`${BASE}/users/${b.user.id}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.accessToken}` },
    body: JSON.stringify({ roleIds: [modRole.id] }),
  });
  r = await post(`/users/${owner.user.id}/ban`, b.accessToken);
  check(r.status === 403, 'a moderator cannot ban the owner (403)');

  // ---- Moderation: ban enforcement ----
  log('\n[moderation: ban]');
  const enforced = waitFor(sockA, 'moderation:enforced', 2000);
  r = await post(`/users/${a.user.id}/ban`, owner.accessToken, { reason: 'testing' });
  check(r.status === 200, 'owner bans alice');
  const ev = await enforced;
  check(ev?.action === 'ban', 'alice socket received ban event');
  const login = await post('/auth/login', null, { username: a.user.username, password: 'password123' });
  check(login.status === 403, 'banned alice cannot log in (403)');
  let banned;
  try { await connect(a.accessToken); banned = false; } catch { banned = true; }
  check(banned, 'banned alice cannot connect socket');
  const members = await get('/users', owner.accessToken);
  check(!members.some((u) => u.id === a.user.id), 'banned alice hidden from member list');
  const bans = await get('/moderation/bans', owner.accessToken);
  check(bans.some((u) => u.id === a.user.id), 'alice appears in ban list');
  r = await post(`/users/${a.user.id}/unban`, owner.accessToken);
  check(r.status === 200, 'owner unbans alice');

  sockA.close(); sockB.close();
  log(`\n=== ${pass} passed, ${fail} failed ===`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error('SMOKE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
