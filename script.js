/*
  Script principal pour l'application ICC Checker.
  Cette version introduit un panneau d'administration avec deux sections : une
  pour gérer la liste des boutiques et leurs mots de passe, et une seconde
  pour gérer dynamiquement les catégories de la checklist. Toutes les
  informations sont stockées dans Supabase : les boutiques dans la table
  `boutiques`, les catégories dans la table `categories` et les audits
  réalisés dans la table `verifications`.

  Fonctionnement général :
    - Au chargement de l'application, les listes de boutiques et de
      catégories sont récupérées depuis Supabase. Une fois chargées,
      l'écran de pré-sélection s'affiche pour choisir la boutique et
      renseigner son code.
    - L'utilisateur sélectionne sa boutique, entre son code, son prénom et
      la date de vérification. Si un audit existe déjà pour cette date et
      cette boutique, un bouton permet de consulter les résultats existants.
    - L'application affiche ensuite la checklist. Chaque entrée de la
      checklist correspond à une catégorie gérée dynamiquement dans
      Supabase. Pour chaque catégorie, l'utilisateur indique si l'élément
      est conforme ou non conforme et peut ajouter un commentaire.
    - À la fin, un récapitulatif est présenté et enregistré dans la table
      `verifications`. L'historique consulté dans l'application provient
      uniquement de Supabase ; aucun historique n'est stocké dans le
      navigateur.
    - Un mode administrateur permet de gérer les boutiques et les
      catégories. Le panneau d'administration est présenté sous forme de
      tuiles (« Boutiques » et « Catégories »). Chaque tuile mène à une
      interface de gestion dédiée.

  Remarques :
    - Pour utiliser Supabase, remplacez les constantes SUPABASE_URL et
      SUPABASE_ANON_KEY par les valeurs de votre projet.
    - La table `categories` doit comporter au moins les colonnes id,
      nom_categorie, description, icone, ordre et is_active.
    - La table `verifications` doit comporter id, boutique_id,
      nom_boutique, verificateur, date, periode_couverte, resultats et
      commentaire.
*/

// ===== Intégration Supabase =====
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Remplacez ces constantes par les vôtres
const SUPABASE_URL = 'https://vhgfjnnwhwglirnkvacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Zqbm53aHdnbGlybmt2YWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1MjY4ODksImV4cCI6MjA3MDEwMjg4OX0.-JMgOOD6syRvAzBexgUMjxTgNqpH8mhrrDxw0ItmS4w';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================== Gestion du profil et rôle administrateur ======================
/**
 * Récupère le profil courant de l'utilisateur connecté via Supabase.
 * Retourne un objet contenant l'id, l'email et le champ `is_admin`.
 * Si aucun utilisateur n'est connecté ou en cas d'erreur, retourne null.
 */
async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, is_admin')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data;
}

/**
 * Indique si l'utilisateur connecté est administrateur.
 * Utilise la table `profiles` et le champ booléen `is_admin`.
 * @returns {Promise<boolean>} true si l'utilisateur est admin, false sinon.
 */
async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!(profile && profile.is_admin);
}

// ===== Données et état global =====
// Liste dynamique des boutiques (objets { id, name, code })
let storeList = [];
// Tableau contenant uniquement les noms (pour le select)
let stores = [];
// Liste dynamique des catégories (objets { id, nom_categorie, description, icone, ordre, is_active })
let categoriesList = [];

// État de l'application
const APP_STATE = {
  PRECHECK: 'precheck',
  CHECKLIST: 'checklist',
  SUMMARY: 'summary',
  ADMIN_LOGIN: 'adminLogin',
  ADMIN_DASHBOARD: 'adminDashboard',
  ADMIN_BOUTIQUES: 'adminBoutiques',
  ADMIN_CATEGORIES: 'adminCategories',
  // Écran intermédiaire entre la pré-sélection et la checklist. Utilisé pour
  // afficher un message personnalisé, la période à couvrir et l'historique.
  START: 'start'
};
let currentAppState = APP_STATE.PRECHECK;

// Stockage des réponses de l'utilisateur (clé = id de catégorie)
let userResponses = {};

// Informations de l'audit en cours
let selectedStore = '';
let selectedStoreId = null;
let personName = '';
let verificationDate = '';
let periodStart = '';
let periodEnd = '';

// Mot de passe admin
// Ancien mot de passe admin (non utilisé). La vérification se fait désormais via Supabase.
// const ADMIN_PASSWORD = 'admin123';

// Conteneur principal
const appContainer = document.getElementById('app');

// ===== Fonctions utilitaires =====

/**
 * Charge la liste des boutiques depuis Supabase. Si aucune donnée n'est
 * trouvée ou en cas d'erreur, retourne un tableau vide. Chaque
 * enregistrement est transformé en { id, name, code } pour l'application.
 */
