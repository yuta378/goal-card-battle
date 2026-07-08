import { db } from './firebase-config.js';
import {
  ref, set, get, update, onValue, push, remove, off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ===== カード定義 =====
const CARDS = {
  SHOOT_1: { id: 'SHOOT_1', type: 'shoot', level: 1, icon: '⚽', name: 'シュート', label: 'Lv.1' },
  SHOOT_2: { id: 'SHOOT_2', type: 'shoot', level: 2, icon: '⚽', name: 'シュート', label: 'Lv.2' },
  SHOOT_3: { id: 'SHOOT_3', type: 'shoot', level: 3, icon: '⚽', name: 'シュート', label: 'Lv.3' },
  SHOOT_4: { id: 'SHOOT_4', type: 'shoot', level: 4, icon: '⚽', name: 'シュート', label: 'Lv.4' },
  BLOCK_1: { id: 'BLOCK_1', type: 'block', level: 1, icon: '🛡️', name: 'ブロック', label: 'Lv.1' },
  BLOCK_2: { id: 'BLOCK_2', type: 'block', level: 2, icon: '🛡️', name: 'ブロック', label: 'Lv.2' },
  BLOCK_3: { id: 'BLOCK_3', type: 'block', level: 3, icon: '🛡️', name: 'ブロック', label: 'Lv.3' },
  BLOCK_4: { id: 'BLOCK_4', type: 'block', level: 4, icon: '🛡️', name: 'ブロック', label: 'Lv.4' },
  DRIBBLE_A: { id: 'DRIBBLE_A', type: 'dribble', level: null, icon: '🌀', name: 'ドリブル', label: '' },
  DRIBBLE_B: { id: 'DRIBBLE_B', type: 'dribble', level: null, icon: '🌀', name: 'ドリブル', label: '' },
};

const INITIAL_DECK = Object.keys(CARDS);

// ===== 状態 =====
let myRole = null;       // 'player1' or 'player2'
let roomId = null;
let gameState = null;
let mySelectedCard = null;
let unsubscribers = [];
let yellowUsed = false;
let redUsed = false;
let waitingForOpponent = false;

// ===== DOM参照 =====
const $ = (id) => document.getElementById(id);

// ===== ユーティリティ =====
function genRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 三すくみ + 数値比較でターン勝敗を返す
// returns: 'player1' | 'player2' | 'draw'
function judgeRound(c1id, c2id, yellowTarget) {
  const c1 = CARDS[c1id];
  const c2 = CARDS[c2id];

  // イエローカード処理
  if (yellowTarget === 'player2') {
    // player2のカードを無効化 → player1勝ち（得点なし扱いではなく引き分け）
    return 'draw_yellow';
  }
  if (yellowTarget === 'player1') {
    return 'draw_yellow';
  }

  if (c1.type === c2.type) {
    // 同種カード
    if (c1.type === 'shoot') {
      if (c1.level > c2.level) return 'player1';
      if (c1.level < c2.level) return 'player2';
      return 'draw';
    }
    return 'draw'; // block同士, dribble同士
  }

  // 三すくみ: shoot > dribble, dribble > block, block > shoot
  const wins = {
    shoot:   'dribble',
    dribble: 'block',
    block:   'shoot',
  };
  if (wins[c1.type] === c2.type) return 'player1';
  if (wins[c2.type] === c1.type) return 'player2';
  return 'draw';
}

function getCommentary(result, myRole, c1id, c2id) {
  const c1 = CARDS[c1id];
  const c2 = CARDS[c2id];
  const winner = result === myRole ? 'あなた' : result === 'draw' ? null : '相手';

  if (result === 'draw_yellow') return '🟡 イエローカード発動！このターンは得点なし！';
  if (result === 'draw') return '🤝 引き分け！ 得点なし';

  // 実況パターン
  const myCard = myRole === 'player1' ? c1 : c2;
  const oppCard = myRole === 'player1' ? c2 : c1;

  if (result === myRole) {
    if (myCard.type === 'shoot' && oppCard.type === 'dribble') return '⚽ ゴーール！ シュートが決まった！';
    if (myCard.type === 'dribble' && oppCard.type === 'block') return '🌀 抜いた！チャンス！ あなたの得点！';
    if (myCard.type === 'block' && oppCard.type === 'shoot') return '🛡️ ナイスセーブ！ 守り切った！';
    if (myCard.type === 'shoot') return `⚽ シュート(${myCard.level}) が勝った！ゴール！`;
    return `${myCard.icon} あなたの勝ち！`;
  } else {
    if (oppCard.type === 'shoot' && myCard.type === 'dribble') return '⚽ 相手ゴーール！ シュートを止められなかった！';
    if (oppCard.type === 'dribble' && myCard.type === 'block') return '🌀 かわされた！ 相手の得点！';
    if (oppCard.type === 'block' && myCard.type === 'shoot') return '🛡️ 相手ナイスセーブ！ シュートが止められた！';
    if (oppCard.type === 'shoot') return `⚽ 相手シュート(${oppCard.level}) が決まった！`;
    return `${oppCard.icon} 相手の勝ち！`;
  }
}

// ===== 画面切替 =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = $(id);
  s.classList.add('active');
  s.style.display = 'flex';
}

