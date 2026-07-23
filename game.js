import { db } from './firebase-config.js';
import {
  ref, set, get, update, onValue, remove, off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ===== カード定義 =====
const CARDS = {
  SHOOT_1:  { id:'SHOOT_1',  type:'shoot',   level:1, icon:'⚽', name:'シュート', label:'Lv.1', image:'images/shoot_1.webp' },
  SHOOT_2:  { id:'SHOOT_2',  type:'shoot',   level:2, icon:'⚽', name:'シュート', label:'Lv.2', image:'images/shoot_2.webp' },
  SHOOT_3:  { id:'SHOOT_3',  type:'shoot',   level:3, icon:'⚽', name:'シュート', label:'Lv.3', image:'images/shoot_3.webp' },
  SHOOT_4:  { id:'SHOOT_4',  type:'shoot',   level:4, icon:'⚽', name:'シュート', label:'Lv.4', image:'images/shoot_4.webp' },
  BLOCK_1:  { id:'BLOCK_1',  type:'block',   level:1, icon:'🛡️', name:'ブロック', label:'Lv.1', image:'images/block_1.webp' },
  BLOCK_2:  { id:'BLOCK_2',  type:'block',   level:2, icon:'🛡️', name:'ブロック', label:'Lv.2', image:'images/block_2.webp' },
  BLOCK_3:  { id:'BLOCK_3',  type:'block',   level:3, icon:'🛡️', name:'ブロック', label:'Lv.3', image:'images/block_3.webp' },
  BLOCK_4:  { id:'BLOCK_4',  type:'block',   level:4, icon:'🛡️', name:'ブロック', label:'Lv.4', image:'images/block_4.webp' },
  DRIBBLE_A:{ id:'DRIBBLE_A',type:'dribble', level:null, icon:'🌀', name:'ドリブル', label:'', image:'images/dribble_a.webp' },
  DRIBBLE_B:{ id:'DRIBBLE_B',type:'dribble', level:null, icon:'🌀', name:'ドリブル', label:'', image:'images/dribble_b.webp' },
};
const INITIAL_DECK = Object.keys(CARDS);
const AVATARS = ['⚽','🦁','🐯','🔥','⭐','🌀','🎯','🏆','🦊','🛡️'];

// ===== グローバル状態 =====
let selectedAccount = null;
let myRole          = null;
let roomId          = null;
let gameState       = null;
let mySelectedCard  = null;
let unsubscribers   = [];
let pkState         = { round: 0 };
let countdownActive = false;
let isVsComputer    = false; // ✅ CPU対戦フラグ追加

const $ = id => document.getElementById(id);

// =========================================
//  画像プリロード
// =========================================
function preloadAllImages() {
  const urls = [
    ...Object.values(CARDS).map(c => c.image),
    'images/background.webp',
    'images/win.webp',
    'images/lose.webp',
  ].filter(Boolean);
  urls.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}
preloadAllImages();

// =========================================
//  アカウント管理（Firebase版）
// =========================================
let cachedAccounts = [];
async function initAccounts() {
  const snap = await get(ref(db, 'accounts'));
  if (!snap.exists()) {
    const updates = {};
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `プレイヤー${i + 1}`,
      avatar: AVATARS[i],
    })).forEach(acc => {
      updates[`accounts/${acc.id}`] = acc;
    });
    await update(ref(db), updates);
  }
}
async function updateAccountName(id, newName) {
  await update(ref(db, `accounts/${id}`), { name: newName });
}
function listenAccounts() {
  const accRef = ref(db, 'accounts');
  onValue(accRef, snap => {
    if (!snap.exists()) return;
    cachedAccounts = Object.values(snap.val())
      .sort((a, b) => a.id - b.id);
    renderAccountScreen();
  });
}