async function loadStores() {
  try {
    const { data, error } = await supabase.from('boutiques').select('*');
    if (error) {
      console.error('Erreur chargement boutiques :', error);
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((row) => ({ id: row.id, name: row.nom, code: row.code }));
  } catch (e) {
    console.error('Exception chargement boutiques :', e);
    return [];
  }
}

/**
 * Initialise la liste des boutiques et met à jour les variables globales.
 * Rafraîchit l'interface admin si nécessaire.
 */
async function initStoreList() {
  storeList = await loadStores();
  stores = Array.isArray(storeList) ? storeList.map((s) => s.name) : [];
  if (currentAppState === APP_STATE.ADMIN_BOUTIQUES) {
    renderBoutiquePanel();
  }
}

/**
 * Ajoute une nouvelle boutique dans Supabase puis recharge la liste.
 */
async function ajouterBoutique(nom, code) {
  try {
    const { error } = await supabase.from('boutiques').insert([{ nom, code }]);
    if (error) {
      console.error('Erreur ajout boutique :', error);
      alert('Erreur lors de l\'ajout.');
      return;
    }
    alert('Boutique ajoutée !');
    await initStoreList();
  } catch (e) {
    console.error('Exception ajout boutique :', e);
    alert('Erreur lors de l\'ajout.');
  }
}

/**
 * Met à jour le code d'une boutique existante.
 */
async function updateBoutique(id, newCode) {
  try {
    const { error } = await supabase.from('boutiques').update({ code: newCode }).eq('id', id);
    if (error) {
      console.error('Erreur mise à jour boutique :', error);
      alert('Erreur lors de la mise à jour.');
      return;
    }
    alert('Code mis à jour');
    await initStoreList();
  } catch (e) {
    console.error('Exception mise à jour boutique :', e);
    alert('Erreur lors de la mise à jour.');
  }
}

/**
 * Supprime une boutique par son id.
 */
async function supprimerBoutique(id) {
  try {
    const { error } = await supabase.from('boutiques').delete().eq('id', id);
    if (error) {
      console.error('Erreur suppression boutique :', error);
      alert('Erreur suppression.');
      return;
    }
    alert('Boutique supprimée !');
    await initStoreList();
  } catch (e) {
    console.error('Exception suppression boutique :', e);
    alert('Erreur suppression.');
  }
}

/**
 * Renvoie le code associé à une boutique par son nom.
 */
function getStoreCode(storeName) {
  const found = storeList.find((s) => s.name === storeName);
  return found ? found.code : '';
}

/**
 * Renvoie l'id de la boutique à partir de son nom.
 */
function getStoreId(storeName) {
  const found = storeList.find((s) => s.name === storeName);
  return found ? found.id : null;
}

// ===== Gestion des catégories =====

/**
 * Charge toutes les catégories actives depuis Supabase et les classe par ordre.
 */
async function loadCategories() {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('ordre', { ascending: true });
    if (error) {
      console.error('Erreur chargement catégories :', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Exception chargement catégories :', e);
    return [];
  }
}

/**
 * Initialise la liste des catégories et rafraîchit l'interface admin si nécessaire.
 */
async function initCategoryList() {
  categoriesList = await loadCategories();
  if (currentAppState === APP_STATE.ADMIN_CATEGORIES) {
    renderCategoryPanel();
  }
}

/**
 * Ajoute une catégorie en base. Les champs requis sont nom, description, icone et ordre.
 */
async function ajouterCategorie(nom_categorie, description, icone, ordre) {
  try {
    const { error } = await supabase.from('categories').insert([{ nom_categorie, description, icone, ordre }]);
    if (error) {
      console.error('Erreur ajout catégorie :', error);
      alert('Erreur lors de l\'ajout.');
      return;
    }
    alert('Catégorie ajoutée !');
    await initCategoryList();
  } catch (e) {
    console.error('Exception ajout catégorie :', e);
    alert('Erreur lors de l\'ajout.');
  }
}

/**
 * Met à jour les champs d'une catégorie par son id. data peut contenir nom_categorie,
 * description, icone, ordre ou is_active.
 */
async function updateCategorie(id, data) {
  try {
    const { error } = await supabase.from('categories').update(data).eq('id', id);
    if (error) {
      console.error('Erreur mise à jour catégorie :', error);
      alert('Erreur lors de la mise à jour.');
      return;
    }
    alert('Catégorie mise à jour');
    await initCategoryList();
  } catch (e) {
    console.error('Exception mise à jour catégorie :', e);
    alert('Erreur lors de la mise à jour.');
  }
}

/**
 * Supprime une catégorie par son id.
 */
async function supprimerCategorie(id) {
  try {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      console.error('Erreur suppression catégorie :', error);
      alert('Erreur lors de la suppression.');
      return;
    }
    alert('Catégorie supprimée !');
    await initCategoryList();
  } catch (e) {
    console.error('Exception suppression catégorie :', e);
    alert('Erreur lors de la suppression.');
  }
}

// ===== Gestion des audits =====

/**
 * Enregistre un audit dans la table `verifications`. Les résultats sont
 * transmis sous forme d'objet (dictionnaire) où chaque clé est l'id de la
 * catégorie et la valeur contient le statut et le commentaire.
 */
async function enregistrerVerification(boutiqueId, nomBoutique, verificateur, date, periodeCouverte, resultats) {
  try {
    const { error } = await supabase.from('verifications').insert([
      {
        boutique_id: boutiqueId,
        nom_boutique: nomBoutique,
        verificateur,
        date,
        periode_couverte: periodeCouverte,
        resultats,
      },
    ]);
    if (error) {
      console.error('Erreur enregistrement vérification :', error);
    } else {
      console.log('Vérification enregistrée');
    }
  } catch (e) {
    console.error('Exception enregistrement vérification :', e);
  }
}

/**
 * Récupère la dernière vérification pour une boutique donnée. Retourne un
 * objet contenant date, verificateur, periode_couverte et resultats.
 */
async function getLatestVerification(storeId) {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('boutique_id', storeId)
      .order('date', { ascending: false })
      .limit(1);
    if (error) {
      console.error('Erreur getLatestVerification :', error);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('Exception getLatestVerification :', e);
    return null;
  }
}

/**
 * Vérifie s'il existe déjà une vérification pour une boutique et une date
 * données. Retourne l'enregistrement trouvé ou null.
 */
async function getVerificationByDate(storeId, date) {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('boutique_id', storeId)
      .eq('date', date)
      .limit(1);
    if (error) {
      console.error('Erreur getVerificationByDate :', error);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('Exception getVerificationByDate :', e);
    return null;
  }
}

/**
 * Récupère les vérifications les plus récentes pour une boutique donnée.
 *
 * Cette fonction interroge Supabase pour récupérer les enregistrements
 * correspondant au `storeId` triés par date décroissante. La limite
 * d'enregistrements retournés peut être spécifiée via le paramètre `limit`.
 *
 * @param {number} storeId - identifiant de la boutique
 * @param {number} [limit=5] - nombre maximal de vérifications à récupérer
 * @returns {Promise<Array>} un tableau d'objets vérification
 */
async function fetchVerificationsForStore(storeId, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('boutique_id', storeId)
      .order('date', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Erreur lors de la récupération des vérifications Supabase :', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Exception lors de la récupération des vérifications Supabase :', err);
    return [];
  }
}

/**
 * Construit un élément DOM affichant l'historique ICC pour la boutique
 * actuellement sélectionnée. Seules les `maxEntries` entrées les plus
 * récentes sont affichées. Si aucune donnée n'est trouvée, la fonction
 * retourne `null`.
 *
 * @param {number} maxEntries - nombre maximum d'entrées à afficher
 * @returns {Promise<HTMLElement|null>}
 */