// ===== ロビー処理 =====
$('btn-create').addEventListener('click', async () => {
  roomId = genRoomId();
  myRole = 'player1';

  const roomRef = ref(db, `rooms/${roomId}`);
  await set(roomRef, {
    status: 'waiting',
    player1: { hand: INITIAL_DECK, score: 0, ready: false, yellowUsed: false, redUsed: false },
    player2: null,
    turn: 1,
    turnPhase: 'select',
    scores: { player1: 0, player2: 0 },
    history: [],
  });

  $('display-room-id').textContent = roomId;
  $('room-info').classList.remove('hidden');
  $('btn-create').disabled = true;

  // 相手参加を待つ
  const unsub = onValue(ref(db, `rooms/${roomId}/status`), (snap) => {
    if (snap.val() === 'playing') {
      off(ref(db, `rooms/${roomId}/status`));
      startGame();
    }
  });
  unsubscribers.push(unsub);
});

$('btn-join').addEventListener('click', async () => {
  const inputId = $('input-room-id').value.trim().toUpperCase();
  if (!inputId || inputId.length < 4) {
    showError('ルームIDを入力してください');
    return;
  }

  const roomRef = ref(db, `rooms/${inputId}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    showError('ルームが見つかりません');
    return;
  }
  const data = snap.val();
  if (data.status !== 'waiting') {
    showError('このルームはすでに開始または終了しています');
    return;
  }

  roomId = inputId;
  myRole = 'player2';

  await update(ref(db, `rooms/${roomId}`), {
    'player2/hand': INITIAL_DECK,
    'player2/score': 0,
    'player2/ready': false,
    'player2/yellowUsed': false,
    'player2/redUsed': false,
    'status': 'playing',
  });

  startGame();
});

function showError(msg) {
  const el = $('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ===== ゲーム開始 =====
function startGame() {
  yellowUsed = false;
  redUsed = false;
  mySelectedCard = null;
  showScreen('screen-game');
  renderOptionButtons();

  // Firebase購読
  const gameRef = ref(db, `rooms/${roomId}`);
  const unsub = onValue(gameRef, (snap) => {
    if (!snap.exists()) return;
    gameState = snap.val();
    renderGame();
    checkTurnResult();
  });
  unsubscribers.push(unsub);
}

// ===== ゲーム描画 =====
function renderGame() {
  if (!gameState) return;

  const me = gameState[myRole];
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';
  const opp = gameState[oppRole];

  if (!me || !opp) return;

  // スコア
  $('score-me').textContent = gameState.scores[myRole] || 0;
  $('score-opp').textContent = gameState.scores[oppRole] || 0;
  $('turn-num').textContent = gameState.turn || 1;

  // 自分の手札
  const myHand = me.hand || [];
  renderMyHand(myHand);

  // 相手の手札（枚数のみ表示）
  const oppHand = opp.hand || [];
  renderOppHand(oppHand);

  $('hand-count').textContent = `(${myHand.length}枚)`;

  // フェーズ表示
  const phase = gameState.turnPhase;
  if (phase === 'select') {
    $('commentary').textContent = 'カードを選んで出してください！';
    $('opp-card-display').className = 'card card-back';
    $('opp-card-display').innerHTML = '?';
    $('my-card-display').className = 'card card-placeholder';
    $('my-card-display').textContent = '選択中...';
  }
}

function renderMyHand(hand) {
  const container = $('my-hand');
  container.innerHTML = '';

  hand.forEach(cardId => {
    const card = CARDS[cardId];
    if (!card) return;

    const el = document.createElement('div');
    el.className = `hand-card ${card.type}`;
    if (cardId === mySelectedCard) el.classList.add('selected');
    if (gameState.turnPhase !== 'select') el.classList.add('disabled');

    el.innerHTML = `
      <div class="hc-icon">${card.icon}</div>
      <div class="hc-name">${card.name}</div>
      <div class="hc-level">${card.label}</div>
    `;

    el.addEventListener('click', () => selectCard(cardId));
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

function renderCardDisplay(slotId, cardId, faceUp = true) {
  const slot = $(slotId);
  if (!faceUp) {
    slot.className = 'card card-back';
    slot.innerHTML = '?';
    return;
  }
  const card = CARDS[cardId];
  if (!card) return;
  slot.className = `card ${card.type}`;
  slot.innerHTML = `
    <div class="card-icon">${card.icon}</div>
    <div class="card-name">${card.name}</div>
    <div class="card-level">${card.label}</div>
  `;
}

// ===== カード選択・提出 =====
function selectCard(cardId) {
  if (gameState.turnPhase !== 'select') return;
  const me = gameState[myRole];
  if (!me || !me.hand || !me.hand.includes(cardId)) return;

  mySelectedCard = cardId;
  renderMyHand(me.hand);

  // Firebaseに提出
  submitCard(cardId);
}

async function submitCard(cardId) {
  const updates = {};
  updates[`rooms/${roomId}/${myRole}/selectedCard`] = cardId;
  updates[`rooms/${roomId}/${myRole}/ready`] = true;

  await update(ref(db), updates);
}

// ===== ターン判定 =====
function checkTurnResult() {
  if (!gameState) return;
  const phase = gameState.turnPhase;

  const p1 = gameState.player1;
  const p2 = gameState.player2;

  if (!p1 || !p2) return;

  // 両者ready → 判定（player1のみが処理を担う、または先着処理）
  if (p1.ready && p2.ready && phase === 'select') {
    // ホスト（player1）が結果を計算してFirebaseに書き込む
    if (myRole === 'player1') {
      processRound();
    }
  }

  // reveal フェーズ → モーダル表示
  if (phase === 'reveal') {
    showRoundResult();
  }

  // 終了チェック
  if (phase === 'end') {
    showEndScreen();
  }
}

async function processRound() {
  const p1 = gameState.player1;
  const p2 = gameState.player2;
  const c1 = p1.selectedCard;
  const c2 = p2.selectedCard;

  // イエローカード判定
  const yellowTarget = gameState.yellowTarget || null;
  const result = judgeRound(c1, c2, yellowTarget);

  const scores = { ...gameState.scores };
  if (result === 'player1') scores.player1 = (scores.player1 || 0) + 1;
  if (result === 'player2') scores.player2 = (scores.player2 || 0) + 1;

  // 手札から使ったカードを除去
  const newHand1 = (p1.hand || []).filter(id => id !== c1);
  const newHand2 = (p2.hand || []).filter(id => id !== c2);

  // 捨て札に追加
  const discard1 = [...(p1.discard || []), c1];
  const discard2 = [...(p2.discard || []), c2];

  const nextTurn = (gameState.turn || 1) + 1;
  const isEnd = nextTurn > 10;

  const updates = {
    [`rooms/${roomId}/turnPhase`]: 'reveal',
    [`rooms/${roomId}/lastResult`]: { c1, c2, result },
    [`rooms/${roomId}/scores`]: scores,
    [`rooms/${roomId}/player1/hand`]: newHand1,
    [`rooms/${roomId}/player2/hand`]: newHand2,
    [`rooms/${roomId}/player1/discard`]: discard1,
    [`rooms/${roomId}/player2/discard`]: discard2,
    [`rooms/${roomId}/yellowTarget`]: null,
  };

  await update(ref(db), updates);

  // 自動で次のターンへ（3秒後）
  setTimeout(async () => {
    if (isEnd) {
      // 終了
      const finalUpdates = {
        [`rooms/${roomId}/turnPhase`]: 'end',
        [`rooms/${roomId}/turn`]: nextTurn,
        [`rooms/${roomId}/player1/ready`]: false,
        [`rooms/${roomId}/player2/ready`]: false,
      };
      await update(ref(db), finalUpdates);
    } else {
      const nextUpdates = {
        [`rooms/${roomId}/turn`]: nextTurn,
        [`rooms/${roomId}/turnPhase`]: 'select',
        [`rooms/${roomId}/player1/ready`]: false,
        [`rooms/${roomId}/player2/ready`]: false,
        [`rooms/${roomId}/player1/selectedCard`]: null,
        [`rooms/${roomId}/player2/selectedCard`]: null,
      };
      await update(ref(db), nextUpdates);
      mySelectedCard = null;
    }
  }, 3000);
}

function showRoundResult() {
  const lr = gameState.lastResult;
  if (!lr) return;

  const { c1, c2, result } = lr;
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';

  const myCard = myRole === 'player1' ? c1 : c2;
  const oppCard = myRole === 'player1' ? c2 : c1;

  renderCardDisplay('my-card-display', myCard, true);
  renderCardDisplay('opp-card-display', oppCard, true);

  const commentary = getCommentary(result, myRole, c1, c2);
  $('commentary').textContent = commentary;

  // モーダル
  const modal = $('result-modal');
  const myCardData = CARDS[myCard];
  const oppCardData = CARDS[oppCard];

  let icon, text;
  if (result === 'draw' || result === 'draw_yellow') {
    icon = '🤝'; text = '引き分け';
  } else if (result === myRole) {
    icon = '🎉'; text = '勝ち！ +1点';
  } else {
    icon = '😢'; text = '負け...';
  }

  $('result-icon').textContent = icon;
  $('result-text').textContent = text;
  $('result-cards').innerHTML = `
    <div class="card ${myCardData?.type}" style="width:60px;height:84px;font-size:0.65rem">
      <div>${myCardData?.icon}</div><div>${myCardData?.name}</div><div>${myCardData?.label}</div>
    </div>
    <span class="vs-small">VS</span>
    <div class="card ${oppCardData?.type}" style="width:60px;height:84px;font-size:0.65rem">
      <div>${oppCardData?.icon}</div><div>${oppCardData?.name}</div><div>${oppCardData?.label}</div>
    </div>
  `;
  $('result-score').textContent = `${gameState.scores[myRole] || 0} - ${gameState.scores[oppRole] || 0}`;

  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('hidden'), 2800);
}

// ===== オプションカード =====
function renderOptionButtons() {
  // ここでオプションエリアのボタンを設定
  // （デフォルト実装: 基本ルールのみ、オプションは非表示）
  $('option-area').classList.add('hidden');
}

// ===== 終了画面 =====
function showEndScreen() {
  if (!gameState) return;
  showScreen('screen-end');

  const scores = gameState.scores || {};
  const myScore = scores[myRole] || 0;
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';
  const oppScore = scores[oppRole] || 0;

  $('final-score-me').textContent = myScore;
  $('final-score-opp').textContent = oppScore;

  if (myScore > oppScore) {
    $('end-icon').textContent = '🏆';
    $('end-title').textContent = 'あなたの勝利！';
    showFinalMsg('🎊 おめでとう！完璧な試合でした！', 'win');
    $('btn-restart').classList.remove('hidden');
  } else if (myScore < oppScore) {
    $('end-icon').textContent = '😢';
    $('end-title').textContent = '惜しくも敗北...';
    showFinalMsg('次は勝てる！リベンジしよう！', 'lose');
    $('btn-restart').classList.remove('hidden');
  } else {
    // 同点 → PK戦
    $('end-icon').textContent = '⚽';
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

// ===== PK戦 =====
let pkState = { round: 0 };

function startPK() {
  $('pk-area').classList.remove('hidden');
  $('btn-pk').addEventListener('click', doPK);
  pkState.round = 0;
  addPKLog('PK戦開始！シュートカードを高い順に出します');
}

async function doPK() {
  $('btn-pk').disabled = true;
  const p1 = gameState.player1;
  const p2 = gameState.player2;

  // 捨て札からシュートカードを取得（levelで降順）
  const getShootCards = (discard) =>
    (discard || [])
      .filter(id => CARDS[id]?.type === 'shoot')
      .sort((a, b) => (CARDS[b].level || 0) - (CARDS[a].level || 0));

  const shoots1 = getShootCards(p1.discard);
  const shoots2 = getShootCards(p2.discard);

  const idx = pkState.round;
  const c1 = shoots1[idx];
  const c2 = shoots2[idx];

  if (!c1 || !c2) {
    // ブロックカードで代替
    addPKLog('シュートカードがなくなった！ブロックカードで決着！');
    const blocks1 = (p1.discard || []).filter(id => CARDS[id]?.type === 'block').sort((a,b)=>(CARDS[b].level||0)-(CARDS[a].level||0));
    const blocks2 = (p2.discard || []).filter(id => CARDS[id]?.type === 'block').sort((a,b)=>(CARDS[b].level||0)-(CARDS[a].level||0));
    const bc1 = blocks1[idx];
    const bc2 = blocks2[idx];
    if (!bc1 || !bc2) { addPKLog('カードがなくなりました。引き分け！'); showFinalMsg('⚽ 完全引き分け！', 'draw'); return; }
    resolvePK(bc1, bc2);
    return;
  }

  resolvePK(c1, c2);
}

function resolvePK(c1, c2) {
  const card1 = CARDS[c1];
  const card2 = CARDS[c2];
  const myC = myRole === 'player1' ? c1 : c2;
  const oppC = myRole === 'player1' ? c2 : c1;

  addPKLog(`あなた: ${CARDS[myC].icon}${CARDS[myC].name}${CARDS[myC].label} vs 相手: ${CARDS[oppC].icon}${CARDS[oppC].name}${CARDS[oppC].label}`);

  if (card1.level > card2.level) {
    const winner = myRole === 'player1' ? 'あなた' : '相手';
    addPKLog(`→ ${winner} が勝利！`);
    finalizePK(myRole === 'player1' ? 'win' : 'lose');
  } else if (card1.level < card2.level) {
    const winner = myRole === 'player2' ? 'あなた' : '相手';
    addPKLog(`→ ${winner} が勝利！`);
    finalizePK(myRole === 'player2' ? 'win' : 'lose');
  } else {
    addPKLog('→ 同点！もう1枚で再戦！');
    pkState.round++;
    $('btn-pk').disabled = false;
  }
}

function finalizePK(result) {
  $('btn-pk').classList.add('hidden');
  if (result === 'win') {
    showFinalMsg('🏆 PK戦勝利！最高の戦いでした！', 'win');
  } else {
    showFinalMsg('😢 PK戦敗北... 次こそ！', 'lose');
  }
  $('btn-restart').classList.remove('hidden');
}

function addPKLog(text) {
  const log = $('pk-log');
  const entry = document.createElement('div');
  entry.className = 'pk-log-entry';
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ===== リスタート =====
$('btn-restart').addEventListener('click', async () => {
  // ルームをクリア
  await remove(ref(db, `rooms/${roomId}`));
  unsubscribers.forEach(fn => typeof fn === 'function' && fn());
  unsubscribers = [];
  location.reload();
});