// =========================================
//  アカウント画面
// =========================================
function renderAccountScreen() {
  const grid = $('account-grid');
  grid.innerHTML = '';
  cachedAccounts.forEach(account => {
    const card = createAccountCard(account);
    grid.appendChild(card);
  });
}
function createAccountCard(account) {
  const card = document.createElement('div');
  card.className = 'account-card';
  card.dataset.id = account.id;
  card.innerHTML = `
    <div class="account-avatar">${account.avatar}</div>
    <div class="account-name" id="aname-${account.id}">${account.name}</div>
    <button class="account-edit-btn">✏️ 編集</button>
  `;
  card.addEventListener('click', e => {
    if (card.classList.contains('editing')) return;
    if (e.target.closest('.account-edit-btn')) return;
    onSelectAccount(account);
  });
  card.querySelector('.account-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    enterEditMode(card, account);
  });
  return card;
}
function enterEditMode(card, account) {
  card.classList.add('editing');
  const nameEl  = card.querySelector(`#aname-${account.id}`);
  const editBtn = card.querySelector('.account-edit-btn');
  nameEl.innerHTML =
    `<input class="account-name-input" id="ainput-${account.id}"
            type="text" maxlength="8" value="${account.name}" />`;
  editBtn.style.display = 'none';
  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  actions.innerHTML = `
    <button class="btn-save-acc">✅</button>
    <button class="btn-cancel-acc">❌</button>
  `;
  card.appendChild(actions);
  const input = $(`ainput-${account.id}`);
  input.focus();
  input.select();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  actions.querySelector('.btn-save-acc').click();
    if (e.key === 'Escape') actions.querySelector('.btn-cancel-acc').click();
  });
  actions.addEventListener('click', async e => {
    e.stopPropagation();
    if (e.target.classList.contains('btn-save-acc')) {
      const val = input.value.trim() || account.name;
      account.name = val;
      await updateAccountName(account.id, val);
    }
    if (e.target.classList.contains('btn-cancel-acc')) {
      renderAccountScreen();
    }
  });
}
function onSelectAccount(account) {
  selectedAccount = account;
  $('selected-account-banner').innerHTML = `
    <span class="banner-avatar">${account.avatar}</span>
    <span class="banner-name">${account.name}</span>
  `;
  $('btn-create').disabled  = false;
  $('btn-vs-cpu').disabled  = false; // ✅ CPU対戦ボタンも有効化
  $('room-info').classList.add('hidden');
  $('lobby-error').classList.add('hidden');
  $('input-room-id').value = '';
  showScreen('screen-lobby');
}

// =========================================
//  ユーティリティ
// =========================================
function genRoomId() {
  return String(Math.floor(Math.random() * 900) + 100);
}
function judgeRound(c1id, c2id, yellowTarget) {
  if (yellowTarget) return 'draw_yellow';
  const c1 = CARDS[c1id], c2 = CARDS[c2id];
  if (c1.type === c2.type) {
    if (c1.type === 'shoot') {
      if (c1.level > c2.level) return 'player1';
      if (c1.level < c2.level) return 'player2';
    }
    return 'draw';
  }
  if (c1.type === 'shoot' && c2.type === 'block') {
    return c1.level >= c2.level + 2 ? 'player1' : 'player2';
  }
  if (c1.type === 'block' && c2.type === 'shoot') {
    return c2.level >= c1.level + 2 ? 'player2' : 'player1';
  }
  const beats = { shoot: 'dribble', dribble: 'block' };
  if (beats[c1.type] === c2.type) return 'player1';
  if (beats[c2.type] === c1.type) return 'player2';
  return 'draw';
}
function getCommentary(result, myRole, c1id, c2id) {
  if (result === 'draw_yellow') return '🟡 イエローカード発動！このターンは得点なし！';
  if (result === 'draw')        return '🤝 引き分け！ 得点なし';
  const c1 = CARDS[c1id], c2 = CARDS[c2id];
  const my  = myRole === 'player1' ? c1 : c2;
  const opp = myRole === 'player1' ? c2 : c1;
  if (result === myRole) {
    if (my.type==='shoot'   && opp.type==='dribble') return '⚽ ゴーール！ シュートが決まった！';
    if (my.type==='dribble' && opp.type==='block')   return '🌀 抜いた！チャンス！ あなたの得点！';
    if (my.type==='block'   && opp.type==='shoot')   return '🛡️ ナイスセーブ！ 守り切った！';
    if (my.type==='shoot'   && opp.type==='block')   return `⚽ Lv.${my.level}シュートがブロックを突破！ゴール！`;
    if (my.type==='shoot') return `⚽ シュート(${my.level}) が勝った！ゴール！`;
    return `${my.icon} あなたの勝ち！`;
  } else {
    if (opp.type==='shoot'   && my.type==='dribble') return '⚽ 相手ゴーール！ 止められなかった！';
    if (opp.type==='dribble' && my.type==='block')   return '🌀 かわされた！ 相手の得点！';
    if (opp.type==='block'   && my.type==='shoot')   return '🛡️ 相手ナイスセーブ！ 止められた！';
    if (opp.type==='shoot'   && my.type==='block')   return `⚽ 相手Lv.${opp.level}シュートに突破された！`;
    if (opp.type==='shoot') return `⚽ 相手シュート(${opp.level}) が決まった！`;
    return `${opp.icon} 相手の勝ち！`;
  }
}