async function renderHistory(maxEntries = 3) {
  // Si aucune boutique n'est sélectionnée, on ne peut pas afficher l'historique
  if (!selectedStoreId) return null;
  try {
    const verifs = await fetchVerificationsForStore(selectedStoreId, maxEntries);
    if (!verifs || verifs.length === 0) {
      return null;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.style.flexDirection = 'column';
    wrapper.style.marginTop = '1rem';
    const title = document.createElement('h3');
    title.textContent = 'Historique ICC';
    title.style.marginBottom = '0.5rem';
    wrapper.appendChild(title);
    verifs.forEach((v) => {
      const p = document.createElement('p');
      p.style.fontSize = '0.9rem';
      p.style.marginBottom = '0.3rem';
      // Formate la date de la vérification en JJ/MM/AAAA
      let formattedDate = v.date;
      try {
        if (v.date) {
          formattedDate = formatDateFR(new Date(`${v.date}T00:00:00`));
        }
      } catch (e) {
        // en cas de format inattendu, on conserve la valeur brute
        formattedDate = v.date;
      }
      // Décompose la période couverte pour enlever le « du » initial s'il est présent
      let pStart = '';
      let pEnd = '';
      if (typeof v.periode_couverte === 'string') {
        const parts = v.periode_couverte.split(' au ');
        pStart = parts[0] ? parts[0].replace(/^du\s+/, '') : '';
        pEnd = parts[1] || '';
      }
      p.innerHTML = `<strong>Checklist effectuée par ${v.verificateur}</strong> le ${formattedDate} (Période du ${pStart} au ${pEnd})`;
      wrapper.appendChild(p);
    });
    return wrapper;
  } catch (err) {
    console.error('Erreur lors de l\'affichage de l\'historique :', err);
    return null;
  }
}

/**
 * Affiche un écran intermédiaire invitant l'utilisateur à commencer la
 * vérification. Ce panneau affiche un message personnalisé avec le
 * prénom et la boutique sélectionnée, la période à couvrir calculée
 * automatiquement, ainsi que l'historique ICC (maximum trois entrées).
 * L'utilisateur peut ensuite démarrer la checklist en cliquant sur
 * un bouton dédié.
 */
async function renderStart() {
  currentAppState = APP_STATE.START;
  appContainer.innerHTML = '';
  const introCard = document.createElement('div');
  introCard.className = 'card';
  introCard.style.flexDirection = 'column';
  introCard.style.alignItems = 'center';
  introCard.style.textAlign = 'center';
  const introTitle = document.createElement('h2');
  introTitle.textContent = 'Checklist ICC';
  const introText = document.createElement('p');
  introText.style.margin = '1rem 0';
  introText.style.fontSize = '1rem';
  // Message personnalisé
  let message = 'Préparez-vous à vérifier vos documents et procédures pour cette semaine.';
  if (personName) {
    // Calcule la période de vérification si nécessaire
    if (verificationDate) {
      [periodStart, periodEnd] = computeWeekPeriod(verificationDate);
    }
    if (selectedStore) {
      message = `Bonjour ${personName}, commencez votre vérification pour ${selectedStore}`;
    } else {
      message = `Bonjour ${personName}, commencez votre vérification`;
    }
  }
  introText.textContent = message;
  introCard.appendChild(introTitle);
  introCard.appendChild(introText);
  // Si la période a été calculée, affiche-la
  if (personName && periodStart && periodEnd) {
    const periodInfo = document.createElement('p');
    periodInfo.style.marginTop = '0.3rem';
    periodInfo.style.fontSize = '0.9rem';
    periodInfo.style.color = 'var(--muted-color)';
    periodInfo.textContent = `Période à couvrir : du ${periodStart} au ${periodEnd}`;
    introCard.appendChild(periodInfo);
  }
  // Ajoute l'historique ICC (max 3 entrées)
  try {
    const historyElem = await renderHistory(3);
    if (historyElem) {
      introCard.appendChild(historyElem);
    }
  } catch (err) {
    console.error('Erreur lors de l\'affichage de l\'historique :', err);
  }
  // Bouton pour démarrer la checklist
  const startBtn = document.createElement('button');
  startBtn.className = 'primary-button';
  startBtn.textContent = 'Démarrer la checklist';
  startBtn.style.marginTop = '1rem';
  startBtn.addEventListener('click', async () => {
    await renderChecklist();
  });
  introCard.appendChild(startBtn);
  appContainer.appendChild(introCard);
}

// ===== Fonctions de rendu (UI) =====

/**
 * Calcule la progression actuelle en pourcentage en fonction du nombre
 * d'éléments de catégories et des réponses fournies.
 */
function computeProgress() {
  const total = categoriesList.length;
  if (total === 0) return 0;
  let completed = 0;
  categoriesList.forEach((cat) => {
    const resp = userResponses[cat.id];
    if (resp && resp.status && resp.status !== 'todo') completed++;
  });
  return Math.round((completed / total) * 100);
}

/**
 * Retourne la classe CSS de statut pour un élément (done, error ou todo).
 */
function getStatusClass(catId) {
  const resp = userResponses[catId];
  if (!resp) return 'todo';
  return resp.status === 'error' ? 'error' : resp.status === 'done' ? 'done' : 'todo';
}

/**
 * Met à jour le cercle de progression en fonction de la progression actuelle.
 */
function updateProgressCircle() {
  const progress = computeProgress();
  const circle = document.querySelector('.progress-circle');
  if (circle) {
    circle.style.background = `conic-gradient(var(--secondary-color) 0% ${progress}%, #e0e7ff ${progress}% 100%)`;
    const span = circle.querySelector('span');
    if (span) span.textContent = `${progress}%`;
  }
  const finalBtn = document.querySelector('#final-btn');
  if (finalBtn) finalBtn.disabled = progress < 100;
}

/**
 * Ouvre une modale pour renseigner le statut et le commentaire d'une catégorie.
 */
function openModal(catId) {
  const cat = categoriesList.find((c) => c.id === catId);
  if (!cat) return;
  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Modale
  const modal = document.createElement('div');
  modal.className = 'modal';
  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h2 = document.createElement('h2');
  h2.textContent = cat.nom_categorie;
  const closeBtn = document.createElement('span');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  });
  header.appendChild(h2);
  header.appendChild(closeBtn);
  // Contenu
  const content = document.createElement('div');
  content.className = 'modal-content';
  const p = document.createElement('p');
  p.textContent = cat.description;
  content.appendChild(p);
  // Options statut
  const statusFieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Statut :';
  statusFieldset.appendChild(legend);
  const options = [
    { value: 'done', label: 'Conforme' },
    { value: 'error', label: 'Non conforme' },
  ];
  options.forEach(({ value, label }) => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    const radioId = `status-${catId}-${value}`;
    radio.name = `status-${catId}`;
    radio.id = radioId;
    radio.value = value;
    if (userResponses[catId] && userResponses[catId].status === value) {
      radio.checked = true;
    }
    const radioLabel = document.createElement('label');
    radioLabel.htmlFor = radioId;
    radioLabel.textContent = label;
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '0.5rem';
    wrapper.appendChild(radio);
    wrapper.appendChild(radioLabel);
    statusFieldset.appendChild(wrapper);
  });
  content.appendChild(statusFieldset);
  // Commentaire
  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Commentaire (optionnel) :';
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Vos observations...';
  if (userResponses[catId] && userResponses[catId].comment) {
    textarea.value = userResponses[catId].comment;
  }
  content.appendChild(commentLabel);
  content.appendChild(textarea);
  // Actions
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-btn';
  cancelBtn.textContent = 'Annuler';
  cancelBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  });
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', () => {
    const selected = statusFieldset.querySelector('input[type="radio"]:checked');
    if (selected) {
      userResponses[catId] = {
        status: selected.value,
        comment: textarea.value.trim(),
      };
      renderChecklist();
    }
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  // Assemblage
  modal.appendChild(header);
  modal.appendChild(content);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('active'), 10);
}

