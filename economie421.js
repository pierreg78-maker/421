/* 421 — couche économique, séparée du moteur de jeu */
(() => {
  'use strict';

  const SOURCE = '421';
  const GAINS_KEY = 'village421GainsCumules';
  let miseChoisie = 0;
  let miseDebitee = false;
  let gainTraite = false;
  let lancementEnCours = false;

  const demarrerJeuOriginal = window.startGame;
  const afficherFinOriginal = window.showGameOver;

  function el(id) { return document.getElementById(id); }
  function profil() { return window.Village?.profil?.lire?.() || null; }
  function solde() { return window.Village?.or?.solde?.() ?? 0; }
  function format(n) { return window.Village?.formaterPieces?.(n) || `${n} pièces d’or`; }

  function actualiserMenu() {
    document.querySelectorAll('.mise-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.mise) === miseChoisie);
    });

    const zone = el('solde-village');
    if (!zone) return;
    const p = profil();

    if (miseChoisie === 0) {
      zone.innerHTML = p
        ? `Partie gratuite — solde : <strong>${format(solde())}</strong>`
        : 'Partie gratuite sélectionnée';
    } else if (!p) {
      zone.textContent = 'Choisissez un profil dans le Village pour miser.';
    } else {
      zone.innerHTML = `Solde : <strong>${format(solde())}</strong> — gain total possible : <strong>${format(miseChoisie * 2)}</strong>`;
    }

    const resume = el('online-bet-summary');
    if (resume) {
      resume.textContent = miseChoisie === 0
        ? 'Partie gratuite'
        : `Mise : ${format(miseChoisie)} par joueur — pot : ${format(miseChoisie * 2)}`;
    }
  }

  function afficherMiseEnCours(m) {
    const zone = el('mise-en-cours');
    if (!zone) return;
    zone.innerHTML = m === 0
      ? 'Partie gratuite'
      : `Mise : <strong>${format(m)}</strong> — victoire : <strong>${format(m * 2)}</strong>`;
  }

  async function debiterMise(m) {
    if (m === 0) return true;
    if (!window.Village) {
      alert('Le service des pièces d’or ne s’est pas chargé.');
      return false;
    }
    if (!profil()) {
      Village.ui.erreur('Aucun profil actif. Revenez au Village pour choisir un profil.');
      return false;
    }
    if (solde() < m) {
      Village.ui.erreur(`Solde insuffisant : il faut ${format(m)}.`);
      return false;
    }

    const resultat = await Village.or.depenser(m, SOURCE, {
      confirmer: true,
      messageConfirmation: `Miser ${format(m)} sur cette partie de 421 ?`,
      messageSucces: `Mise de ${format(m)} enregistrée.`,
      details: { jeu: '421', type: 'mise', mode: 'ordinateur' }
    });
    return Boolean(resultat?.ok && !resultat?.annule);
  }

  async function lancerAvecMise(modeJeu) {
    if (lancementEnCours) return;

    if (modeJeu === 'pvp' && miseChoisie > 0) {
      Village?.ui?.info?.('Sur un seul appareil, la partie reste gratuite : un seul profil est connecté.');
      miseChoisie = 0;
      actualiserMenu();
    }

    lancementEnCours = true;
    try {
      miseDebitee = await debiterMise(miseChoisie);
      if (!miseDebitee && miseChoisie > 0) return;

      gainTraite = false;
      afficherMiseEnCours(miseChoisie);
      demarrerJeuOriginal(modeJeu);
      actualiserMenu();
    } catch (erreur) {
      console.warn('Mise 421 impossible :', erreur);
      Village?.ui?.erreur?.(erreur.message || 'La mise n’a pas pu être enregistrée.');
    } finally {
      lancementEnCours = false;
    }
  }

  async function crediterVictoire(montant) {
    const resultat = await Village.or.recompenser(montant, SOURCE, {
      messageAttente: 'Enregistrement du gain du 421…',
      messageSucces: `Victoire ! +${format(montant)}`,
      nombrePieces: Math.min(18, Math.max(8, Math.round(montant / 4))),
      details: { jeu: '421', type: 'gain', mode: 'ordinateur', mise: miseChoisie }
    });

    const ancien = Number(localStorage.getItem(GAINS_KEY) || 0);
    const nouveau = ancien + montant;
    localStorage.setItem(GAINS_KEY, String(nouveau));

    if (ancien < 100 && nouveau >= 100) {
      setTimeout(() => {
        Village.ui.succes('🥂 Gaston sort le champagne : vous avez remporté 100 pièces d’or au 421 !', { duree: 7000 });
      }, 900);
    }
    return resultat;
  }

  window.startGame = function(modeJeu) {
    return lancerAvecMise(modeJeu);
  };

  window.showGameOver = async function() {
    const gagnant = players[0].tokens <= 0 ? 0 : 1;
    afficherFinOriginal();

    if (gainTraite || miseChoisie === 0 || !miseDebitee || mode !== 'pvc') return;
    gainTraite = true;

    if (gagnant === 0) {
      try {
        await crediterVictoire(miseChoisie * 2);
        const sub = el('gameover-sub');
        if (sub) sub.textContent += ` Gain : ${format(miseChoisie * 2)}.`;
      } catch (erreur) {
        gainTraite = false;
        console.warn('Crédit du gain 421 impossible :', erreur);
        const sub = el('gameover-sub');
        if (sub) sub.textContent += ' ⚠️ Gain non enregistré.';
      }
    } else {
      const sub = el('gameover-sub');
      if (sub) sub.textContent += ` Mise perdue : ${format(miseChoisie)}.`;
    }
    actualiserMenu();
  };

  document.querySelectorAll('.mise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      miseChoisie = Number(btn.dataset.mise) || 0;
      actualiserMenu();
    });
  });

  document.addEventListener('village:solde', actualiserMenu);
  document.addEventListener('village:profil', actualiserMenu);

  window.Village?.init?.();
  actualiserMenu();
})();