// =========================================
//  画面切替
// =========================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function cleanupListeners() {
  unsubscribers.forEach(fn => { try { fn(); } catch(e){} });
  unsubscribers = [];
}

// =========================================
//  ロビー
// =========================================
$('btn-back-account').addEventListener('click', async () => {
  if (roomId && myRole === 'player1' && !isVsComputer) { // ✅ CPU時はFirebase削除しない
    try { await remove(ref(db, `rooms/${roomId}`)); } catch(e){}
  }
  cleanupListeners();
  isVsComputer = false; // ✅ リセット
  myRole = roomId = gameState = mySelectedCard = null;
  showScreen('screen-account');
});

$('btn-create').addEventListener('click', async () => {
  if (!selectedAccount) return;
  roomId = genRoomId();
  myRole = 'player1';
  await set(ref(db, `rooms/${roomId}`), {
    status: 'waiting',
    player1: {
      hand: INITIAL_DECK, score: 0, ready: false,
      yellowUsed: false, redUsed: false,
      name: selectedAccount.name, avatar: selectedAccount.avatar,
    },
    player2: null,
    turn: 1,
    turnPhase: 'select',
    scores: { player1: 0, player2: 0 },
  });
  $('display-room-id').textContent = roomId;
  $('room-info').classList.remove('hidden');
  $('btn-create').disabled = true;
  const statusRef = ref(db, `rooms/${roomId}/status`);
  const unsub = onValue(statusRef, snap => {
    if (snap.val() === 'playing') {
      off(statusRef);
      startGame();
    }
  });
  unsubscribers.push(() => off(statusRef));
});

$('btn-join').addEventListener('click', async () => {
  if (!selectedAccount) return;
  const inputId = $('input-room-id').value.trim();
  if (!/^\d{3}$/.test(inputId)) {
    showError('3桁の数字を入力してください（例：427）');
    return;
  }
  const snap = await get(ref(db, `rooms/${inputId}`));
  if (!snap.exists()) { showError('ルームが見つかりません'); return; }
  if (snap.val().status !== 'waiting') { showError('このルームはすでに開始済みです'); return; }
  roomId = inputId;
  myRole = 'player2';
  await update(ref(db), {
    [`rooms/${roomId}/player2/hand`]:        INITIAL_DECK,
    [`rooms/${roomId}/player2/score`]:       0,
    [`rooms/${roomId}/player2/ready`]:       false,
    [`rooms/${roomId}/player2/yellowUsed`]:  false,
    [`rooms/${roomId}/player2/redUsed`]:     false,
    [`rooms/${roomId}/player2/name`]:        selectedAccount.name,
    [`rooms/${roomId}/player2/avatar`]:      selectedAccount.avatar,
    [`rooms/${roomId}/status`]:              'playing',
  });
  startGame();
});

