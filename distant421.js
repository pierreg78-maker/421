/* 421 — orchestrateur du mode deux joueurs à distance */
(() => {
  'use strict';

  const ACTIONS = {
    creer: 'creerSalon421',
    rejoindre: 'rejoindreSalon421',
    lire: 'lireSalon421',
    commencerTour: 'commencerTour421',
    terminerTour: 'terminerTour421',
    quitter: 'quitterSalon421'
  };
  const CLE_SESSION = 'session421Distance';
  const el = id => document.getElementById(id);
  let session = null;
  let surveillance = null;
  let lectureEnCours = false;
  let fermetureDemandee = false;

  function statut(message, erreur = false) {
    const zone = el('online-status');
    if (!zone) return;
    zone.textContent = message;
    zone.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  function miseSelectionnee() {
    const bouton = document.querySelector('.mise-btn.active');
    return bouton ? Number(bouton.dataset.mise) || 0 : 0;
  }

  function sauvegarderSession() {
    if (!session) localStorage.removeItem(CLE_SESSION);
    else localStorage.setItem(CLE_SESSION, JSON.stringify({
      code: session.code,
      joueurId: session.joueurId,
      token: session.token
    }));
  }

  function restaurerSession() {
    try {
      const brut = localStorage.getItem(CLE_SESSION);
      if (!brut) return false;
      const valeur = JSON.parse(brut);
      if (!valeur.code || !valeur.joueurId || !valeur.token) return false;
      session = { ...valeur, salon: null };
      surveillerSalon();
      return true;
    } catch (_) {
      localStorage.removeItem(CLE_SESSION);
      return false;
    }
  }

  async function appeler(action, donnees = {}) {
    if (!window.Village?.api?.get) throw new Error('Service Village indisponible.');
    const profil = Village.profil.lire();
    if (!profil) throw new Error('Choisissez d’abord un profil dans le Village.');
    const parametres = { profilId: profil.id, prenom: profil.prenom, ...donnees };
    if (Array.isArray(parametres.des)) parametres.des = JSON.stringify(parametres.des);
    const resultat = await Village.api.get(action, parametres);
    if (!resultat || resultat.ok === false) {
      throw new Error(resultat?.erreur || resultat?.message || 'Réponse incorrecte du serveur.');
    }
    return resultat;
  }

  function memoriserSession(resultat) {
    session = {
      code: String(resultat.code || resultat.salon?.code || '').toUpperCase(),
      joueurId: resultat.joueurId,
      token: resultat.token,
      salon: resultat.salon || null
    };
    if (!session.code || !session.joueurId || !session.token) {
      throw new Error('Informations du salon incomplètes.');
    }
    sauvegarderSession();
  }

  function ouvrir() {
    showScreen('online');
    statut('');
    el('room-code').value = '';
    el('online-bet-summary').textContent = miseSelectionnee() > 0
      ? `Mise : ${miseSelectionnee()} pièces d’or par joueur`
      : 'Partie gratuite';
  }

  async function creerSalon() {
    const bouton = el('btn-create-room');
    bouton.disabled = true;
    statut('Création du salon…');
    try {
      const resultat = await appeler(ACTIONS.creer, { mise: miseSelectionnee() });
      memoriserSession(resultat);
      el('room-code').value = session.code;
      statut(`Code ${session.code} — communiquez-le au second joueur.`);
      surveillerSalon();
    } catch (erreur) {
      statut(erreur.message, true);
    } finally {
      bouton.disabled = false;
    }
  }

  async function rejoindreSalon() {
    const code = el('room-code').value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return statut('Entrez le code de six caractères.', true);
    const bouton = el('btn-join-room');
    bouton.disabled = true;
    statut('Connexion au salon…');
    try {
      const resultat = await appeler(ACTIONS.rejoindre, { code });
      memoriserSession(resultat);
      statut(`Salon ${session.code} rejoint.`);
      window.Jeu421?.startOnline(resultat.salon);
      surveillerSalon();
    } catch (erreur) {
      statut(erreur.message, true);
    } finally {
      bouton.disabled = false;
    }
  }

  async function lireSalon() {
    if (!session?.code || lectureEnCours) return;
    lectureEnCours = true;
    try {
      const resultat = await appeler(ACTIONS.lire, {
        code: session.code,
        joueurId: session.joueurId,
        token: session.token
      });
      session.salon = resultat.salon;
      const salon = resultat.salon;
      if (salon.statut === 'en_attente') {
        showScreen('online');
        el('room-code').value = session.code;
        statut(`Code ${session.code} — en attente du second joueur…`);
      } else {
        window.Jeu421?.applyOnlineSalon(salon);
      }
      if (salon.statut === 'terminee' || salon.statut === 'annulee') arreterSurveillance();
    } catch (erreur) {
      console.warn('Lecture salon 421 :', erreur);
      if (/introuvable|expiré|Accès refusé/i.test(erreur.message)) {
        arreterSurveillance();
        session = null;
        sauvegarderSession();
        statut(erreur.message, true);
        showScreen('online');
      }
    } finally {
      lectureEnCours = false;
    }
  }

  function surveillerSalon() {
    arreterSurveillance();
    lireSalon();
    surveillance = setInterval(lireSalon, 1500);
  }

  function arreterSurveillance() {
    if (surveillance) clearInterval(surveillance);
    surveillance = null;
  }

  async function terminerTour(des, lancersUtilises, tourId) {
    if (!session) throw new Error('Session distante absente.');
    const resultat = await appeler(ACTIONS.terminerTour, {
      code: session.code,
      joueurId: session.joueurId,
      token: session.token,
      des,
      lancersUtilises,
      tourId
    });
    session.salon = resultat.salon;
    window.Jeu421?.applyOnlineSalon(resultat.salon);
    return resultat;
  }

  async function quitterSalon() {
    if (fermetureDemandee) return;
    fermetureDemandee = true;
    try {
      if (session?.code) {
        await appeler(ACTIONS.quitter, {
          code: session.code,
          joueurId: session.joueurId,
          token: session.token
        });
      }
    } catch (erreur) {
      console.warn('Abandon salon 421 :', erreur);
    } finally {
      arreterSurveillance();
      session = null;
      sauvegarderSession();
      fermetureDemandee = false;
      showScreen('menu');
    }
  }

  function retourMenu() {
    arreterSurveillance();
    session = null;
    sauvegarderSession();
    showScreen('menu');
  }

  el('btn-online')?.addEventListener('click', ouvrir);
  el('btn-online-back')?.addEventListener('click', quitterSalon);
  el('btn-create-room')?.addEventListener('click', creerSalon);
  el('btn-join-room')?.addEventListener('click', rejoindreSalon);
  el('room-code')?.addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  });

  window.Distant421 = {
    ACTIONS,
    getSession: () => session,
    lireSalon,
    terminerTour,
    quitterSalon,
    retourMenu
  };

  restaurerSession();
})();
