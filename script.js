/* ============================================================
   421 — Complete Game Logic (corrected)
   ============================================================ */

// ===== STATE =====
let mode = null;
let players = [
  { name: 'Player 1', tokens: 21 },
  { name: 'Computer', tokens: 21 }
];
let roundNum = 0;
let currentPlayer = 0;
let turnState = null;
let roundResults = [null, null];
let resolveStep = 'compare';
let isProcessing = false;

// ===== DOM REFS =====
const $ = id => document.getElementById(id);

// Fonction pour obtenir les éléments dés dynamiquement (plus robuste)
function getDiceEls() {
  const diceRow = $('dice-row');
  if (!diceRow) return [];
  return Array.from(diceRow.children).slice(0, 3);
}

// ===== COMBINATION EVALUATION (corrected according to rules) =====
// Categories (higher = stronger when scores equal):
// 100 = 421
//  50 = Fiche
//  40 = Tierce
//  30 = Suite
//  10 = Nénette
//   0 = Simple
function evaluate(dice) {
  const s = [...dice].sort((a, b) => a - b); // ascending

  const is421     = s[0] === 1 && s[1] === 2 && s[2] === 4;
  const isNenette = s[0] === 1 && s[1] === 2 && s[2] === 2;
  const isFiche   = s[0] === 1 && s[1] === 1 && s[2] !== 1;
  const isTriple  = s[0] === s[1] && s[1] === s[2];
  const isSuite   = (s[1] - s[0] === 1 && s[2] - s[1] === 1);

  let type, score, category;

  if (is421) {
    type = '421';
    score = 8;          // valeur nominale ; le paiement réel est "tous sauf 1"
    category = 100;
  } else if (isFiche) {
    type = 'Fiche';
    score = s[2];
    category = 50;
  } else if (isTriple) {
    type = 'Tierce';
    score = (s[0] === 1) ? 7 : s[0];
    category = 40;
  } else if (isSuite) {
    type = 'Suite';
    score = 2;
    category = 30;
  } else if (isNenette) {
    type = 'Nénette';
    score = 4;
    category = 10;      // perd toujours face à une autre figure de score 4
  } else {
    type = null;        // combinaison simple
    score = 1;
    category = 0;
  }

  return {
    dice: [...dice],
    sorted: s,
    type,
    score,
    category,
    label: type || s.join('-')
  };
}

/**
 * Compare deux combinaisons.
 * Retourne >0 si a gagne, <0 si b gagne, 0 si égalité parfaite.
 */
function compareCombos(a, b) {
  // 1. Catégorie (421 > Fiche > Tierce > Suite > Nénette > Simple)
  if (a.category !== b.category) {
    return a.category > b.category ? 1 : -1;
  }

  // 2. Score
  if (a.score !== b.score) {
    return a.score > b.score ? 1 : -1;
  }

  // 3. Même catégorie + même score → compare les dés (ordre décroissant)
  const sa = [...a.sorted].reverse();
  const sb = [...b.sorted].reverse();
  for (let i = 0; i < 3; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? 1 : -1;
  }

  // Exactement la même combinaison
  return 0;
}

function comboLabel(c) {
  return c.label;
}

function comboScoreLabel(c) {
  if (c.type === '421') return 'tous sauf 1';
  return `${c.score} jeton${c.score !== 1 ? 's' : ''}`;
}

// ===== DICE RENDERING =====
const pipMap = {
  1: ['mc'],
  2: ['tr', 'bl'],
  3: ['tr', 'mc', 'bl'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'ml', 'bl', 'tr', 'mr', 'br']
};

function renderDie(el, value) {
  const face = el.querySelector('.die-face');
  face.innerHTML = '';
  if (value == null) return;
  pipMap[value].forEach(pos => {
    const d = document.createElement('div');
    d.className = `pip pip-${pos}`;
    face.appendChild(d);
  });
}

function renderAllDice(values) {
  const dice = getDiceEls();
  values.forEach((v, i) => {
    if (dice[i]) renderDie(dice[i], v);
  });
}