// ✅ CPU対戦ボタン追加
$('btn-vs-cpu').addEventListener('click', () => {
  if (!selectedAccount) return;
  isVsComputer = true;
  myRole = 'player1';
  roomId = 'cpu-room';
  gameState = {
    status: 'playing',
    player1: {
      hand: [...INITIAL_DECK], score: 0, ready: false,
      yellowUsed: false, redUsed: false,
      name: selectedAccount.name, avatar: selectedAccount.avatar,
      discard: [],
    },
    player2: {
      hand: [...INITIAL_DECK], score: 0, ready: false,
      yellowUsed: false, redUsed: false,
      name: 'CPU', avatar: '🤖',
      discard: [],
    },
    turn: 1,
    turnPhase: 'select',
    scores: { player1: 0, player2: 0 },
  };
  startGame();
});

function showError(msg) {
  const el = $('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// =========================================
//  ゲーム開始
// =========================================
function startGame() {
  mySelectedCard  = null;
  countdownActive = false;
  showScreen('screen-game');
  $('option-area').classList.add('hidden');
  setupDropZone();

  // ✅ CPU対戦はFirebaseを使わない
  if (isVsComputer) {
    renderGame();
    return;
  }

  setupStampListener(); // オンライン対戦のみスタンプON
  const gameRef = ref(db, `rooms/${roomId}`);
  const unsub = onValue(gameRef, snap => {
    if (!snap.exists()) return;
    gameState = snap.val();
    renderGame();
    checkTurnResult();
  });
  unsubscribers.push(() => off(gameRef));
}

// =========================================
//  ドロップゾーン設定
// =========================================
function setupDropZone() {
  const dropZone = $('slot-me');
  dropZone.addEventListener('dragover', (e) => {
    if (gameState?.turnPhase !== 'select') return;
    if (gameState?.[myRole]?.ready) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId) selectCard(cardId);
  });
}

// =========================================
//  カード拡大表示
// =========================================
function showCardZoom(cardId) {
  const card = CARDS[cardId];
  if (!card?.image) return;
  $('zoom-card-img').src = card.image;
  $('zoom-card-img').alt = `${card.name} ${card.label}`;
  $('card-zoom-modal').classList.remove('hidden');
}
$('zoom-backdrop').addEventListener('click', (e) => {
  if (e.target === $('zoom-backdrop')) $('card-zoom-modal').classList.add('hidden');
});
$('btn-close-zoom').addEventListener('click', () => {
  $('card-zoom-modal').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('card-zoom-modal').classList.add('hidden');
});

// =========================================
//  ゲーム描画
// =========================================
function renderGame() {
  if (!gameState) return;
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';
  const me  = gameState[myRole];
  const opp = gameState[oppRole];
  if (!me || !opp) return;
  $('score-me').textContent  = gameState.scores[myRole]  || 0;
  $('score-opp').textContent = gameState.scores[oppRole] || 0;
  $('turn-num').textContent  = gameState.turn || 1;
  const myName  = me.name  || 'あなた';
  const oppName = opp.name || '相手';
  $('my-name-label').textContent  = myName;
  $('opp-name-label').textContent = oppName;
  $('my-slot-label').textContent  = myName;
  $('opp-slot-label').textContent = oppName;
  renderMyHand(me.hand   || []);
  renderOppHand(opp.hand || []);
  $('hand-count').textContent = `(${(me.hand||[]).length}枚)`;
  if (gameState.turnPhase === 'select') {
    $('opp-card-display').className = 'card card-back';
    $('opp-card-display').innerHTML = '?';
    if (!gameState[myRole]?.ready) {
      mySelectedCard = null;
    }
    if (mySelectedCard) {
      renderCardDisplay('my-card-display', mySelectedCard);
      $('commentary').textContent = '✅ カードを出しました！相手を待っています...';
    } else {
      $('my-card-display').className   = 'card card-placeholder';
      $('my-card-display').textContent = 'ここにドロップ';
      $('commentary').textContent = 'カードを選んで出してください！';
    }
  }
}

// =========================================
//  手札描画（ドラッグ＆ドロップ + クリックで拡大）
// =========================================
function renderMyHand(hand) {
  const container = $('my-hand');
  container.innerHTML = '';
  hand.forEach(cardId => {
    const card = CARDS[cardId];
    if (!card) return;
    const el = document.createElement('div');
    el.className = `hand-card ${card.type} img-card`;
    if (cardId === mySelectedCard)        el.classList.add('selected');
    if (gameState.turnPhase !== 'select') el.classList.add('disabled');
    if (card.image) {
      el.innerHTML = `
        <img src="${card.image}" alt="${card.name}"
             class="card-img-full" draggable="false" />
      `;
    } else {
      el.innerHTML = `
        <div class="hc-icon">${card.icon}</div>
        <div class="hc-name">${card.name}</div>
        <div class="hc-level">${card.label}</div>
      `;
    }
    el.draggable = true;
    let isDragging = false;
    el.addEventListener('dragstart', (e) => {
      if (gameState.turnPhase !== 'select') { e.preventDefault(); return; }
      if (gameState[myRole]?.ready)         { e.preventDefault(); return; }
      isDragging = true;
      e.dataTransfer.setData('cardId', cardId);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      setTimeout(() => { isDragging = false; }, 50);
    });
    el.addEventListener('click', () => {
      if (isDragging) return;
      showCardZoom(cardId);
    });
    container.appendChild(el);
  });
}
function renderOppHand(hand) {
  const container = $('opp-hand');
  container.innerHTML = '';
  hand.forEach(cardId => {
    const card = CARDS[cardId];
    const el = document.createElement('div');
    el.className = `mini-card ${card?.type || ''}`;
    el.textContent = card?.icon || '?';
    container.appendChild(el);
  });
}
function renderCardDisplay(slotId, cardId) {
  const card = CARDS[cardId];
  const slot = $(slotId);
  if (!card) return;
  slot.className = `card ${card.type} img-card`;
  if (card.image) {
    slot.innerHTML = `
      <img src="${card.image}" alt="${card.name}" class="card-img-full" />
    `;
  } else {
    slot.innerHTML = `
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-level">${card.label}</div>
    `;
  }
}

// =========================================
//  カード選択
// =========================================
function selectCard(cardId) {
  if (gameState.turnPhase !== 'select') return;
  const me = gameState[myRole];
  if (!me?.hand?.includes(cardId) || me.ready) return;
  mySelectedCard = cardId;
  renderMyHand(me.hand);
  renderCardDisplay('my-card-display', mySelectedCard);
  $('commentary').textContent = '✅ カードを出しました！相手を待っています...';

  // ✅ CPU対戦：ローカル更新 + CPU自動選択
  if (isVsComputer) {
    gameState.player1.selectedCard = cardId;
    gameState.player1.ready = true;
    setTimeout(() => {
      const cpuCard = computerSelectCard();
      gameState.player2.selectedCard = cpuCard;
      gameState.player2.ready = true;
      checkTurnResult(); // 両者揃ったので判定へ
    }, 800);
    return;
  }

  // オンライン対戦：Firebase更新
  update(ref(db), {
    [`rooms/${roomId}/${myRole}/selectedCard`]: cardId,
    [`rooms/${roomId}/${myRole}/ready`]:        true,
  });
}

// =========================================
//  ターン判定
// =========================================
function checkTurnResult() {
  if (!gameState) return;
  const { turnPhase, player1, player2 } = gameState;
  if (!player1 || !player2) return;
  if (player1.ready && player2.ready && turnPhase === 'select' && !countdownActive) {
    countdownActive = true;
    startCountdown(() => {
      if (myRole === 'player1') processRound();
    });
  }
  if (turnPhase === 'reveal') {
    countdownActive = false;
    showRoundResult();
  }
  if (turnPhase === 'end') {
    countdownActive = false;
    showEndScreen();
  }
}

// =========================================
//  カウントダウン
// =========================================
function startCountdown(callback) {
  const overlay = $('countdown-overlay');
  const numEl   = $('countdown-number');
  overlay.classList.remove('hidden');
  const steps = ['3', '2', '1', '⚡'];
  let i = 0;
  function tick() {
    numEl.classList.remove('count-anim');
    void numEl.offsetWidth;
    numEl.textContent = steps[i];
    numEl.classList.add('count-anim');
    i++;
    if (i < steps.length) {
      setTimeout(tick, 750);
    } else {
      setTimeout(() => {
        overlay.classList.add('hidden');
        callback();
      }, 600);
    }
  }
  tick();
}

// =========================================
//  ラウンド処理
// =========================================
async function processRound() {
  const { player1, player2, scores, turn, yellowTarget } = gameState;
  const c1 = player1.selectedCard;
  const c2 = player2.selectedCard;
  const result    = judgeRound(c1, c2, yellowTarget || null);
  const newScores = { ...scores };
  if (result === 'player1') newScores.player1 = (newScores.player1||0) + 1;
  if (result === 'player2') newScores.player2 = (newScores.player2||0) + 1;
  const newHand1 = (player1.hand||[]).filter(id => id !== c1);
  const newHand2 = (player2.hand||[]).filter(id => id !== c2);
  const discard1 = [...(player1.discard||[]), c1];
  const discard2 = [...(player2.discard||[]), c2];
  const nextTurn = (turn||1) + 1;
  const isEnd    = nextTurn > 10;

  // ✅ CPU対戦：Firebaseを使わずローカル更新
  if (isVsComputer) {
    gameState.turnPhase       = 'reveal';
    gameState.lastResult      = { c1, c2, result };
    gameState.scores          = newScores;
    gameState.player1.hand    = newHand1;
    gameState.player2.hand    = newHand2;
    gameState.player1.discard = discard1;
    gameState.player2.discard = discard2;
    gameState.yellowTarget    = null;
    renderGame();
    showRoundResult();
    setTimeout(() => {
      if (isEnd) {
        gameState.turnPhase = 'end';
        showEndScreen();
      } else {
        gameState.turn                 = nextTurn;
        gameState.turnPhase            = 'select';
        gameState.player1.ready        = false;
        gameState.player2.ready        = false;
        gameState.player1.selectedCard = null;
        gameState.player2.selectedCard = null;
        mySelectedCard  = null;
        countdownActive = false; // ✅ 次のターンのカウントダウンのためリセット
        renderGame();
      }
    }, 4000);
    return;
  }

  // オンライン対戦：Firebase更新（既存処理）
  await update(ref(db), {
    [`rooms/${roomId}/turnPhase`]:       'reveal',
    [`rooms/${roomId}/lastResult`]:      { c1, c2, result },
    [`rooms/${roomId}/scores`]:          newScores,
    [`rooms/${roomId}/player1/hand`]:    newHand1,
    [`rooms/${roomId}/player2/hand`]:    newHand2,
    [`rooms/${roomId}/player1/discard`]: discard1,
    [`rooms/${roomId}/player2/discard`]: discard2,
    [`rooms/${roomId}/yellowTarget`]:    null,
  });
  setTimeout(async () => {
    if (isEnd) {
      await update(ref(db), {
        [`rooms/${roomId}/turnPhase`]:     'end',
        [`rooms/${roomId}/turn`]:          nextTurn,
        [`rooms/${roomId}/player1/ready`]: false,
        [`rooms/${roomId}/player2/ready`]: false,
      });
    } else {
      await update(ref(db), {
        [`rooms/${roomId}/turn`]:                 nextTurn,
        [`rooms/${roomId}/turnPhase`]:            'select',
        [`rooms/${roomId}/player1/ready`]:        false,
        [`rooms/${roomId}/player2/ready`]:        false,
        [`rooms/${roomId}/player1/selectedCard`]: null,
        [`rooms/${roomId}/player2/selectedCard`]: null,
      });
      mySelectedCard = null;
    }
  }, 4000);
}

// =========================================
//  ラウンド結果表示
// =========================================
function showRoundResult() {
  const lr = gameState.lastResult;
  if (!lr) return;
  const { c1, c2, result } = lr;
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';
  const myCard  = myRole === 'player1' ? c1 : c2;
  const oppCard = myRole === 'player1' ? c2 : c1;
  renderCardDisplay('my-card-display',  myCard);
  renderCardDisplay('opp-card-display', oppCard);
  $('commentary').textContent = getCommentary(result, myRole, c1, c2);
  const mc = CARDS[myCard], oc = CARDS[oppCard];
  const isDraw = result === 'draw' || result === 'draw_yellow';
  const isWin  = result === myRole;
  $('result-icon').textContent = isDraw ? '🤝' : isWin ? '🎉' : '😢';
  $('result-text').textContent = isDraw ? '引き分け' : isWin ? '勝ち！ +1点' : '負け...';
  $('result-cards').innerHTML = `
    <div class="card ${mc?.type} img-card" style="width:60px;height:84px">
      ${mc?.image
        ? `<img src="${mc.image}" alt="${mc?.name}" class="card-img-full" />`
        : `<div style="font-size:0.65rem;padding:4px">${mc?.icon}<br>${mc?.name}<br>${mc?.label}</div>`
      }
    </div>
    <span class="vs-small">VS</span>
    <div class="card ${oc?.type} img-card" style="width:60px;height:84px">
      ${oc?.image
        ? `<img src="${oc.image}" alt="${oc?.name}" class="card-img-full" />`
        : `<div style="font-size:0.65rem;padding:4px">${oc?.icon}<br>${oc?.name}<br>${oc?.label}</div>`
      }
    </div>
  `;
  $('result-score').textContent =
    `${gameState.scores[myRole]||0} - ${gameState.scores[oppRole]||0}`;
  const modal = $('result-modal');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('hidden'), 3800);
}