/**
 * Affiche l'écran de pré-sélection. L'utilisateur choisit sa boutique,
 * saisit le code d'accès, son prénom et la date de vérification. Un
 * historique succinct (dernière vérification) est affiché pour la
 * boutique sélectionnée. Le bouton « Commencer la checklist » est activé
 * lorsque tous les champs sont valides et que le code est correct.
 */
async function renderPreCheck() {
  currentAppState = APP_STATE.PRECHECK;
  appContainer.innerHTML = '';
  // Card de formulaire
  const formCard = document.createElement('div');
  formCard.className = 'card';
  formCard.style.flexDirection = 'column';
  formCard.style.alignItems = 'stretch';
  formCard.style.maxWidth = '500px';
  formCard.style.margin = '0 auto';

  const title = document.createElement('h2');
  title.textContent = 'Informations avant la vérification';
  title.style.marginBottom = '1rem';
  formCard.appendChild(title);

  // Recharger les listes si nécessaire
  if (!storeList || storeList.length === 0) {
    await initStoreList();
  }
  if (!categoriesList || categoriesList.length === 0) {
    await initCategoryList();
  }

  // Champ boutique
  const storeLabel = document.createElement('label');
  storeLabel.textContent = 'Boutique :';
  storeLabel.style.marginTop = '0.5rem';
  const storeSelect = document.createElement('select');
  storeSelect.style.marginTop = '0.25rem';
  storeSelect.style.padding = '0.6rem';
  storeSelect.style.borderRadius = 'var(--border-radius)';
  storeSelect.style.border = '1px solid #ccc';
  // Option vide
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Choisissez une boutique';
  storeSelect.appendChild(defaultOpt);
  stores.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    storeSelect.appendChild(opt);
  });
  // Code d'accès
  const codeLabel = document.createElement('label');
  codeLabel.textContent = 'Code boutique :';
  codeLabel.style.marginTop = '0.8rem';
  codeLabel.style.display = 'none';
  const codeInput = document.createElement('input');
  codeInput.type = 'password';
  codeInput.placeholder = 'Code de la boutique';
  codeInput.style.marginTop = '0.25rem';
  codeInput.style.padding = '0.6rem';
  codeInput.style.borderRadius = 'var(--border-radius)';
  codeInput.style.border = '1px solid #ccc';
  codeInput.style.display = 'none';
  // Message d'erreur code
  const codeMessage = document.createElement('p');
  codeMessage.style.fontSize = '0.85rem';
  codeMessage.style.color = 'var(--error-color)';
  codeMessage.style.marginTop = '0.25rem';
  codeMessage.style.display = 'none';
  codeMessage.textContent = 'Code incorrect';
  // Dernière vérification
  const latestInfo = document.createElement('p');
  latestInfo.style.marginTop = '0.4rem';
  latestInfo.style.fontSize = '0.85rem';
  latestInfo.style.color = 'var(--muted-color)';
  latestInfo.style.display = 'none';
  // Bouton consulter
  const viewResultsBtn = document.createElement('button');
  viewResultsBtn.className = 'primary-button';
  viewResultsBtn.textContent = 'Consulter les résultats';
  viewResultsBtn.style.marginTop = '0.5rem';
  viewResultsBtn.style.display = 'none';
  // Champ prénom
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Prénom :';
  nameLabel.style.marginTop = '0.8rem';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Votre prénom';
  nameInput.style.marginTop = '0.25rem';
  nameInput.style.padding = '0.6rem';
  nameInput.style.borderRadius = 'var(--border-radius)';
  nameInput.style.border = '1px solid #ccc';
  // Champ date
  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Date de vérification :';
  dateLabel.style.marginTop = '0.8rem';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.style.marginTop = '0.25rem';
  dateInput.style.padding = '0.6rem';
  dateInput.style.borderRadius = 'var(--border-radius)';
  dateInput.style.border = '1px solid #ccc';
  // Bouton continuer
  const continueBtn = document.createElement('button');
  continueBtn.className = 'primary-button';
  continueBtn.textContent = 'Commencer la checklist';
  continueBtn.style.marginTop = '1.5rem';
  continueBtn.disabled = true;
  continueBtn.addEventListener('click', async () => {
    // Mémorise les informations saisies
    personName = nameInput.value.trim();
    verificationDate = dateInput.value;
    selectedStore = storeSelect.value;
    selectedStoreId = getStoreId(selectedStore);
    // Calcule la période couverte (du dimanche précédent au samedi)
    [periodStart, periodEnd] = computeWeekPeriod(verificationDate);
    userResponses = {};
    // Passe à l'écran intermédiaire avant la checklist
    await renderStart();
  });
  // Fonction de validation du formulaire
  const checkFormValidity = async () => {
    const selectedVal = storeSelect.value;
    // Affiche le champ code seulement si une boutique est sélectionnée
    if (selectedVal) {
      codeLabel.style.display = 'block';
      codeInput.style.display = 'block';
    } else {
      codeLabel.style.display = 'none';
      codeInput.style.display = 'none';
      codeMessage.style.display = 'none';
      codeInput.value = '';
    }
    // Vérifie le code
    let codeOk = true;
    if (selectedVal) {
      const expectedCode = getStoreCode(selectedVal);
      codeOk = codeInput.value === expectedCode;
      if (codeInput.value === '') {
        codeMessage.style.display = 'none';
      } else if (!codeOk) {
        codeMessage.style.display = 'block';
      } else {
        codeMessage.style.display = 'none';
      }
    }
    // Historique : affiche la dernière vérification
    if (selectedVal) {
      const storeId = getStoreId(selectedVal);
      const latest = await getLatestVerification(storeId);
      if (latest) {
        latestInfo.style.display = 'block';
        // Formate la date au format français (JJ/MM/AAAA)
        let formattedDate = latest.date;
        try {
          if (latest.date) {
            formattedDate = formatDateFR(new Date(`${latest.date}T00:00:00`));
          }
        } catch (e) {
          formattedDate = latest.date;
        }
        // Décompose la période couverte afin de ne pas dupliquer le « du »
        let pStart = '';
        let pEnd = '';
        if (typeof latest.periode_couverte === 'string') {
          const parts = latest.periode_couverte.split(' au ');
          pStart = parts[0] ? parts[0].replace(/^du\s+/, '') : '';
          pEnd = parts[1] || '';
        }
        latestInfo.textContent = `Dernière vérification le ${formattedDate} par ${latest.verificateur} (Période couverte du ${pStart} au ${pEnd})`;
      } else {
        latestInfo.style.display = 'block';
        latestInfo.textContent = 'Aucune vérification précédente.';
      }
    } else {
      latestInfo.style.display = 'none';
    }
    // Vérifie s'il existe un audit pour cette date
    let duplicate = null;
    if (selectedVal && dateInput.value) {
      const storeId = getStoreId(selectedVal);
      duplicate = await getVerificationByDate(storeId, dateInput.value);
    }
    if (duplicate && codeOk) {
      continueBtn.disabled = true;
      viewResultsBtn.style.display = 'inline-block';
      viewResultsBtn.onclick = () => viewExistingVerification(duplicate);
    } else {
      viewResultsBtn.style.display = 'none';
      viewResultsBtn.onclick = null;
    }
    continueBtn.disabled =
      !nameInput.value.trim() || !dateInput.value || !selectedVal || !codeOk;
  };
  nameInput.addEventListener('input', checkFormValidity);
  dateInput.addEventListener('input', checkFormValidity);
  storeSelect.addEventListener('change', checkFormValidity);
  codeInput.addEventListener('input', checkFormValidity);
  // Assemblage
  formCard.appendChild(storeLabel);
  formCard.appendChild(storeSelect);
  formCard.appendChild(latestInfo);
  formCard.appendChild(viewResultsBtn);
  formCard.appendChild(codeLabel);
  formCard.appendChild(codeInput);
  formCard.appendChild(codeMessage);
  formCard.appendChild(nameLabel);
  formCard.appendChild(nameInput);
  formCard.appendChild(dateLabel);
  formCard.appendChild(dateInput);
  formCard.appendChild(continueBtn);
  // Bouton admin
  const adminBtn = document.createElement('button');
  adminBtn.className = 'primary-button';
  adminBtn.textContent = 'Admin';
  adminBtn.style.marginTop = '0.75rem';
  adminBtn.addEventListener('click', () => {
    renderAdminLogin();
  });
  formCard.appendChild(adminBtn);
  appContainer.appendChild(formCard);
  // Initialise l'affichage
  checkFormValidity();
}