function setDieState(index, state) {
  const dice = getDiceEls();
  if (!dice[index]) return;
  dice[index].classList.remove('selected', 'locked', 'no-tap', 'rolling');
  if (state) dice[index].classList.add(state);
}

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function showModal(id) { $(id).classList.add('active'); }
function hideModal(id) { $(id).classList.remove('active'); }

// ===== LOGGING =====
function addLog(html) {
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = html;
  const log = $('log-content');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
function clearLog() { $('log-content').innerHTML = ''; }

// ===== UI UPDATES =====
function updateHeader() {
  $('name-p1').textContent = players[0].name;
  $('name-p2').textContent = players[1].name;
  $('tokens-p1').textContent = players[0].tokens;
  $('tokens-p2').textContent = players[1].tokens;
  $('round-badge').textContent = `Round ${roundNum}`;
}

function updateTurnIndicator() {
  $('turn-indicator').textContent = `${players[currentPlayer].name}'s Turn`;
}

function updateRollInfo() {
  if (!turnState) { $('roll-info').textContent = ''; return; }
  const kept = turnState.kept.filter(k => k);
  const n = kept.length;
  if (turnState.rolls === 0) {
    $('roll-info').textContent = '';
  } else if (n === 0) {
    $('roll-info').textContent = 'Tap dice to keep them';
  } else {
    $('roll-info').textContent = `${n} dice kept — tap to toggle`;
  }
}

function showRollButton(label) {
  const btn = $('btn-roll');
  btn.textContent = label || 'Roll Dice';
  btn.style.display = '';
}

function hideControls() {
  $('btn-roll').style.display = 'none';
  hideStopButton();
}

function showStopButton() {
  let btn = $('btn-stop');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-stop';
    btn.className = 'btn btn-ghost btn-small';
    btn.textContent = 'Stop here';
    btn.addEventListener('click', () => {
      if (turnState && !turnState.finished && turnState.rolls > 0) {
        finishTurn();
      }
    });
    $('controls').appendChild(btn);
  }
  btn.style.display = '';
}

function hideStopButton() {
  const btn = $('btn-stop');
  if (btn) btn.style.display = 'none';
}

// ===== GAME FLOW =====
function startGame(m) {
  mode = m;
  players = [
    { name: 'Player 1', tokens: 21 },
    { name: m === 'pvc' ? 'Computer' : 'Player 2', tokens: 21 }
  ];
  roundNum = 0;
  clearLog();
  showScreen('game');
  updateHeader();
  nextRound();
}

function nextRound() {
  roundNum++;
  roundResults = [null, null];
  resolveStep = 'compare';
  updateHeader();
  clearLog();
  addLog(`<strong>Round ${roundNum}</strong>`);
  startTurn(0);
}

function startTurn(pIdx) {
  currentPlayer = pIdx;
  turnState = {
    values: [null, null, null],
    kept: [false, false, false],
    rolls: 0,
    maxRolls: 3,
    finished: false
  };
  updateTurnIndicator();
  renderAllDice([null, null, null]);
  const dice = getDiceEls();
  dice.forEach((_, i) => setDieState(i, null));
  updateRollInfo();
  hideControls();

  if (mode === 'pvc' && pIdx === 1) {
    showScreen('game');
    setTimeout(() => aiTurn(), 600);
  } else {
    showScreen('game');
    showRollButton('Roll Dice');
  }
}

// ===== PLAYER ACTIONS =====
function onRollClick() {
  if (isProcessing || !turnState || turnState.finished) return;
  performRoll();
}

function onDieClick(index) {
  if (isProcessing || !turnState || turnState.finished) return;
  if (turnState.rolls === 0) return;
  turnState.kept[index] = !turnState.kept[index];
  setDieState(index, turnState.kept[index] ? 'selected' : null);
  updateRollInfo();
}