// =========================================
//  終了画面
// =========================================
function showEndScreen() {
  if (!gameState) return;
  cleanupListeners();
  showScreen('screen-end');
  const oppRole  = myRole === 'player1' ? 'player2' : 'player1';
  const myScore  = gameState.scores[myRole]  || 0;
  const oppScore = gameState.scores[oppRole] || 0;
  $('final-score-me').textContent  = myScore;
  $('final-score-opp').textContent = oppScore;
  $('btn-restart').classList.remove('hidden');
  $('end-result-image').classList.add('hidden');
  if (myScore > oppScore) {
    $('end-result-img').src = 'images/win.webp';
    $('end-result-image').classList.remove('hidden');
    $('end-icon').textContent  = '🏆';
    $('end-title').textContent = 'あなたの勝利！';
    showFinalMsg('🎊 おめでとう！完璧な試合でした！', 'win');
  } else if (myScore < oppScore) {
    $('end-result-img').src = 'images/lose.webp';
    $('end-result-image').classList.remove('hidden');
    $('end-icon').textContent  = '😢';
    $('end-title').textContent = '惜しくも敗北...';
    showFinalMsg('なんで負けたか明日までに考えといてください！', 'lose');
  } else {
    $('end-icon').textContent  = '⚽';
    $('end-title').textContent = '同点！PK戦へ！';
    startPK();
  }
}
function showFinalMsg(msg, cls) {
  const el = $('end-final-msg');
  el.textContent = msg;
  el.className = `end-final-msg ${cls}`;
  el.classList.remove('hidden');
}