/**
 * Affiche la checklist dynamique basée sur les catégories. Chaque carte
 * correspond à une catégorie. La progression circulaire est mise à jour
 * automatiquement. Lorsque toutes les catégories sont traitées, le bouton
 * final est activé.
 */
async function renderChecklist() {
  currentAppState = APP_STATE.CHECKLIST;
  appContainer.innerHTML = '';
  // Progression
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  const progressCircle = document.createElement('div');
  progressCircle.className = 'progress-circle';
  const progressNumber = document.createElement('span');
  progressNumber.textContent = '0%';
  progressCircle.appendChild(progressNumber);
  progressContainer.appendChild(progressCircle);
  appContainer.appendChild(progressContainer);
  // Liste des catégories
  categoriesList.forEach((cat) => {
    // on n'affiche que les catégories actives
    if (cat.is_active === false) return;
    const card = document.createElement('div');
    card.className = 'card';
    const statusClass = getStatusClass(cat.id);
    card.classList.add(statusClass);
    const info = document.createElement('div');
    info.className = 'info';
    // Icône
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = cat.icone || '📌';
    // Titre
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = cat.nom_categorie;
    info.appendChild(iconSpan);
    info.appendChild(titleSpan);
    // Statut
    const statusSpan = document.createElement('span');
    statusSpan.className = `status ${statusClass}`;
    statusSpan.textContent =
      statusClass === 'todo' ? 'À faire' : statusClass === 'done' ? 'OK' : 'Non conf.';
    card.appendChild(info);
    card.appendChild(statusSpan);
    card.addEventListener('click', () => {
      openModal(cat.id);
    });
    appContainer.appendChild(card);
  });
  // Bouton final
  const finalBtn = document.createElement('button');
  finalBtn.id = 'final-btn';
  finalBtn.className = 'primary-button';
  finalBtn.textContent = 'Voir le résultat';
  finalBtn.disabled = computeProgress() < 100;
  finalBtn.style.marginTop = '1.5rem';
  finalBtn.addEventListener('click', () => {
    renderSummary();
  });
  appContainer.appendChild(finalBtn);
  // Met à jour la progression initialement
  updateProgressCircle();
}

/**
 * Affiche la page de résumé final, enregistre l'audit dans Supabase et
 * présente les réponses détaillées. Aucune donnée n'est stockée en
 * localStorage.
 */
async function renderSummary() {
  currentAppState = APP_STATE.SUMMARY;
  appContainer.innerHTML = '';
  // Enregistrement Supabase
  if (selectedStoreId && personName && verificationDate) {
    const periodeTexte = `du ${periodStart} au ${periodEnd}`;
    // Crée un objet de résultats simple (sans réactions, car supabase json n'accepte que object)
    const resultsObj = {};
    Object.keys(userResponses).forEach((id) => {
      resultsObj[id] = userResponses[id];
    });
    await enregistrerVerification(
      selectedStoreId,
      selectedStore,
      personName,
      verificationDate,
      periodeTexte,
      resultsObj,
    );
  }
  // Titre
  const title = document.createElement('h2');
  title.textContent = 'Résultats de la vérification';
  appContainer.appendChild(title);
  // Sous-titre
  const subtitle = document.createElement('p');
  subtitle.style.marginBottom = '0.5rem';
  subtitle.style.color = 'var(--muted-color)';
  subtitle.textContent = `Vérification effectuée par ${personName} pour ${selectedStore} le ${verificationDate}`;
  appContainer.appendChild(subtitle);
  // Période
  const periodInfo = document.createElement('p');
  periodInfo.style.marginBottom = '0.5rem';
  periodInfo.style.color = 'var(--muted-color)';
  periodInfo.textContent = `Période vérifiée : du ${periodStart} au ${periodEnd}`;
  appContainer.appendChild(periodInfo);
  // Progression
  const progress = computeProgress();
  const progressText = document.createElement('p');
  progressText.style.fontSize = '1.2rem';
  progressText.style.margin = '0.5rem 0 1rem';
  progressText.innerHTML = `<strong>Checklist complétée à ${progress}%</strong>`;
  appContainer.appendChild(progressText);
  // Message global
  const hasError = categoriesList.some((cat) => {
    const resp = userResponses[cat.id];
    return resp && resp.status === 'error';
  });
  const overallMessage = document.createElement('p');
  overallMessage.style.fontSize = '1.1rem';
  overallMessage.style.marginBottom = '1rem';
  if (!hasError) {
    overallMessage.innerHTML = '<strong>Tout est OK ! Aucun manquement détecté.</strong>';
    overallMessage.style.color = 'var(--accent-color)';
  } else {
    overallMessage.innerHTML = '<strong>Erreurs ou manquements détectés :</strong>';
    overallMessage.style.color = 'var(--error-color)';
  }
  appContainer.appendChild(overallMessage);
  // Liste détaillée
  categoriesList.forEach((cat) => {
    if (cat.is_active === false) return;
    const resp = userResponses[cat.id];
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.style.flexDirection = 'column';
    wrapper.style.cursor = 'default';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.width = '100%';
    const rowLeft = document.createElement('div');
    rowLeft.className = 'info';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = cat.icone || '📌';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = cat.nom_categorie;
    rowLeft.appendChild(iconSpan);
    rowLeft.appendChild(titleSpan);
    const statusSpan = document.createElement('span');
    const statusClass = resp ? resp.status : 'todo';
    statusSpan.className = `status ${statusClass}`;
    statusSpan.textContent =
      statusClass === 'done' ? 'OK' : statusClass === 'error' ? 'Non conf.' : 'À faire';
    row.appendChild(rowLeft);
    row.appendChild(statusSpan);
    wrapper.appendChild(row);
    if (resp && resp.comment) {
      const comment = document.createElement('p');
      comment.style.marginTop = '0.5rem';
      comment.style.fontSize = '0.9rem';
      comment.style.color =
        statusClass === 'done'
          ? getComputedStyle(document.documentElement).getPropertyValue('--accent-color')
          : statusClass === 'error'
          ? getComputedStyle(document.documentElement).getPropertyValue('--error-color')
          : getComputedStyle(document.documentElement).getPropertyValue('--muted-color');
      comment.textContent = `Commentaire : ${resp.comment}`;
      wrapper.appendChild(comment);
    }
    appContainer.appendChild(wrapper);
  });
  // Bouton recommencer
  const restartBtn = document.createElement('button');
  restartBtn.className = 'primary-button';
  restartBtn.textContent = 'Refaire une vérification';
  restartBtn.style.marginTop = '1.5rem';
  restartBtn.addEventListener('click', () => {
    userResponses = {};
    renderPreCheck();
  });
  appContainer.appendChild(restartBtn);
}