function performRoll() {
  isProcessing = true;
  const dice = getDiceEls();
  const toRoll = turnState.kept.map(k => !k);
  const anyRolling = toRoll.some(r => r);

  if (anyRolling) {
    toRoll.forEach((r, i) => {
      if (r) {
        setDieState(i, 'rolling');
        const intv = setInterval(() => {
          if (dice[i]) renderDie(dice[i], Math.ceil(Math.random() * 6));
        }, 80);
        if (dice[i]) dice[i]._animIntv = intv;
      }
    });
  }

  const delay = anyRolling ? 400 : 50;
  setTimeout(() => {
    toRoll.forEach((r, i) => {
      if (r && dice[i]) {
        clearInterval(dice[i]._animIntv);
        turnState.values[i] = Math.ceil(Math.random() * 6);
        renderDie(dice[i], turnState.values[i]);
        setDieState(i, null);
      }
    });

    turnState.rolls++;
    isProcessing = false;

    // Évaluer la combinaison
    const combo = evaluate(turnState.values);

    // Auto-stop si 421 obtenu
    if (combo.type === '421') {
      finishTurn();
      return;
    }

    if (turnState.rolls >= turnState.maxRolls) {
      finishTurn();
    } else {
      dice.forEach(el => el.classList.remove('no-tap'));
      updateRollInfo();
      const remaining = turnState.maxRolls - turnState.rolls;
      showRollButton(`Roll Again (${remaining} left)`);
      showStopButton();
    }
  }, delay);
}

function finishTurn() {
  turnState.finished = true;
  turnState.kept = [true, true, true];
  const dice = getDiceEls();
  dice.forEach((_, i) => setDieState(i, 'locked'));
  hideControls();
  updateRollInfo();

  const combo = evaluate(turnState.values);
  roundResults[currentPlayer] = { combo, rolls: turnState.rolls };

  const label = comboLabel(combo);
  const scoreLbl = comboScoreLabel(combo);
  addLog(`<strong>${players[currentPlayer].name}</strong> a fait <span class="gold">${label}</span> (${scoreLbl}) en ${turnState.rolls} coup${turnState.rolls > 1 ? 's' : ''}`);

  setTimeout(() => {
    if (roundResults[0] && roundResults[1]) {
      resolveRound();
    } else {
      startTurn(1);
    }
  }, 800);
}

// ===== AI LOGIC =====
function aiTurn() {
  rollAI();
}

function rollAI() {
  const dice = getDiceEls();
  const toRoll = turnState.kept.map(k => !k);
  const anyRolling = toRoll.some(r => r);

  if (anyRolling) {
    toRoll.forEach((r, i) => {
      if (r) {
        setDieState(i, 'rolling');
        const intv = setInterval(() => {
          if (dice[i]) renderDie(dice[i], Math.ceil(Math.random() * 6));
        }, 80);
        if (dice[i]) dice[i]._animIntv = intv;
      }
    });
  }

  const delay = anyRolling ? 500 : 50;
  setTimeout(() => {
    toRoll.forEach((r, i) => {
      if (r && dice[i]) {
        clearInterval(dice[i]._animIntv);
        turnState.values[i] = Math.ceil(Math.random() * 6);
        renderDie(dice[i], turnState.values[i]);
        setDieState(i, null);
      }
    });
    turnState.rolls++;

    const combo = evaluate(turnState.values);

    // Auto-stop on 421 only
    if (combo.type === '421') {
      finishTurn();
      return;
    }

    if (turnState.rolls >= turnState.maxRolls) {
      finishTurn();
      return;
    }

    // AI decision
    const keep = aiDecideKeep(turnState.values);
    turnState.kept = keep;
    dice.forEach((_, i) => setDieState(i, keep[i] ? 'locked' : null));

    $('roll-info').textContent = 'Computer is thinking...';

    setTimeout(() => rollAI(), 700);
  }, delay);
}