// =========================================
//  PK戦
// =========================================
function startPK() {
  pkState = { round: 0 };
  $('pk-area').classList.remove('hidden');
  $('btn-pk').classList.remove('hidden');
  $('btn-pk').disabled = false;
  addPKLog('PK戦開始！シュートカードの数値で決着！');
  $('btn-pk').onclick = doPK;
}
function doPK() {
  $('btn-pk').disabled = true;
  const p1 = gameState.player1, p2 = gameState.player2;
  const getCards = (discard, type) =>
    (discard||[]).filter(id => CARDS[id]?.type === type)
                 .sort((a,b) => (CARDS[b].level||0) - (CARDS[a].level||0));
  let c1 = getCards(p1.discard,'shoot')[pkState.round];
  let c2 = getCards(p2.discard,'shoot')[pkState.round];
  if (!c1 || !c2) {
    addPKLog('シュートカードなし！ブロックカードで決着！');
    c1 = getCards(p1.discard,'block')[pkState.round];
    c2 = getCards(p2.discard,'block')[pkState.round];
    if (!c1 || !c2) { addPKLog('引き分け！'); showFinalMsg('⚽ 完全引き分け！','draw'); return; }
  }
  const mc  = myRole === 'player1' ? c1 : c2;
  const opc = myRole === 'player1' ? c2 : c1;
  addPKLog(`あなた: ${CARDS[mc]?.icon}${CARDS[mc]?.name}${CARDS[mc]?.label} vs 相手: ${CARDS[opc]?.icon}${CARDS[opc]?.name}${CARDS[opc]?.label}`);
  const l1 = CARDS[c1]?.level||0, l2 = CARDS[c2]?.level||0;
  if (l1 !== l2) {
    const winner = (l1>l2) === (myRole==='player1') ? 'win' : 'lose';
    addPKLog(`→ ${winner==='win'?'あなた':'相手'} が勝利！`);
    finalizePK(winner);
  } else {
    addPKLog('→ 同点！もう1枚で再戦！');
    pkState.round++;
    $('btn-pk').disabled = false;
  }
}
function finalizePK(result) {
  $('btn-pk').classList.add('hidden');
  showFinalMsg(
    result === 'win' ? '🏆 PK戦勝利！最高の戦いでした！' : '😢 PK戦敗北... 次こそ！',
    result
  );
}
function addPKLog(text) {
  const log   = $('pk-log');
  const entry = document.createElement('div');
  entry.className = 'pk-log-entry';
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// =========================================
//  リスタート
// =========================================
$('btn-restart').addEventListener('click', async () => {
  if (!isVsComputer) { // ✅ CPU対戦時はFirebase削除しない
    try { await remove(ref(db, `rooms/${roomId}`)); } catch(e){}
  }
  isVsComputer = false; // ✅ リセット
  cleanupListeners();
  myRole = roomId = gameState = mySelectedCard = null;
  pkState = { round: 0 };
  countdownActive = false;
  $('countdown-overlay').classList.add('hidden');
  $('pk-area').classList.add('hidden');
  $('pk-log').innerHTML = '';
  $('end-final-msg').classList.add('hidden');
  $('btn-restart').classList.add('hidden');
  $('btn-pk').classList.remove('hidden');
  $('btn-pk').disabled = false;
  $('end-result-image').classList.add('hidden');
  renderAccountScreen();
  showScreen('screen-account');
});

// =========================================
//  起動
// =========================================
async function initApp() {
  await initAccounts();
  listenAccounts();
  showScreen('screen-account');
}
initApp();

// =========================================
//  スタンプ機能
// =========================================
const STAMPS = [
  { id: '1', image: 'images/stamps/stamp_1.webp', label: '1' },
  { id: '2', image: 'images/stamps/stamp_2.webp', label: '2' },
];
function setupStampListener() {
  const stampRef = ref(db, `rooms/${roomId}/stamp`);
  const unsub = onValue(stampRef, snap => {
    if (!snap.exists()) return;
    const { from, image } = snap.val();
    if (from !== myRole) showStampAnimation(image);
  });
  unsubscribers.push(() => off(stampRef));
}
async function sendStamp(stampId) {
  const stamp = STAMPS.find(s => s.id === stampId);
  if (!stamp) return;
  await update(ref(db), {
    [`rooms/${roomId}/stamp`]: {
      from:      myRole,
      image:     stamp.image,
      timestamp: Date.now(),
    }
  });
}
function showStampAnimation(imagePath) {
  const el = document.createElement('div');
  el.className = 'stamp-popup';
  el.innerHTML = `<img src="${imagePath}" alt="スタンプ" class="stamp-img" />`;
  document.querySelector('.game-layout').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
$('btn-stamp-toggle').addEventListener('click', () => {
  $('stamp-panel').classList.toggle('hidden');
});
document.querySelectorAll('.stamp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    sendStamp(btn.dataset.stampId);
    $('stamp-panel').classList.add('hidden');
  });
});

// =========================================
//  CPU AIロジック ✅ 追加
// =========================================
function computerSelectCard() {
  const hand = gameState.player2.hand;
  const randomIndex = Math.floor(Math.random() * hand.length);
  return hand[randomIndex];
}