/**
 * Permet de consulter un audit existant. Charge les réponses depuis
 * Supabase et passe directement à la page de résumé.
 */
async function viewExistingVerification(entry) {
  personName = entry.verificateur;
  verificationDate = entry.date;
  selectedStoreId = entry.boutique_id;
  selectedStore = entry.nom_boutique;
  periodStart = entry.periode_couverte.split(' au ')[0].replace('du ', '');
  periodEnd = entry.periode_couverte.split(' au ')[1];
  userResponses = entry.resultats || {};
  await renderSummary();
}

// ===== Fonctions administrateur =====

/**
 * Affiche l'écran de connexion administrateur.
 */
function renderAdminLogin() {
  currentAppState = APP_STATE.ADMIN_LOGIN;
  appContainer.innerHTML = '';
  // Carte contenant le formulaire de connexion admin (email + mot de passe)
  const card = document.createElement('div');
  card.className = 'card';
  card.style.flexDirection = 'column';
  card.style.maxWidth = '420px';
  card.style.margin = '0 auto';
  card.style.textAlign = 'center';

  const title = document.createElement('h2');
  title.textContent = 'Connexion administrateur';
  title.style.marginBottom = '1rem';

  // Champ email
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'Email';
  emailInput.style.marginBottom = '0.5rem';
  emailInput.style.padding = '0.6rem';
  emailInput.style.borderRadius = 'var(--border-radius)';
  emailInput.style.border = '1px solid #ccc';
  emailInput.style.width = '100%';

  // Champ mot de passe
  const pwdInput = document.createElement('input');
  pwdInput.type = 'password';
  pwdInput.placeholder = 'Mot de passe';
  pwdInput.style.padding = '0.6rem';
  pwdInput.style.borderRadius = 'var(--border-radius)';
  pwdInput.style.border = '1px solid #ccc';
  pwdInput.style.width = '100%';

  // Message d'erreur
  const errorMsg = document.createElement('p');
  errorMsg.style.color = 'var(--error-color)';
  errorMsg.style.fontSize = '0.9rem';
  errorMsg.style.display = 'none';

  // Conteneur boutons
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.justifyContent = 'flex-end';
  btnContainer.style.gap = '0.5rem';
  btnContainer.style.marginTop = '1rem';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'primary-button';
  cancelBtn.textContent = 'Retour';
  cancelBtn.addEventListener('click', () => {
    renderPreCheck();
  });

  const loginBtn = document.createElement('button');
  loginBtn.className = 'primary-button';
  loginBtn.textContent = 'Se connecter';
  loginBtn.addEventListener('click', async () => {
    errorMsg.style.display = 'none';
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: pwdInput.value
    });
    if (error) {
      errorMsg.textContent = 'Identifiants invalides';
      errorMsg.style.display = 'block';
      return;
    }
    // Vérifie le rôle admin après connexion
    if (await isAdmin()) {
      renderAdminDashboard();
    } else {
      await supabase.auth.signOut();
      errorMsg.textContent = 'Accès refusé (pas admin)';
      errorMsg.style.display = 'block';
    }
  });

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(loginBtn);

  card.appendChild(title);
  card.appendChild(emailInput);
  card.appendChild(pwdInput);
  card.appendChild(errorMsg);
  card.appendChild(btnContainer);
  appContainer.appendChild(card);
}

/**
 * Affiche le tableau de bord administrateur avec deux tuiles : boutiques
 * et catégories. Chaque tuile mène à son panneau de gestion.
 */