function aiDecideKeep(vals) {
  const combo = evaluate(vals);

  // Always stop on 421
  if (combo.type === '421') return [true, true, true];

  // Fiche: keep the two 1s, re-roll the third
  if (combo.type === 'Fiche') {
    return vals.map(v => v === 1);
  }

  // Tierce, Suite, Nénette: keep all
  if (combo.type === 'Tierce' || combo.type === 'Suite' || combo.type === 'Nénette') {
    return [true, true, true];
  }

  // Normal combos — look for useful subsets
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);

  // Two aces: keep them (aiming for Fiche or 421)
  if ((counts[1] || 0) >= 2) {
    return vals.map(v => v === 1);
  }

  // Any other pair: keep the pair (aiming for Tierce)
  const pairs = Object.entries(counts).filter(([, c]) => c >= 2);
  if (pairs.length > 0) {
    const pairVal = parseInt(pairs[0][0]);
    return vals.map(v => v === pairVal);
  }

  // Otherwise keep the highest die
  const maxVal = Math.max(...vals);
  return vals.map(v => v === maxVal);
}

// ===== ROUND RESOLUTION =====
function resolveRound() {
  const c1 = roundResults[0].combo;
  const c2 = roundResults[1].combo;
  const r1 = roundResults[0].rolls;
  const r2 = roundResults[1].rolls;

  showResolver(c1, c2, r1, r2);
  resolveStep = 'compare';

  // Cas spécial : les deux ont une combinaison simple (score 1) → aucun échange
  if (c1.score === 1 && c2.score === 1) {
    $('resolver-result').innerHTML = `Les deux joueurs ont une combinaison simple.<br><span class="gold">Aucun échange de jetons.</span>`;
    $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Continuer</button>';
    $('btn-apply').onclick = () => {
      addLog(`Aucun échange — les deux ont une combinaison simple.`);
      setTimeout(() => nextRound(), 300);
    };
    return;
  }

  const cmp = compareCombos(c1, c2);

  if (cmp !== 0) {
    // Un joueur a une combinaison strictement plus forte
    const winner = cmp > 0 ? 0 : 1;
    const loser = 1 - winner;
    const wCombo = roundResults[winner].combo;
    const payment = computePayment(winner, wCombo);
    showCompareResult(winner, payment, wCombo);
  } else {
    // Combinaisons de force égale (même catégorie + même score + mêmes dés)
    // → on regarde le nombre de coups
    if (r1 !== r2) {
      const winner = r1 < r2 ? 0 : 1; // moins de coups gagne
      const loser = 1 - winner;
      const wCombo = roundResults[winner].combo;
      const payment = computePayment(winner, wCombo);
      showEgaliteResult(winner, loser, payment, r1, r2);
    } else {
      // Égalité parfaite (même combo + même nombre de coups) → on annule l'échange
      // (Rampo supprimé selon demande)
      $('resolver-result').innerHTML = `<span class="gold">Égalité parfaite</span> (même combinaison, même nombre de coups).<br>Aucun échange de jetons.`;
      $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Continuer</button>';
      $('btn-apply').onclick = () => {
        addLog(`Égalité parfaite — aucun échange.`);
        setTimeout(() => nextRound(), 300);
      };
    }
  }
}

/** Calcule le nombre de jetons que le gagnant doit payer */
function computePayment(winnerIdx, combo) {
  if (combo.type === '421') {
    // Règle spéciale : tous les jetons sauf 1
    return Math.max(0, players[winnerIdx].tokens - 1);
  }
  // Sinon le score de la combinaison (borné par les jetons restants)
  return Math.min(combo.score, players[winnerIdx].tokens);
}

// ===== RESOLVER UI =====
function showResolver(c1, c2, r1, r2) {
  showScreen('resolver');
  $('res-name-p1').textContent = players[0].name;
  $('res-name-p2').textContent = players[1].name;

  $('res-dice-p1').innerHTML = c1.sorted.map(v =>
    `<div class="mini-die">${v}</div>`
  ).join('');
  $('res-dice-p2').innerHTML = c2.sorted.map(v =>
    `<div class="mini-die">${v}</div>`
  ).join('');

  $('res-score-p1').innerHTML = `<span class="gold">${comboLabel(c1)}</span> (${comboScoreLabel(c1)})<br><small>${r1} roll${r1>1?'s':''}</small>`;
  $('res-score-p2').innerHTML = `<span class="gold">${comboLabel(c2)}</span> (${comboScoreLabel(c2)})<br><small>${r2} roll${r2>1?'s':''}</small>`;

  $('resolver-result').innerHTML = '';
  $('resolver-actions').innerHTML = '';
}

