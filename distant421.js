/* 421 — connexion aux salons multijoueurs Apps Script */
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

  const el = id => document.getElementById(id);
  let session = null;
  let attente = null;
  let requeteLectureEnCours = false;

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

  function ouvrir() {
    showScreen('online');
    statut('');
    el('room-code').value = '';
  }

  function arreterSurveillance() {
    if (attente) clearInterval(attente);
    attente = null;
    requeteLectureEnCours = false;
  }

  function fermer() {
    arreterSurveillance();
    session = null;
    showScreen('menu');
  }

  async function appeler(action, donnees = {}) {
    if (!window.Village?.api?.get) {
      throw new Error('Service Village indisponible.');
    }

    const profil = Village.profil.lire();
    if (!profil) {
      throw new Error('Choisissez d’abord un profil dans le Village.');
    }

    const parametres = {
      profilId: profil.id,
      prenom: profil.prenom,
      ...donnees
    };

    // Les tableaux doivent être convertis en JSON pour voyager dans l’URL.
    if (Array.isArray(parametres.des)) {
      parametres.des = JSON.stringify(parametres.des);
    }

    const resultat = await Village.api.get(action, parametres);

    if (!resultat || resultat.ok === false) {
      throw new Error(
        resultat?.message ||
        resultat?.erreur ||
        'Réponse incorrecte du serveur.'
      );
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
      throw new Error('Le serveur n’a pas renvoyé les informations complètes du salon.');
    }
  }

  async function creerSalon() {
    const bouton = el('btn-create-room');
    bouton.disabled = true;
    statut('Création du salon…');

    try {
      const resultat = await appeler(ACTIONS.creer, {
        mise: miseSelectionnee()
      });

      memoriserSession(resultat);
      el('room-code').value = session.code;
      statut(`Salon créé : ${session.code}. En attente du second joueur…`);
      surveillerSalon();
    } catch (erreur) {
      console.warn('Création salon 421 :', erreur);
      statut(erreur.message, true);
    } finally {
      bouton.disabled = false;
    }
  }

  async function rejoindreSalon() {
    const code = el('room-code').value.trim().toUpperCase();

    if (!/^[A-Z2-9]{6}$/.test(code)) {
      statut('Entrez le code de six caractères.', true);
      return;
    }

    const bouton = el('btn-join-room');
    bouton.disabled = true;
    statut('Connexion au salon…');

    try {
      const resultat = await appeler(ACTIONS.rejoindre, { code });
      memoriserSession(resultat);
      statut(`Salon ${session.code} rejoint. Partie prête.`);
      surveillerSalon();
    } catch (erreur) {
      console.warn('Connexion salon 421 :', erreur);
      statut(erreur.message, true);
    } finally {
      bouton.disabled = false;
    }
  }

  async function lireSalon() {
    if (!session?.code || requeteLectureEnCours) return;
    requeteLectureEnCours = true;

    try {
      const resultat = await appeler(ACTIONS.lire, {
        code: session.code,
        joueurId: session.joueurId,
        token: session.token
      });

      session.salon = resultat.salon;
      const etat = resultat.salon?.statut;

      if (etat === 'en_attente') {
        statut(`Salon ${session.code} créé. En attente du second joueur…`);
      } else if (etat === 'en_cours') {
        arreterSurveillance();
        statut('Adversaire connecté. La partie peut commencer !');
      } else if (etat === 'terminee') {
        arreterSurveillance();
        statut('Cette partie est terminée.');
      } else if (etat === 'annulee') {
        arreterSurveillance();
        statut('Cette partie a été annulée.', true);
      }
    } catch (erreur) {
      console.warn('Lecture salon 421 :', erreur);
      // Une erreur temporaire ne détruit pas la session locale.
    } finally {
      requeteLectureEnCours = false;
    }
  }

  function surveillerSalon() {
    arreterSurveillance();
    lireSalon();
    attente = setInterval(lireSalon, 2000);
  }

  async function quitterSalon() {
    if (!session?.code) {
      fermer();
      return;
    }

    try {
      await appeler(ACTIONS.quitter, {
        code: session.code,
        joueurId: session.joueurId,
        token: session.token
      });
    } catch (erreur) {
      console.warn('Fermeture salon 421 :', erreur);
    } finally {
      fermer();
    }
  }

  el('btn-online')?.addEventListener('click', ouvrir);
  el('btn-online-back')?.addEventListener('click', quitterSalon);
  el('btn-create-room')?.addEventListener('click', creerSalon);
  el('btn-join-room')?.addEventListener('click', rejoindreSalon);

  el('room-code')?.addEventListener('input', event => {
    event.target.value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '')
      .slice(0, 6);
  });

  window.Distant421 = {
    ACTIONS,
    getSession: () => session,
    lireSalon,
    quitterSalon
  };
})();