async function renderAdminDashboard() {
  // Vérifie que l'utilisateur est administrateur. Sinon, renvoie vers la page de login.
  if (!(await isAdmin())) return renderAdminLogin();
  currentAppState = APP_STATE.ADMIN_DASHBOARD;
  appContainer.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.maxWidth = '600px';
  wrapper.style.margin = '0 auto';
  const title = document.createElement('h2');
  title.textContent = 'Panneau d\'administration';
  title.style.marginBottom = '1rem';
  wrapper.appendChild(title);
  // Tuile boutiques
  const tileBoutiques = document.createElement('div');
  tileBoutiques.className = 'card';
  tileBoutiques.style.display = 'flex';
  tileBoutiques.style.alignItems = 'center';
  tileBoutiques.style.justifyContent = 'space-between';
  tileBoutiques.style.cursor = 'pointer';
  const bTitle = document.createElement('span');
  bTitle.textContent = 'Gestion des boutiques';
  bTitle.style.fontWeight = '600';
  const bIcon = document.createElement('span');
  bIcon.textContent = '🏬';
  bIcon.style.fontSize = '1.8rem';
  tileBoutiques.appendChild(bTitle);
  tileBoutiques.appendChild(bIcon);
  tileBoutiques.addEventListener('click', () => {
    renderBoutiquePanel();
  });
  // Tuile catégories
  const tileCategories = document.createElement('div');
  tileCategories.className = 'card';
  tileCategories.style.display = 'flex';
  tileCategories.style.alignItems = 'center';
  tileCategories.style.justifyContent = 'space-between';
  tileCategories.style.cursor = 'pointer';
  const cTitle = document.createElement('span');
  cTitle.textContent = 'Gestion des catégories';
  cTitle.style.fontWeight = '600';
  const cIcon = document.createElement('span');
  cIcon.textContent = '📋';
  cIcon.style.fontSize = '1.8rem';
  tileCategories.appendChild(cTitle);
  tileCategories.appendChild(cIcon);
  tileCategories.addEventListener('click', () => {
    renderCategoryPanel();
  });
  // Bouton retour
  const backBtn = document.createElement('button');
  backBtn.className = 'primary-button';
  backBtn.textContent = 'Retour';
  backBtn.style.marginTop = '1.5rem';
  backBtn.addEventListener('click', () => {
    renderPreCheck();
  });

  // Bouton de déconnexion pour quitter la session administrateur
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'primary-button';
  logoutBtn.textContent = 'Se déconnecter';
  logoutBtn.style.marginTop = '0.5rem';
  logoutBtn.addEventListener('click', async () => {
    // Déconnecte l'utilisateur via Supabase et retourne à l'écran de pré-sélection
    await supabase.auth.signOut();
    renderPreCheck();
  });
  wrapper.appendChild(tileBoutiques);
  wrapper.appendChild(tileCategories);
  wrapper.appendChild(backBtn);
  wrapper.appendChild(logoutBtn);
  appContainer.appendChild(wrapper);
}

/**
 * Affiche le panneau de gestion des boutiques (CRUD). Permet de
 * consulter, modifier et supprimer les boutiques existantes et d'en
 * ajouter de nouvelles.
 */
async function renderBoutiquePanel() {
  // Vérifie les droits d'administration avant de continuer
  if (!(await isAdmin())) {
    return renderAdminLogin();
  }
  currentAppState = APP_STATE.ADMIN_BOUTIQUES;
  // Recharge la liste des boutiques pour avoir des données à jour
  await initStoreList();
  appContainer.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.maxWidth = '900px';
  wrapper.style.margin = '0 auto';
  const title = document.createElement('h2');
  title.textContent = 'Gestion des boutiques';
  title.style.marginBottom = '1rem';
  wrapper.appendChild(title);
  // Liste existante
  storeList.forEach((store) => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '3fr 2fr auto auto';
    row.style.alignItems = 'center';
    row.style.columnGap = '0.5rem';
    row.style.marginBottom = '0.5rem';
    // Nom
    const nameSpan = document.createElement('span');
    nameSpan.textContent = store.name;
    nameSpan.style.fontWeight = '600';
    // Code input
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.value = store.code;
    codeInput.style.padding = '0.4rem';
    codeInput.style.borderRadius = 'var(--border-radius)';
    codeInput.style.border = '1px solid #ccc';
    // Enregistrer
    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary-button';
    saveBtn.textContent = 'Enregistrer';
    saveBtn.addEventListener('click', async () => {
      const newCode = codeInput.value.trim();
      if (!newCode) {
        alert('Le code ne peut pas être vide.');
        return;
      }
      await updateBoutique(store.id, newCode);
    });
    // Supprimer
    const delBtn = document.createElement('button');
    delBtn.className = 'primary-button';
    delBtn.textContent = 'Supprimer';
    delBtn.style.background = 'var(--error-color)';
    delBtn.addEventListener('click', async () => {
      const confirmDelete = confirm(`Supprimer la boutique \"${store.name}\" ?`);
      if (confirmDelete) {
        await supprimerBoutique(store.id);
      }
    });
    row.appendChild(nameSpan);
    row.appendChild(codeInput);
    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    wrapper.appendChild(row);
  });
  // Ajout
  const addRow = document.createElement('div');
  addRow.style.display = 'grid';
  addRow.style.gridTemplateColumns = '3fr 2fr auto';
  addRow.style.alignItems = 'center';
  addRow.style.columnGap = '0.5rem';
  addRow.style.marginTop = '1rem';
  const newNameInput = document.createElement('input');
  newNameInput.type = 'text';
  newNameInput.placeholder = 'Nom de la boutique';
  newNameInput.style.padding = '0.4rem';
  newNameInput.style.borderRadius = 'var(--border-radius)';
  newNameInput.style.border = '1px solid #ccc';
  const newCodeInput = document.createElement('input');
  newCodeInput.type = 'text';
  newCodeInput.placeholder = 'Code d\'accès';
  newCodeInput.style.padding = '0.4rem';
  newCodeInput.style.borderRadius = 'var(--border-radius)';
  newCodeInput.style.border = '1px solid #ccc';
  const addBtn = document.createElement('button');
  addBtn.className = 'primary-button';
  addBtn.textContent = 'Ajouter';
  addBtn.addEventListener('click', async () => {
    const nameVal = newNameInput.value.trim();
    const codeVal = newCodeInput.value.trim();
    if (!nameVal || !codeVal) {
      alert('Veuillez saisir un nom et un code.');
      return;
    }
    if (storeList.some((s) => s.name === nameVal)) {
      alert('Une boutique portant ce nom existe déjà.');
      return;
    }
    await ajouterBoutique(nameVal, codeVal);
    newNameInput.value = '';
    newCodeInput.value = '';
  });
  addRow.appendChild(newNameInput);
  addRow.appendChild(newCodeInput);
  addRow.appendChild(addBtn);
  wrapper.appendChild(addRow);
  // Bouton retour
  const backBtn = document.createElement('button');
  backBtn.className = 'primary-button';
  backBtn.textContent = 'Retour';
  backBtn.style.marginTop = '1.5rem';
  backBtn.addEventListener('click', () => {
    renderAdminDashboard();
  });
  wrapper.appendChild(backBtn);
  appContainer.appendChild(wrapper);
}

/**
 * Affiche le panneau de gestion des catégories. Permet d'ajouter,
 * modifier et supprimer des catégories qui composent la checklist.
 */