function showCompareResult(winner, payment, wCombo) {
  const loser = 1 - winner;
  const payTxt = wCombo.type === '421'
    ? `tous ses jetons sauf 1 (${payment})`
    : `${payment} jeton${payment !== 1 ? 's' : ''}`;
  $('resolver-result').innerHTML = `<strong>${players[winner].name}</strong> gagne avec <span class="gold">${comboLabel(wCombo)}</span> !<br>Paie <span class="red">${payTxt}</span> à ${players[loser].name}.`;
  $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Appliquer</button>';
  $('btn-apply').onclick = () => applyPayment(winner, loser, payment);
}

function showEgaliteResult(winner, loser, payment, r1, r2) {
  const payTxt = payment === 1 ? '1 jeton' : `${payment} jetons`;
  $('resolver-result').innerHTML = `<span class="gold">Égalité de combinaison</span><br>${players[winner].name} a utilisé moins de coups (${Math.min(r1,r2)} vs ${Math.max(r1,r2)}).<br>Paie <span class="red">${payTxt}</span> à ${players[loser].name}.`;
  $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Appliquer</button>';
  $('btn-apply').onclick = () => applyPayment(winner, loser, payment);
}

function showRampoChoice() {
  resolveStep = 'rampo-choice';
  const tiedScore = Math.min(roundResults[0].combo.score, players[0].tokens);

  $('resolver-result').innerHTML = `<span class="gold">"Rampo"</span> — Same combination, same rolls!<br>${players[0].name} chooses:`;

  $('resolver-actions').innerHTML = `
    <div class="rampo-choice">
      <button class="btn btn-primary" id="btn-pour-est">"pour ce qui est" (${tiedScore} token${tiedScore!==1?'s':''})</button>
      <button class="btn btn-secondary" id="btn-pour-vient">"pour ce qui vient" (re-roll once)</button>
    </div>
  `;

  $('btn-pour-est').onclick = () => {
    applyPayment(0, 1, tiedScore);
  };

  $('btn-pour-vient').onclick = () => {
    startRampoReroll();
  };
}

function startRampoReroll() {
  resolveStep = 'rampo-reroll';
  // Both re-roll once, starting from the LAST player (player 2)
  doRampoRoll(1, () => {
    doRampoRoll(0, () => {
      resolveRampoResult();
    });
  });
}

function doRampoRoll(pIdx, callback) {
  const dice = roundResults[pIdx].combo.dice.map(() => Math.ceil(Math.random() * 6));
  const combo = evaluate(dice);
  roundResults[pIdx] = { combo, rolls: roundResults[pIdx].rolls };

  const id = pIdx === 0 ? 'res-dice-p1' : 'res-dice-p2';
  $(id).innerHTML = combo.sorted.map(v => `<div class="mini-die">${v}</div>`).join('');

  const scoreId = pIdx === 0 ? 'res-score-p1' : 'res-score-p2';
  $(scoreId).innerHTML = `<span class="gold">${comboLabel(combo)}</span> (${comboScoreLabel(combo)})<br><small>re-roll</small>`;

  $('resolver-result').innerHTML = `${players[pIdx].name} re-rolled...`;

  setTimeout(callback, 800);
}

