/* 421 — première couche du mode distant
   L'interface et le contrat réseau sont prêts.
   Les actions Apps Script correspondantes seront ajoutées à l'étape suivante. */
(() => {
  'use strict';

  const ACTIONS = {
    creer: '421_creerSalon',
    rejoindre: '421_rejoindreSalon',
    lire: '421_lireSalon',
    jouer: '421_jouerAction',
    quitter: '421_quitterSalon'
  };

  const el = id => document.getElementById(id);
  let salon = null;
  let attente = null;

  function statut(message, erreur = false) {
    const zone = el('online-status');
    if (!zone) return;
    zone.textContent = message;
    zone.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  function codeAleatoire() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  }

  function ouvrir() {
    showScreen('online');
    statut('');
    el('room-code').value = '';
  }

  function fermer() {
    if (attente) clearInterval(attente);
    attente = null;
    salon = null;
    showScreen('menu');
  }

  async function appeler(action, donnees = {}) {
    if (!window.Village?.api?.post) throw new Error('Service Village indisponible.');
    const profil = Village.profil.lire();
    if (!profil) throw new Error('Choisissez d’abord un profil dans le Village.');

    const resultat = await Village.api.post({
      action,
      profilId: profil.id,
      prenom: profil.prenom,
      ...donnees
    });

    if (!resultat || resultat.ok === false) {
      throw new Error(resultat?.message || resultat?.erreur || 'Le service distant n’est pas encore activé.');
    }
    return resultat;
  }

  async function creerSalon() {
    const bouton = el('btn-create-room');
    bouton.disabled = true;
    statut('Création du salon…');

    try {
      const codePropose = codeAleatoire();
      const resultat = await appeler(ACTIONS.creer, { code: codePropose });
      salon = resultat.salon || { code: resultat.code || codePropose };
      statut(`Salon créé : ${salon.code}. En attente du second joueur…`);
      el('room-code').value = salon.code;
      surveillerSalon();
    } catch (erreur) {
      console.warn('Création salon 421 :', erreur);
      statut(`${erreur.message} La façade est prête ; il reste à ajouter les actions 421 dans Code.gs.`, true);
    } finally {
      bouton.disabled = false;
    }
  }

  async function rejoindreSalon() {
    const code = el('room-code').value.trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(code)) {
      statut('Entrez un code de quatre caractères.', true);
      return;
    }

    const bouton = el('btn-join-room');
    bouton.disabled = true;
    statut('Connexion au salon…');

    try {
      const resultat = await appeler(ACTIONS.rejoindre, { code });
      salon = resultat.salon || { code };
      statut(`Salon ${code} rejoint. Synchronisation de la partie…`);
      surveillerSalon();
    } catch (erreur) {
      console.warn('Connexion salon 421 :', erreur);
      statut(`${erreur.message} La façade est prête ; il reste à ajouter les actions 421 dans Code.gs.`, true);
    } finally {
      bouton.disabled = false;
    }
  }

  function surveillerSalon() {
    if (attente) clearInterval(attente);
    attente = setInterval(async () => {
      if (!salon?.code) return;
      try {
        const resultat = await appeler(ACTIONS.lire, { code: salon.code });
        if (resultat?.salon?.statut === 'pret') {
          clearInterval(attente);
          attente = null;
          statut('Adversaire connecté. La synchronisation du moteur sera branchée à l’étape suivante.');
        }
      } catch (_) {
        /* Une panne temporaire ne ferme pas le salon. */
      }
    }, 2000);
  }

  el('btn-online')?.addEventListener('click', ouvrir);
  el('btn-online-back')?.addEventListener('click', fermer);
  el('btn-create-room')?.addEventListener('click', creerSalon);
  el('btn-join-room')?.addEventListener('click', rejoindreSalon);
  el('room-code')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
  });

  window.Distant421 = { ACTIONS };
})();