async function renderCategoryPanel() {
  // Vérifie les droits d'administration avant de continuer
  if (!(await isAdmin())) {
    return renderAdminLogin();
  }
  currentAppState = APP_STATE.ADMIN_CATEGORIES;
  appContainer.innerHTML = '';
  // Recharge les catégories pour avoir des données à jour
  await initCategoryList();
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.maxWidth = '900px';
  wrapper.style.margin = '0 auto';
  const title = document.createElement('h2');
  title.textContent = 'Gestion des catégories';
  title.style.marginBottom = '1rem';
  wrapper.appendChild(title);
  // Liste existante
  categoriesList.forEach((cat) => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    // 6 colonnes : nom, description, icône, ordre, enregistrer, supprimer. Les deux dernières colonnes
    // utilisent "auto" afin de s'ajuster au contenu des boutons. Cela garantit
    // que tous les éléments tiennent sur une seule ligne et restent alignés.
    row.style.gridTemplateColumns = '2fr 3fr 1fr 1fr auto auto';
    row.style.alignItems = 'center';
    row.style.columnGap = '0.5rem';
    row.style.marginBottom = '0.5rem';
    // Nom
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = cat.nom_categorie;
    nameInput.style.padding = '0.4rem';
    nameInput.style.borderRadius = 'var(--border-radius)';
    nameInput.style.border = '1px solid #ccc';
    // Description
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.value = cat.description;
    descInput.style.padding = '0.4rem';
    descInput.style.borderRadius = 'var(--border-radius)';
    descInput.style.border = '1px solid #ccc';
    // Icône
    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.value = cat.icone || '';
    iconInput.placeholder = 'Icône (emoji)';
    iconInput.style.padding = '0.4rem';
    iconInput.style.borderRadius = 'var(--border-radius)';
    iconInput.style.border = '1px solid #ccc';
    // Ordre
    const orderInput = document.createElement('input');
    orderInput.type = 'number';
    orderInput.value = cat.ordre !== null && cat.ordre !== undefined ? cat.ordre : '';
    orderInput.style.padding = '0.4rem';
    orderInput.style.borderRadius = 'var(--border-radius)';
    orderInput.style.border = '1px solid #ccc';
    orderInput.style.width = '5rem';
    // Enregistrer
    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary-button';
    saveBtn.textContent = 'Enregistrer';
    saveBtn.addEventListener('click', async () => {
      const nomVal = nameInput.value.trim();
      const descVal = descInput.value.trim();
      const iconVal = iconInput.value.trim();
      const orderVal = orderInput.value ? parseInt(orderInput.value) : null;
      if (!nomVal || !descVal) {
        alert('Veuillez saisir un nom et une description.');
        return;
      }
      await updateCategorie(cat.id, {
        nom_categorie: nomVal,
        description: descVal,
        icone: iconVal || null,
        ordre: orderVal,
      });
    });
    // Supprimer
    const delBtn = document.createElement('button');
    delBtn.className = 'primary-button';
    delBtn.textContent = 'Supprimer';
    delBtn.style.background = 'var(--error-color)';
    // Réduit légèrement l'épaisseur des boutons pour éviter qu'ils ne débordent du conteneur
    saveBtn.style.padding = '0.5rem 0.8rem';
    delBtn.style.padding = '0.5rem 0.8rem';
    delBtn.addEventListener('click', async () => {
      const confirmDelete = confirm(`Supprimer la catégorie \"${cat.nom_categorie}\" ?`);
      if (confirmDelete) {
        await supprimerCategorie(cat.id);
      }
    });
    row.appendChild(nameInput);
    row.appendChild(descInput);
    row.appendChild(iconInput);
    row.appendChild(orderInput);
    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    wrapper.appendChild(row);
  });
  // Ligne d'ajout
  const addRow = document.createElement('div');
  addRow.style.display = 'grid';
  addRow.style.gridTemplateColumns = '2fr 3fr 1fr 1fr auto';
  addRow.style.alignItems = 'center';
  addRow.style.columnGap = '0.5rem';
  addRow.style.marginTop = '1rem';
  const newName = document.createElement('input');
  newName.type = 'text';
  newName.placeholder = 'Nom de la catégorie';
  newName.style.padding = '0.4rem';
  newName.style.borderRadius = 'var(--border-radius)';
  newName.style.border = '1px solid #ccc';
  const newDesc = document.createElement('input');
  newDesc.type = 'text';
  newDesc.placeholder = 'Description';
  newDesc.style.padding = '0.4rem';
  newDesc.style.borderRadius = 'var(--border-radius)';
  newDesc.style.border = '1px solid #ccc';
  const newIcon = document.createElement('input');
  newIcon.type = 'text';
  newIcon.placeholder = 'Icône (emoji)';
  newIcon.style.padding = '0.4rem';
  newIcon.style.borderRadius = 'var(--border-radius)';
  newIcon.style.border = '1px solid #ccc';
  const newOrder = document.createElement('input');
  newOrder.type = 'number';
  newOrder.placeholder = 'Ordre';
  newOrder.style.padding = '0.4rem';
  newOrder.style.borderRadius = 'var(--border-radius)';
  newOrder.style.border = '1px solid #ccc';
  newOrder.style.width = '5rem';
  const addCatBtn = document.createElement('button');
  addCatBtn.className = 'primary-button';
  addCatBtn.textContent = 'Ajouter';
  addCatBtn.addEventListener('click', async () => {
    const nomVal = newName.value.trim();
    const descVal = newDesc.value.trim();
    const iconVal = newIcon.value.trim();
    const orderVal = newOrder.value ? parseInt(newOrder.value) : null;
    if (!nomVal || !descVal) {
      alert('Veuillez saisir un nom et une description.');
      return;
    }
    await ajouterCategorie(nomVal, descVal, iconVal || null, orderVal);
    newName.value = '';
    newDesc.value = '';
    newIcon.value = '';
    newOrder.value = '';
  });
  addRow.appendChild(newName);
  addRow.appendChild(newDesc);
  addRow.appendChild(newIcon);
  addRow.appendChild(newOrder);
  addRow.appendChild(addCatBtn);
  wrapper.appendChild(addRow);
  // Bouton retour
  const backBtn = document.createElement('button');
  backBtn.className = 'primary-button';
  backBtn.textContent = 'Retour';
  backBtn.style.marginTop = '1.5rem';
  backBtn.addEventListener('click', () => {
    renderAdminDashboard();
  });
  wrapper.appendChild(backBtn);
  appContainer.appendChild(wrapper);
}

// ===== Outils divers =====

/**
 * Formate une date en JJ/MM/AAAA.
 */
function formatDateFR(date) {
  return date.toLocaleDateString('fr-FR');
}

/**
 * Calcule la période de vérification (du dimanche précédent au samedi) à
 * partir d'une date de contrôle.
 */
function computeWeekPeriod(dateString) {
  if (!dateString) return ['', ''];
  const date = new Date(`${dateString}T00:00:00`);
  const start = new Date(date);
  start.setDate(start.getDate() - 7);
  const end = new Date(date);
  end.setDate(end.getDate() - 1);
  return [formatDateFR(start), formatDateFR(end)];
}

// ===== Initialisation =====

/**
 * Fonction init principale : charge boutiques et catégories puis affiche le
 * formulaire de pré-sélection.
 */
async function init() {
  await initStoreList();
  await initCategoryList();
  renderPreCheck();
}

// Démarrage après chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  init();
});