function resolveRampoResult() {
  resolveStep = 'rampo-final';
  const c1 = roundResults[0].combo;
  const c2 = roundResults[1].combo;
  const cmp = compareCombos(c1, c2);

  if (cmp !== 0) {
    const winner = cmp > 0 ? 0 : 1;
    const loser = 1 - winner;
    const wCombo = roundResults[winner].combo;
    const payment = Math.min(wCombo.score, players[winner].tokens);
    $('resolver-result').innerHTML = `<strong>${players[winner].name}</strong> wins the re-roll with <span class="gold">${comboLabel(wCombo)}</span>!<br>Pays <span class="red">${payment} token${payment!==1?'s':''}</span> to ${players[loser].name}.`;
    $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Apply</button>';
    $('btn-apply').onclick = () => applyPayment(winner, loser, payment);
  } else {
    // Still tied after re-roll — first player pays the new tied value
    const tiedScore = Math.min(c1.score, players[0].tokens);
    $('resolver-result').innerHTML = `Still tied after re-roll!<br><span class="gold">"Rampo"</span> — ${players[0].name} pays <span class="red">${tiedScore} token${tiedScore!==1?'s':''}</span>.`;
    $('resolver-actions').innerHTML = '<button class="btn btn-primary" id="btn-apply">Apply</button>';
    $('btn-apply').onclick = () => applyPayment(0, 1, tiedScore);
  }
}

// ===== PAYMENT & GAME OVER =====
function applyPayment(winner, loser, payment) {
  players[winner].tokens -= payment;
  players[loser].tokens += payment;

  if (players[winner].tokens < 0) players[winner].tokens = 0;

  addLog(`<span class="red">${players[winner].name}</span> paie <span class="gold">${payment}</span> à <span class="green">${players[loser].name}</span>`);
  addLog(`Jetons : ${players[0].name} = ${players[0].tokens}, ${players[1].name} = ${players[1].tokens}`);

  updateHeader();

  if (players[0].tokens <= 0 || players[1].tokens <= 0) {
    setTimeout(() => showGameOver(), 500);
  } else {
    setTimeout(() => nextRound(), 500);
  }
}

function showGameOver() {
  const winner = players[0].tokens <= 0 ? 0 : 1;
  $('gameover-title').textContent = `${players[winner].name} Wins!`;
  $('gameover-sub').textContent = `Reached 0 tokens in ${roundNum} rounds.`;
  showScreen('gameover');
}

// ===== EVENT LISTENERS =====
$('btn-pvc').addEventListener('click', () => startGame('pvc'));
$('btn-pvp').addEventListener('click', () => startGame('pvp'));
$('btn-rules').addEventListener('click', () => showModal('rules-modal'));
$('btn-close-rules').addEventListener('click', () => hideModal('rules-modal'));
$('rules-modal').addEventListener('click', e => { if (e.target === $('rules-modal')) hideModal('rules-modal'); });
$('choice-modal').addEventListener('click', e => { if (e.target === $('choice-modal')) hideModal('choice-modal'); });

$('btn-roll').addEventListener('click', () => {
  onRollClick();
});

// Attacher les écouteurs une fois que le DOM est prêt
function attachDiceListeners() {
  const diceRow = $('dice-row');
  if (!diceRow) return;
  
  // Utiliser la délégation d'événements pour plus de robustesse
  diceRow.addEventListener('click', (e) => {
    const dieEl = e.target.closest('[class*="dice"]') || e.target.parentElement;
    if (!dieEl || !dieEl.parentElement) return;
    
    const index = Array.from(diceRow.children).indexOf(dieEl);
    if (index === -1 || index === undefined) return;
    
    // Vérifier que c'est au bon moment
    if (!turnState || turnState.finished) return;
    if (turnState.rolls === 0) return;  // Ne peut cliquer que après un lancer
    
    // Effectuer le clic
    onDieClick(index);
    
    // Mettre à jour l'interface
    updateRollInfo();
    
    // Mettre à jour le texte du bouton Roll
    if (turnState.kept.some(k => k)) {
      $('btn-roll').textContent = 'Keep & End Turn';
    } else {
      const remaining = turnState.maxRolls - turnState.rolls;
      $('btn-roll').textContent = `Roll Again (${remaining} left)`;
    }
  });
}

// Attacher les écouteurs au lancement
attachDiceListeners();

$('btn-quit').addEventListener('click', () => showScreen('menu'));
$('btn-handoff').addEventListener('click', () => {
  showScreen('game');
  showRollButton('Roll Dice');
});
$('btn-replay').addEventListener('click', () => startGame(mode));
$('btn-menu').addEventListener('click', () => showScreen('menu'));

// ===== INIT =====
showScreen('menu');
