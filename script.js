/*
  Script principal pour l'application de contrôle ICC.
  Ce fichier gère l'ensemble des interactions et la logique de l'application.

  Fonctionnement général :
    - À l'initialisation, un écran d'accueil propose de commencer la
      vérification hebdomadaire.
    - Une fois démarrée, l'application affiche une liste des éléments à
      vérifier. Chaque élément peut être ouvert pour lire les instructions
      détaillées et saisir un commentaire, et être marqué conforme,
      avertissement ou non conforme.
    - Une barre de progression indique l'avancement du contrôle.
    - À la fin, un récapitulatif présente les résultats, avec le score et
      la liste des éléments manquants ou en anomalie.

  Pour personnaliser la liste des éléments ou les instructions, modifiez
  simplement la constante `checkItems` ci-dessous.
*/

// ======== Données et état global ========

// ============== Intégration Supabase ============== //
// Nous utilisons Supabase pour stocker et synchroniser la liste des boutiques et leurs codes.
// Import du client Supabase (module ES). Cette ligne sera prise en charge car index.html
// charge ce script avec type="module".
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Remplacez ces constantes par les valeurs de votre projet Supabase.
const SUPABASE_URL = 'https://vhgfjnnwhwglirnkvacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Zqbm53aHdnbGlybmt2YWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1MjY4ODksImV4cCI6MjA3MDEwMjg4OX0.-JMgOOD6syRvAzBexgUMjxTgNqpH8mhrrDxw0ItmS4w';

// Création du client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Charge la liste des boutiques depuis Supabase. En cas d'erreur ou de résultat vide,
 * on retourne une liste locale par défaut via loadStoreListLocal().
 * Les enregistrements de Supabase utilisent les colonnes id, nom et code.
 * On les transforme en objets { id, name, code } pour l'application.
 */
async function loadStoreList() {
  try {
    const { data, error } = await supabase.from('boutiques').select('*');
    if (error) {
      console.error('Erreur chargement boutiques Supabase :', error);
      // en cas d'erreur, utilise la liste locale comme secours
      return loadStoreListLocal();
    }
    if (!Array.isArray(data) || data.length === 0) {
      // aucune donnée dans Supabase, retourne la liste locale par défaut
      return loadStoreListLocal();
    }
    // Transforme les données Supabase en format attendu par l'application
    return data.map((row) => ({ id: row.id, name: row.nom, code: row.code }));
  } catch (err) {
    console.error('Exception lors du chargement des boutiques Supabase :', err);
    return loadStoreListLocal();
  }
}

/**
 * Ajoute une nouvelle boutique dans Supabase. Après insertion, recharge la liste pour mettre à jour l'interface.
 */
async function ajouterBoutique(nom, code) {
  try {
    const { error } = await supabase.from('boutiques').insert([{ nom, code }]);
    if (error) {
      console.error('Erreur ajout boutique Supabase :', error);
      alert('Erreur lors de l\'ajout.');
      return;
    }
    alert('Boutique ajoutée !');
    await initStoreList();
  } catch (err) {
    console.error('Exception ajout boutique Supabase :', err);
    alert('Erreur lors de l\'ajout.');
  }
}

/**
 * Met à jour le code d'une boutique existante dans Supabase.
 */
async function updateBoutique(id, newCode) {
  try {
    const { error } = await supabase.from('boutiques').update({ code: newCode }).eq('id', id);
    if (error) {
      console.error('Erreur mise à jour boutique Supabase :', error);
      alert('Erreur lors de la mise à jour.');
      return;
    }
    alert('Code mis à jour');
    await initStoreList();
  } catch (err) {
    console.error('Exception mise à jour boutique Supabase :', err);
    alert('Erreur lors de la mise à jour.');
  }
}

/**
 * Supprime une boutique de Supabase par son id.
 */
async function supprimerBoutique(id) {
  try {
    const { error } = await supabase.from('boutiques').delete().eq('id', id);
    if (error) {
      console.error('Erreur suppression boutique Supabase :', error);
      alert('Erreur suppression.');
      return;
    }
    alert('Boutique supprimée !');
    await initStoreList();
  } catch (err) {
    console.error('Exception suppression boutique Supabase :', err);
    alert('Erreur suppression.');
  }
}

// ============== Variables globales ============== //
// Liste dynamique des boutiques (objet {id, name, code}).
let storeList = [];
// Tableau contenant uniquement les noms pour le menu déroulant
let stores = [];

/**
 * Initialise la liste des boutiques depuis Supabase et met à jour les variables globales.
 * Appelle ensuite renderPreCheck() pour afficher l'écran de pré-sélection une fois les données prêtes.
 */
async function initStoreList() {
  storeList = await loadStoreList();
  // Vérifie que c'est un tableau pour éviter les erreurs .map()
  stores = Array.isArray(storeList) ? storeList.map((s) => s.name) : [];
  // Rafraîchit éventuellement l'écran actuel si on est déjà dans l'admin
  if (currentAppState === 'adminPanel') {
    renderAdminPanel();
  }
}

// ----- Gestion dynamique des boutiques et des codes -----
// Nous stockons désormais la liste des boutiques et leurs codes dans le localStorage.
// Ceci permet d'ajouter, supprimer ou modifier des boutiques via l'interface admin et de
// persister ces informations entre les sessions. Chaque entrée contient un nom de boutique
// et le code d'accès associé.

/**
 * Ancienne fonction de chargement des boutiques depuis le localStorage. Elle est conservée
 * comme secours en cas d'erreur de connexion à Supabase. Si aucune liste n'est trouvée,
 * renvoie une liste par défaut avec des codes simples. Chaque objet a la forme :
 * { name: string, code: string }.
 */
function loadStoreListLocal() {
  try {
    const data = localStorage.getItem('iccStoreList');
    if (data) {
      const parsed = JSON.parse(data);
      // vérifie que la structure est correcte
      if (Array.isArray(parsed) && parsed.every((item) => item.name && item.code)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erreur de chargement des boutiques :', e);
  }
  // liste par défaut avec des codes génériques
  return [
    { name: 'Disney Store', code: '1234' },
    { name: 'Disney & CO', code: '5678' },
    { name: 'Emporium', code: '91011' },
  ];
}

/**
 * Sauvegarde la liste des boutiques dans le localStorage.
 * @param {Array<{name: string, code: string}>} list
 */
function saveStoreListLocal(list) {
  try {
    localStorage.setItem('iccStoreList', JSON.stringify(list));
  } catch (e) {
    console.error('Erreur d\'enregistrement des boutiques :', e);
  }
}

// Liste dynamique des boutiques (objet {id, name, code})
// Initialisée dans initStoreList()
// let storeList et let stores sont désormais déclarées en haut après l'intégration Supabase

/**
 * Renvoie le code associé à une boutique donnée.
 * @param {string} storeName
 */
function getStoreCode(storeName) {
  const found = storeList.find((s) => s.name === storeName);
  return found ? found.code : '';
}

// Mot de passe admin pour accéder au panneau de gestion. Vous pouvez le modifier à votre convenance.
const ADMIN_PASSWORD = 'admin123';

// Variable globale pour stocker la boutique sélectionnée
let selectedStore = '';

// Indique si l'historique a déjà été sauvegardé lors de la session courante
let hasSavedHistory = false;

// Liste des éléments à vérifier. Chaque objet contient :
// id          : identifiant unique (ne pas modifier lors de changements d'ordre)
// title       : titre affiché sur la carte
// icon        : emoji représentatif
// description : explications sur ce qu'il faut vérifier
const checkItems = [
  {
    id: 'deposit',
    title: 'Rapports dépôt',
    icon: '📄',
    description:
      "Vérifiez que les rapports de dépôt sont complétés chaque jour et signés par la personne en charge. Assurez-vous que les totaux correspondent au fonds de caisse et qu'ils sont archivés correctement.",
  },
  {
    id: 'fdc',
    title: 'Suivi des FDC',
    icon: '🧾',
    description:
      "Examinez le formulaire de suivi des fonds de caisse (FDC). Les totaux doivent être exacts, les signatures présentes et les justificatifs attachés.",
  },
  {
    id: 'coffre',
    title: 'Suivi du coffre',
    icon: '🔐',
    description:
      "Contrôlez le formulaire du coffre : chaque entrée et sortie doit être enregistrée. Vérifiez les signatures et la cohérence des montants.",
  },
  {
    id: 'cles',
    title: 'Suivi des clés',
    icon: '🔑',
    description:
      "Vérifiez que la liste des clés détenues est à jour. Notez qui détient quelle clé et assurez-vous que les mouvements sont consignés.",
  },
  {
    id: 'prix',
    title: 'Changement de prix',
    icon: '💰',
    description:
      "Assurez-vous que tous les changements de prix sont documentés et autorisés. Chaque modification doit être signée et justifiée.",
  },
  {
    id: 'shopping',
    title: 'Shopping & Pick-up',
    icon: '🛒',
    description:
      "Contrôlez que les formulaires de shopping et pick-up sont correctement remplis. Les justificatifs (tickets, factures) doivent être attachés.",
  },
  {
    id: 'inventaireCles',
    title: 'Inventaire des clés',
    icon: '🗝️',
    description:
      "Vérifiez que l'inventaire des clés est actualisé et que toutes les clés sont présentes. Consignez toute anomalie.",
  },
  {
    id: 'auditCaisse',
    title: 'Audits de caisse',
    icon: '🧮',
    description:
      "Contrôlez les audits de caisse hebdomadaires : comparez les montants déposés avec les ventes enregistrées et identifiez toute différence.",
  },
  {
    id: 'materiel',
    title: 'Conformité du matériel',
    icon: '🖥️',
    description:
      "Contrôlez que tout le matériel est conforme (scanners, terminaux, etc.). Vérifiez l'étiquetage, l'état général et signalez toute défaillance.",
  },
];

// Statut possible pour chaque élément
const STATUS = {
  TODO: 'todo',
  DONE: 'done',
  ERROR: 'error',
};

// États de l'application (scène affichée)
const APP_STATE = {
  PRECHECK: 'precheck',
  START: 'start',
  CHECKLIST: 'checklist',
  SUMMARY: 'summary',
};

// Stockage des réponses de l'utilisateur. La clé est l'id de l'item,
// la valeur contient le statut et les commentaires.
let userResponses = {};
// État actuel de l'application
let currentAppState = APP_STATE.START;

// Informations saisies par l'utilisateur avant le contrôle
let personName = '';
let verificationDate = '';

// Variables pour la période de vérification calculée (dimanche dernier -> samedi)
let periodStart = '';
let periodEnd = '';

// ================= Vérifications et historique en Supabase ==================
//
// Afin de conserver un historique des checklists indépendamment du navigateur,
// nous enregistrons chaque vérification dans la table "verifications" de Supabase.
// Chaque enregistrement comporte l'ID et le nom de la boutique, le prénom de la
// personne ayant réalisé le contrôle, la date du contrôle, la période couverte,
// les résultats détaillés de la checklist (au format JSON) et un commentaire
// éventuel. La fonction `enregistrerVerification` effectue cette insertion.

/**
 * Enregistre une vérification dans Supabase.
 *
 * @param {number|null} boutiqueId - l'identifiant de la boutique (peut être null si absent)
 * @param {string} nomBoutique - le nom de la boutique
 * @param {string} verificateur - prénom de la personne ayant réalisé l'audit
 * @param {string} date - date de l'audit (format ISO AAAA-MM-JJ)
 * @param {string} periodeCouverte - période couverte (ex: "27/07/2025 au 02/08/2025")
 * @param {Object} resultats - objet JSON contenant les réponses de la checklist
 * @param {string} commentaire - commentaire global éventuel
 */
async function enregistrerVerification(boutiqueId, nomBoutique, verificateur, date, periodeCouverte, resultats, commentaire) {
  try {
    const { error } = await supabase.from('verifications').insert([
      {
        boutique_id: boutiqueId,
        nom_boutique: nomBoutique,
        verificateur: verificateur,
        date: date,
        periode_couverte: periodeCouverte,
        resultats: resultats,
        commentaire: commentaire || '',
      },
    ]);
    if (error) {
      console.error('Erreur lors de l\'enregistrement de la vérification dans Supabase :', error);
    }
  } catch (err) {
    console.error('Exception lors de l\'enregistrement de la vérification dans Supabase :', err);
  }
}

/**
 * Récupère les dernières vérifications pour une boutique donnée depuis Supabase.
 *
 * @param {number} storeId - l'identifiant de la boutique
 * @param {number} limit - nombre maximal d'entrées à retourner (facultatif)
 * @returns {Promise<Array>} - tableau d'objets de vérifications ou [] en cas d'erreur
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
 * Récupère la vérification la plus récente pour une boutique donnée.
 * @param {number} storeId - identifiant de la boutique
 * @returns {Promise<Object|null>} - l'objet de vérification le plus récent ou null s'il n'existe pas
 */
async function getLatestVerification(storeId) {
  const verifs = await fetchVerificationsForStore(storeId, 1);
  return (Array.isArray(verifs) && verifs.length > 0) ? verifs[0] : null;
}

/**
 * Récupère une vérification pour une boutique et une date précises.
 * @param {number} storeId - identifiant de la boutique
 * @param {string} date - date au format ISO AAAA-MM-JJ
 * @returns {Promise<Object|null>} - l'objet de vérification correspondant ou null si aucun
 */
async function getVerificationByDate(storeId, date) {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('boutique_id', storeId)
      .eq('date', date);
    if (error) {
      console.error('Erreur lors de la récupération de la vérification par date :', error);
      return null;
    }
    return (Array.isArray(data) && data.length > 0) ? data[0] : null;
  } catch (err) {
    console.error('Exception lors de la récupération de la vérification par date :', err);
    return null;
  }
}

// ================== Gestion de l'historique ==================

/*
  Charge l'historique depuis le localStorage. Les entrées sont
  enregistrées sous forme de tableau d'objets contenant :
    - store       : nom de la boutique
    - name        : prénom de la personne ayant réalisé le contrôle
    - date        : date de vérification (format JJ-MM-AAAA)
    - periodStart : date de début de la période (format JJ/MM/AAAA)
    - periodEnd   : date de fin de la période (format JJ/MM/AAAA)

  Retourne un tableau vide si aucun historique n'est trouvé.
*/
function loadHistory() {
  try {
    const data = localStorage.getItem('iccHistory');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    // En cas d'erreur (JSON invalide), réinitialise l'historique
    console.error('Erreur de chargement de l\'historique :', e);
    return [];
  }
}

/*
  Retourne l'entrée la plus récente pour une boutique donnée.
  On compare les dates au format JJ-MM-AAAA pour déterminer la plus grande.
  Si aucune entrée n'existe, retourne null.
*/
function findLatestForStore(store) {
  if (!store) return null;
  const history = loadHistory().filter((h) => h.store === store);
  if (history.length === 0) return null;
  // Trouve l'entrée avec la date la plus récente. Les dates sont en format JJ-MM-AAAA.
  return history.reduce((latest, entry) => {
    if (!latest) return entry;
    return entry.date > latest.date ? entry : latest;
  }, null);
}

/*
  Recherche une entrée d'historique correspondant à une boutique et une date données.
  Retourne l'objet trouvé ou null si aucune correspondance.
*/
function findEntry(store, date) {
  if (!store || !date) return null;
  const history = loadHistory();
  return history.find((h) => h.store === store && h.date === date) || null;
}

/*
  Affiche les résultats d'une entrée historique existante sans permettre de modifier la checklist.
  Cette fonction recharge les variables globales à partir de l'entrée et appelle renderSummary().
*/
function viewExistingEntry(entry) {
  if (!entry) return;
  // Restaure les informations de l'entrée
  personName = entry.name;
  verificationDate = entry.date;
  selectedStore = entry.store;
  periodStart = entry.periodStart;
  periodEnd = entry.periodEnd;
  // Restaure les réponses de l'utilisateur à partir de l'entrée
  userResponses = entry.results || {};
  // Évite d'enregistrer à nouveau cette entrée à l'enregistrement du résumé
  hasSavedHistory = true;
  // Affiche le résumé directement
  renderSummary();
}

/*
  Affiche les résultats d'une vérification existante provenant de Supabase. Cette fonction
  utilise l'enregistrement complet retourné par la table "verifications" et recharge
  les variables globales avant d'appeler renderSummary().
*/
function viewExistingVerification(verification) {
  if (!verification) return;
  // Restaure les informations à partir de l'enregistrement Supabase
  personName = verification.verificateur;
  verificationDate = verification.date;
  // Trouve le nom de la boutique à partir de l'ID ; si absent, utilise le champ nom_boutique
  const storeObj = storeList.find((s) => s.id === verification.boutique_id);
  selectedStore = storeObj ? storeObj.name : verification.nom_boutique;
  // Extraire la période couverte en deux parties si disponible
  const periodParts = (verification.periode_couverte || '').split(' au ');
  periodStart = periodParts[0] || '';
  periodEnd = periodParts[1] || '';
  // Restaure les réponses détaillées
  userResponses = verification.resultats || {};
  hasSavedHistory = true;
  renderSummary();
}

/*
  Sauvegarde une entrée d'historique dans le localStorage. L'entrée
  doit contenir store, name, date, periodStart, periodEnd. Les
  entrées existantes sont conservées. Enregistrements multiples
  peuvent coexister pour un même magasin.
*/
function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.push(entry);
  try {
    localStorage.setItem('iccHistory', JSON.stringify(history));
  } catch (e) {
    console.error('Erreur d\'enregistrement de l\'historique :', e);
  }
}

/*
  Crée un élément DOM affichant l'historique pour la boutique
  actuellement sélectionnée. Affiche jusqu'à cinq entrées les plus
  récentes (ordre du tableau). Si aucune donnée n'est trouvée pour
  cette boutique, retourne null.
*/
async function renderHistory() {
  if (!selectedStore) return null;
  // On récupère les vérifications uniquement depuis Supabase
  if (!selectedStore) return null;
  let toShow = [];
  try {
    const storeObj = storeList.find((s) => s.name === selectedStore);
    const storeId = storeObj ? storeObj.id : null;
    if (storeId) {
      const verifs = await fetchVerificationsForStore(storeId, 5);
      toShow = verifs.map((v) => ({
        name: v.verificateur,
        date: v.date,
        periodStart: (v.periode_couverte || '').split(' au ')[0],
        periodEnd: (v.periode_couverte || '').split(' au ')[1],
      }));
    }
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'historique Supabase :', err);
  }
  // S'il n'y a aucune entrée, on ne retourne rien
  if (!toShow || toShow.length === 0) {
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
  toShow.forEach((entry) => {
    const p = document.createElement('p');
    p.style.fontSize = '0.9rem';
    p.style.marginBottom = '0.3rem';
    p.innerHTML =
      `<strong>Checklist effectuée par ${entry.name}</strong> le ${entry.date} (Période du ${entry.periodStart} au ${entry.periodEnd})`;
    wrapper.appendChild(p);
  });
  return wrapper;
}

// ------------------ Fonctions pour la période ------------------ //
// Formate une date en JJ/MM/AAAA pour l'affichage
function formatDateFR(date) {
  return date.toLocaleDateString('fr-FR');
}

// Calcule la période de vérification (du dimanche précédent au samedi)
// à partir d'une date de contrôle (supposée un dimanche).
function computeWeekPeriod(dateString) {
  if (!dateString) return ['', ''];
  // Parse la date saisie en local (ajout de T00:00:00 pour éviter le décalage UTC)
  const date = new Date(`${dateString}T00:00:00`);
  // Crée des dates distinctes pour éviter de modifier l'original
  const start = new Date(date);
  start.setDate(start.getDate() - 7);
  const end = new Date(date);
  end.setDate(end.getDate() - 1);
  return [formatDateFR(start), formatDateFR(end)];
}

const appContainer = document.getElementById('app');

// ------------------ Fonctions utilitaires ------------------ //

// Calcule la progression en pourcentage (0 à 100)
function computeProgress() {
  const total = checkItems.length;
  let completed = 0;
  checkItems.forEach((item) => {
    if (userResponses[item.id] && userResponses[item.id].status !== STATUS.TODO) {
      completed += 1;
    }
  });
  return Math.round((completed / total) * 100);
}

// Retourne la classe de statut pour un item donné
function getStatusClass(itemId) {
  const response = userResponses[itemId];
  if (!response) return STATUS.TODO;
  return response.status;
}

// Met à jour la barre de progression et son libellé
function updateProgressCircle() {
  const progress = computeProgress();
  const circle = document.querySelector('.progress-circle');
  if (circle) {
    circle.style.background = `conic-gradient(var(--secondary-color) 0% ${progress}%, #e0e7ff ${progress}% 100%)`;
    const span = circle.querySelector('span');
    if (span) {
      span.textContent = `${progress}%`;
    }
  }
}

// Ouvre une modale avec les détails et un formulaire pour l'item sélectionné
function openModal(itemId) {
  const item = checkItems.find((i) => i.id === itemId);
  if (!item) return;
  // Crée l'overlay de modale
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Modale elle-même
  const modal = document.createElement('div');
  modal.className = 'modal';
  // En-tête
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h2 = document.createElement('h2');
  h2.textContent = item.title;
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
  p.textContent = item.description;
  content.appendChild(p);
  // Sélecteur de statut
  const statusFieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Statut :';
  statusFieldset.appendChild(legend);
  const options = [
    { value: STATUS.DONE, label: 'Conforme' },
    { value: STATUS.ERROR, label: 'Non conforme' },
  ];
  options.forEach(({ value, label }) => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    // on inclut l'id de l'item pour éviter les doublons dans le DOM
    const radioId = `status-${item.id}-${value}`;
    radio.name = 'status';
    radio.id = radioId;
    radio.value = value;
    // Pré-sélectionne l'option existante si disponible
    if (userResponses[item.id] && userResponses[item.id].status === value) {
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
  // Zone de commentaires
  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Commentaire (optionnel) :';
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Vos observations...';
  if (userResponses[item.id] && userResponses[item.id].comment) {
    textarea.value = userResponses[item.id].comment;
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
    // Récupère la valeur du radio sélectionné
    const selected = statusFieldset.querySelector('input[name="status"]:checked');
    if (selected) {
      // Mettez à jour le userResponses
      userResponses[item.id] = {
        status: selected.value,
        comment: textarea.value.trim(),
      };
      // Mise à jour de la progression et du rendu
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
  // Affiche la modale
  setTimeout(() => overlay.classList.add('active'), 10);
}

// Affiche l'écran d'accueil
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
  // Message dynamique avec nom, date et période si renseignés
  let message = 'Préparez-vous à vérifier vos documents et procédures pour cette semaine.';
  introText.textContent = '';
  // Si un nom a été saisi, on personnalise le message et calcule la période
  if (personName) {
    // Calcule la période de vérification à partir de la date saisie
    if (verificationDate) {
      [periodStart, periodEnd] = computeWeekPeriod(verificationDate);
    }
    // Construit le message personnalisé incluant la boutique
    if (selectedStore) {
      message = `Bonjour ${personName}, commencez votre vérification pour ${selectedStore}`;
    } else {
      message = `Bonjour ${personName}, commencez votre vérification`;
    }
    introText.textContent = message;
  } else {
    // Aucun prénom : message générique
    introText.textContent = message;
  }
  const startBtn = document.createElement('button');
  startBtn.className = 'primary-button';
  startBtn.textContent = 'Démarrer la checklist';
  startBtn.addEventListener('click', () => {
    renderChecklist();
  });
  // Ajout des éléments à la carte dans l'ordre souhaité
  introCard.appendChild(introTitle);
  introCard.appendChild(introText);
  // Si la période est disponible, ajoute une ligne après le texte
  if (personName && periodStart && periodEnd) {
    const periodInfo = document.createElement('p');
    periodInfo.style.marginTop = '0.3rem';
    periodInfo.style.fontSize = '0.9rem';
    periodInfo.style.color = 'var(--muted-color)';
    periodInfo.textContent = `Période à couvrir : du ${periodStart} au ${periodEnd}`;
    introCard.appendChild(periodInfo);
  }
  // Affiche l'historique pour la boutique sélectionnée si disponible
  try {
    const historyElem = await renderHistory();
    if (historyElem) {
      introCard.appendChild(historyElem);
    }
  } catch (err) {
    console.error('Erreur lors de l\'affichage de l\'historique :', err);
  }
  introCard.appendChild(startBtn);
  appContainer.appendChild(introCard);
}

// Affiche le formulaire initial pour saisir le prénom et la date
function renderPreCheck() {
  currentAppState = APP_STATE.PRECHECK;
  appContainer.innerHTML = '';
  const formCard = document.createElement('div');
  formCard.className = 'card';
  formCard.style.flexDirection = 'column';
  formCard.style.alignItems = 'stretch';
  formCard.style.maxWidth = '500px';
  formCard.style.margin = '0 auto';
  // Titre
  const title = document.createElement('h2');
  title.textContent = 'Informations avant la vérification';
  title.style.marginBottom = '1rem';
  // La liste des boutiques est déjà chargée via initStoreList().
  // stores et storeList sont mis à jour globalement lors des opérations d'administration.

  // Champ boutique (menu déroulant)
  const storeLabel = document.createElement('label');
  storeLabel.textContent = 'Boutique :';
  storeLabel.style.marginTop = '0.5rem';
  const storeSelect = document.createElement('select');
  storeSelect.style.marginTop = '0.25rem';
  storeSelect.style.padding = '0.6rem';
  storeSelect.style.borderRadius = 'var(--border-radius)';
  storeSelect.style.border = '1px solid #ccc';
  // Option vide par défaut
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Choisissez une boutique';
  storeSelect.appendChild(defaultOption);
  stores.forEach((store) => {
    const opt = document.createElement('option');
    opt.value = store;
    opt.textContent = store;
    storeSelect.appendChild(opt);
  });

  // Champ code d'accès pour la boutique sélectionnée
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
  // Message d'erreur pour le code
  const codeMessage = document.createElement('p');
  codeMessage.style.fontSize = '0.85rem';
  codeMessage.style.color = 'var(--error-color)';
  codeMessage.style.marginTop = '0.25rem';
  codeMessage.style.display = 'none';
  codeMessage.textContent = 'Code incorrect';

  // Élément pour afficher la dernière vérification de la boutique
  const latestInfo = document.createElement('p');
  latestInfo.style.marginTop = '0.4rem';
  latestInfo.style.fontSize = '0.85rem';
  latestInfo.style.color = 'var(--muted-color)';
  latestInfo.style.display = 'none';

  // Bouton pour consulter les résultats existants
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
  continueBtn.addEventListener('click', () => {
    personName = nameInput.value.trim();
    verificationDate = dateInput.value;
    selectedStore = storeSelect.value;
    // Réinitialise le flag de sauvegarde d'historique pour cette session
    hasSavedHistory = false;
    renderStart();
  });
  // Activer le bouton si les trois champs sont remplis
  // La fonction de validation est asynchrone afin de consulter Supabase pour l'historique
  const checkFormValidity = async () => {
    const selectedVal = storeSelect.value;
    // Affiche ou masque le champ code selon qu'une boutique est choisie
    if (selectedVal) {
      codeLabel.style.display = 'block';
      codeInput.style.display = 'block';
    } else {
      codeLabel.style.display = 'none';
      codeInput.style.display = 'none';
      codeMessage.style.display = 'none';
      codeInput.value = '';
    }
    // Vérification du code d'accès
    let codeOk = true;
    if (selectedVal) {
      const expectedCode = getStoreCode(selectedVal);
      codeOk = codeInput.value === expectedCode;
      if (codeInput.value === '') {
        // Pas encore saisi, pas d'erreur
        codeMessage.style.display = 'none';
      } else if (!codeOk) {
        codeMessage.style.display = 'block';
      } else {
        codeMessage.style.display = 'none';
      }
    }
    let duplicate = null;
    let latest = null;
    // Si une boutique est sélectionnée, on interroge Supabase pour voir s'il existe une
    // vérification pour la date sélectionnée et pour récupérer la dernière vérification
    if (selectedVal) {
      const storeObj = storeList.find((s) => s.name === selectedVal);
      const storeId = storeObj ? storeObj.id : null;
      if (storeId) {
        if (dateInput.value) {
          duplicate = await getVerificationByDate(storeId, dateInput.value);
        }
        latest = await getLatestVerification(storeId);
      }
    }
    // Pour des raisons de sécurité, on n'affiche le bouton « consulter les résultats » que si
    // le code d'accès est correct et qu'une vérification existe pour cette date.
    if (duplicate && codeOk) {
      continueBtn.disabled = true;
      viewResultsBtn.style.display = 'inline-block';
      latestInfo.style.display = 'block';
      // Mise à jour de la dernière vérification via Supabase
      if (latest) {
        const periodParts = (latest.periode_couverte || '').split(' au ');
        const pStart = periodParts[0] || '';
        const pEnd = periodParts[1] || '';
        latestInfo.textContent = `Dernière vérification le ${latest.date} par ${latest.verificateur} (Période couverte du ${pStart} au ${pEnd})`;
      }
      viewResultsBtn.onclick = () => viewExistingVerification(duplicate);
    } else {
      // Pas de doublon ou code incorrect : masque le bouton consulter
      viewResultsBtn.style.display = 'none';
      // Met à jour la dernière vérification si une boutique est sélectionnée (affichée même si code pas encore saisi)
      if (selectedVal) {
        if (latest) {
          const periodParts = (latest.periode_couverte || '').split(' au ');
          const pStart = periodParts[0] || '';
          const pEnd = periodParts[1] || '';
          latestInfo.style.display = 'block';
          latestInfo.textContent = `Dernière vérification le ${latest.date} par ${latest.verificateur} (Période couverte du ${pStart} au ${pEnd})`;
        } else {
          latestInfo.style.display = 'block';
          latestInfo.textContent = 'Aucune vérification précédente.';
        }
      } else {
        latestInfo.style.display = 'none';
      }
    }
    // Active ou désactive le bouton continuer selon les champs remplis et le code valide
    continueBtn.disabled =
      nameInput.value.trim() === '' || dateInput.value === '' || selectedVal === '' || !codeOk;
  };
  // Les gestionnaires d'événements appellent la fonction asynchrone sans attendre le résultat
  nameInput.addEventListener('input', () => { checkFormValidity(); });
  dateInput.addEventListener('input', () => { checkFormValidity(); });
  storeSelect.addEventListener('change', () => { checkFormValidity(); });
  codeInput.addEventListener('input', () => { checkFormValidity(); });
  // Assemblage
  formCard.appendChild(title);
  formCard.appendChild(storeLabel);
  formCard.appendChild(storeSelect);
  formCard.appendChild(latestInfo);
  formCard.appendChild(viewResultsBtn);
  // Ajout du champ code boutique (caché par défaut)
  formCard.appendChild(codeLabel);
  formCard.appendChild(codeInput);
  formCard.appendChild(codeMessage);
  formCard.appendChild(nameLabel);
  formCard.appendChild(nameInput);
  formCard.appendChild(dateLabel);
  formCard.appendChild(dateInput);
  formCard.appendChild(continueBtn);
  // Bouton admin pour accéder au panneau de gestion
  const adminBtn = document.createElement('button');
  adminBtn.className = 'primary-button';
  adminBtn.textContent = 'Admin';
  adminBtn.style.marginTop = '0.75rem';
  adminBtn.addEventListener('click', () => {
    renderAdminLogin();
  });
  formCard.appendChild(adminBtn);
  appContainer.appendChild(formCard);

  // Mise à jour initiale de la ligne de dernière vérification
  // Cela permet d'afficher la dernière entrée si une boutique est pré-sélectionnée (cas improbable)
  // On appelle la fonction asynchrone sans attendre la fin
  checkFormValidity();
}

// Affiche la liste des éléments à vérifier
function renderChecklist() {
  currentAppState = APP_STATE.CHECKLIST;
  appContainer.innerHTML = '';
  // Progression circulaire
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  const progressCircle = document.createElement('div');
  progressCircle.className = 'progress-circle';
  const progressNumber = document.createElement('span');
  progressNumber.textContent = '0%';
  progressCircle.appendChild(progressNumber);
  progressContainer.appendChild(progressCircle);
  appContainer.appendChild(progressContainer);
  // Liste des items
  checkItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    // Classe de statut
    const statusClass = getStatusClass(item.id);
    // Applique également la classe de statut à la carte pour un style conditionnel (bordure colorée)
    card.classList.add(statusClass);
    // Icône + titre
    const info = document.createElement('div');
    info.className = 'info';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = item.icon;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = item.title;
    info.appendChild(iconSpan);
    info.appendChild(titleSpan);
    // Statut
    const statusSpan = document.createElement('span');
    statusSpan.className = `status ${statusClass}`;
    statusSpan.textContent =
      statusClass === STATUS.TODO
        ? 'À faire'
        : statusClass === STATUS.DONE
        ? 'OK'
        : 'Non conf.';
    // On attache tout
    card.appendChild(info);
    card.appendChild(statusSpan);
    card.addEventListener('click', () => {
      openModal(item.id);
    });
    appContainer.appendChild(card);
  });
  // Bouton de revue finale
  const allCompleted = computeProgress() === 100;
  const finalBtn = document.createElement('button');
  finalBtn.className = 'primary-button';
  finalBtn.textContent = 'Voir le résultat';
  finalBtn.disabled = !allCompleted;
  finalBtn.style.marginTop = '1.5rem';
  finalBtn.addEventListener('click', () => {
    renderSummary();
  });
  appContainer.appendChild(finalBtn);
  // Met à jour le cercle de progression
  updateProgressCircle();
}

// Affiche la page de résumé final
async function renderSummary() {
  currentAppState = APP_STATE.SUMMARY;
  appContainer.innerHTML = '';
  // Sauvegarde l'entrée sur Supabase si ce n'est pas déjà fait
  if (!hasSavedHistory && personName && verificationDate && selectedStore) {
    // Calcule la période de vérification si elle n'a pas été définie (sécurité)
    if (!periodStart || !periodEnd) {
      [periodStart, periodEnd] = computeWeekPeriod(verificationDate);
    }
    try {
      const storeObj = storeList.find((s) => s.name === selectedStore);
      const storeId = storeObj ? storeObj.id : null;
      const nomBoutique = storeObj ? storeObj.name : selectedStore;
      const periodeCouverte = periodStart && periodEnd ? `${periodStart} au ${periodEnd}` : '';
      await enregistrerVerification(
        storeId,
        nomBoutique,
        personName,
        verificationDate,
        periodeCouverte,
        JSON.parse(JSON.stringify(userResponses)),
        ''
      );
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la vérification sur Supabase :', err);
    }
    hasSavedHistory = true;
  }
  // Titre
  const title = document.createElement('h2');
  title.textContent = 'Résultats de la vérification';
  appContainer.appendChild(title);
  // Sous-titre avec prénom et date
  if (personName) {
    const subtitle = document.createElement('p');
    subtitle.style.marginBottom = '0.5rem';
    subtitle.style.color = 'var(--muted-color)';
    // Inclut également la boutique sélectionnée
    let subtitleText = `Vérification effectuée par ${personName}`;
    if (selectedStore) subtitleText += ` pour ${selectedStore}`;
    if (verificationDate) subtitleText += ` le ${verificationDate}`;
    subtitle.textContent = subtitleText;
    appContainer.appendChild(subtitle);
  }
  // Période de vérification si disponible
  if (periodStart && periodEnd) {
    const periodInfo = document.createElement('p');
    periodInfo.style.marginBottom = '0.5rem';
    periodInfo.style.color = 'var(--muted-color)';
    periodInfo.textContent = `Période vérifiée : du ${periodStart} au ${periodEnd}`;
    appContainer.appendChild(periodInfo);
  }
  // Progression: afficher "Checklist complétée" si 100 %, sinon le pourcentage
  const progress = computeProgress();
  const progressText = document.createElement('p');
  progressText.style.fontSize = '1.2rem';
  progressText.style.margin = '0.5rem 0 1rem';
  if (progress === 100) {
    progressText.innerHTML = '<strong>Checklist complétée</strong>';
  } else {
    progressText.innerHTML = `<strong>Checklist complétée à ${progress}%</strong>`;
  }
  appContainer.appendChild(progressText);
  // Affiche un message global selon la présence d'erreurs
  const hasError = checkItems.some((item) => userResponses[item.id] && userResponses[item.id].status === STATUS.ERROR);
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
  // Liste des détails
  checkItems.forEach((item) => {
    const response = userResponses[item.id];
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.style.flexDirection = 'column';
    wrapper.style.cursor = 'default';
    // Titre + statut
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.width = '100%';
    const rowLeft = document.createElement('div');
    rowLeft.className = 'info';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = item.icon;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = item.title;
    rowLeft.appendChild(iconSpan);
    rowLeft.appendChild(titleSpan);
    const statusSpan = document.createElement('span');
    const statusClass = response ? response.status : STATUS.TODO;
    statusSpan.className = `status ${statusClass}`;
    // Affiche des libellés clairs selon le statut (pas d'avertissement)
    statusSpan.textContent =
      statusClass === STATUS.DONE
        ? 'OK'
        : statusClass === STATUS.ERROR
        ? 'Non conf.'
        : 'À faire';
    row.appendChild(rowLeft);
    row.appendChild(statusSpan);
    wrapper.appendChild(row);
    // Commentaire s'il existe
    if (response && response.comment) {
      const comment = document.createElement('p');
      comment.style.marginTop = '0.5rem';
      comment.style.fontSize = '0.9rem';
      comment.style.color = varColor(statusClass);
      comment.textContent = `Commentaire : ${response.comment}`;
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

  // Bouton pour envoyer les résultats par mail
  const emailBtn = document.createElement('button');
  emailBtn.className = 'primary-button';
  emailBtn.textContent = 'Envoyer les résultats par mail';
  emailBtn.style.marginTop = '0.75rem';
  emailBtn.addEventListener('click', () => {
    sendResultsByEmail();
  });
  appContainer.appendChild(emailBtn);
}

// Fonction utilitaire pour donner une couleur à un commentaire selon le statut
function varColor(status) {
  switch (status) {
    case STATUS.DONE:
      return getComputedStyle(document.documentElement).getPropertyValue('--accent-color');
    case STATUS.ERROR:
      return getComputedStyle(document.documentElement).getPropertyValue('--error-color');
    default:
      return getComputedStyle(document.documentElement).getPropertyValue('--muted-color');
  }
}

// Génère un lien mailto avec les résultats et ouvre le client de messagerie
function sendResultsByEmail() {
  const progress = computeProgress();
  const completeText = progress === 100 ? 'Checklist complétée' : `Checklist complétée à ${progress}%`;
  // Sujet inclut la boutique si renseignée
  let subject = 'Résultats checklist ICC';
  if (selectedStore) subject += ` - ${selectedStore}`;
  if (verificationDate) subject += ` - ${verificationDate}`;
  let body = '';
  if (personName) {
    body += `Vérification effectuée par ${personName}`;
    if (verificationDate) body += ` le ${verificationDate}`;
    body += '\n\n';
  }
  body += `${completeText}\n\n`;
  checkItems.forEach((item) => {
    const response = userResponses[item.id];
    const statusText = response
      ? response.status === STATUS.DONE
        ? 'Conforme'
        : 'Non conforme'
      : 'Non vérifié';
    body += `- ${item.title} : ${statusText}`;
    if (response && response.comment) {
      body += ` (Commentaire : ${response.comment})`;
    }
    body += '\n';
  });
  body += '\n';
  body += 'Cordialement,';
  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // Ouvre le lien mailto pour composer l'email
  window.location.href = mailtoLink;
}

// ------------------ Administration ------------------ //

/*
  Affiche un écran de connexion pour l'administrateur. L'utilisateur doit saisir
  le mot de passe admin pour accéder au panneau de gestion des boutiques.
*/
function renderAdminLogin() {
  currentAppState = 'adminLogin';
  appContainer.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.style.flexDirection = 'column';
  card.style.maxWidth = '400px';
  card.style.margin = '0 auto';
  card.style.textAlign = 'center';
  const title = document.createElement('h2');
  title.textContent = 'Connexion administrateur';
  title.style.marginBottom = '1rem';
  const label = document.createElement('label');
  label.textContent = 'Mot de passe :';
  label.style.marginTop = '0.5rem';
  label.style.alignSelf = 'flex-start';
  const pwdInput = document.createElement('input');
  pwdInput.type = 'password';
  pwdInput.placeholder = 'Mot de passe admin';
  pwdInput.style.marginTop = '0.25rem';
  pwdInput.style.padding = '0.6rem';
  pwdInput.style.borderRadius = 'var(--border-radius)';
  pwdInput.style.border = '1px solid #ccc';
  pwdInput.style.width = '100%';
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.justifyContent = 'flex-end';
  btnContainer.style.gap = '0.5rem';
  btnContainer.style.marginTop = '1rem';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'primary-button';
  cancelBtn.textContent = 'Retour';
  cancelBtn.addEventListener('click', () => {
    // Retour à l'écran de pré-sélection
    renderPreCheck();
  });
  const loginBtn = document.createElement('button');
  loginBtn.className = 'primary-button';
  loginBtn.textContent = 'Se connecter';
  loginBtn.addEventListener('click', () => {
    if (pwdInput.value === ADMIN_PASSWORD) {
      renderAdminPanel();
    } else {
      alert('Mot de passe incorrect');
      pwdInput.value = '';
    }
  });
  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(loginBtn);
  card.appendChild(title);
  card.appendChild(label);
  card.appendChild(pwdInput);
  card.appendChild(btnContainer);
  appContainer.appendChild(card);
}

/*
  Affiche le panneau d'administration permettant de gérer la liste des boutiques
  (ajout, suppression, modification des codes). Les modifications sont
  immédiatement persistées dans le localStorage et prises en compte dans
  l'application.
*/
function renderAdminPanel() {
  currentAppState = 'adminPanel';
  appContainer.innerHTML = '';
  // Crée un conteneur principal pour l'interface d'administration. On part d'une
  // « card » pour conserver le style arrondi et ombré, mais on annule certaines
  // propriétés de flex qui ne sont pas adaptées à une disposition verticale.
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  // Force la disposition en colonne et supprime le centrage/espacement par défaut
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.justifyContent = 'flex-start';
  // Laisse la carte occuper toute la largeur disponible jusqu'à 900 px pour mieux
  // gérer les noms longs. On met margin auto pour la centrer.
  wrapper.style.maxWidth = '900px';
  wrapper.style.margin = '0 auto';
  const title = document.createElement('h2');
  title.textContent = 'Gestion des boutiques';
  title.style.marginBottom = '1rem';
  wrapper.appendChild(title);
  // Section listant les boutiques existantes
  storeList.forEach((store, index) => {
    const row = document.createElement('div');
    // Utilise un système de grille pour mieux aligner les colonnes et éviter que
    // les longs noms ne décalent les boutons. La grille comporte quatre colonnes :
    // nom, code, enregistrer, supprimer. Les deux premières colonnes prennent
    // chacune deux fractions de l'espace disponible.
    row.style.display = 'grid';
    // Alloue plus d'espace à la colonne du nom (3 fractions) afin de réduire les
    // retours à la ligne lorsque le nom est long. Les autres colonnes conservent
    // des proportions cohérentes.
    row.style.gridTemplateColumns = '3fr 2fr auto auto';
    row.style.alignItems = 'center';
    row.style.columnGap = '0.5rem';
    row.style.marginBottom = '0.5rem';
    // Nom de la boutique
    const nameSpan = document.createElement('span');
    nameSpan.textContent = store.name;
    nameSpan.style.fontWeight = '600';
    // Champ code modifiable
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.value = store.code;
    codeInput.style.padding = '0.4rem';
    codeInput.style.borderRadius = 'var(--border-radius)';
    codeInput.style.border = '1px solid #ccc';
    // Bouton enregistrer le code
    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary-button';
    saveBtn.textContent = 'Enregistrer';
    saveBtn.addEventListener('click', () => {
      const newCode = codeInput.value.trim();
      if (newCode === '') {
        alert('Le code ne peut pas être vide.');
        return;
      }
      storeList[index].code = newCode;
      // Met à jour le code dans Supabase et localement
      updateBoutique(storeList[index].id, newCode);
      saveStoreListLocal(storeList);
      // L'alerte sera affichée par updateBoutique
    });
    // Bouton supprimer la boutique
    const delBtn = document.createElement('button');
    delBtn.className = 'primary-button';
    delBtn.textContent = 'Supprimer';
    delBtn.style.background = 'var(--error-color)';
    delBtn.addEventListener('click', () => {
      const confirmDelete = confirm('Supprimer la boutique "' + store.name + '" ?');
      if (confirmDelete) {
        const removed = storeList.splice(index, 1)[0];
        // Supprime dans Supabase et met à jour localement
        if (removed && removed.id) {
          supprimerBoutique(removed.id);
        }
        saveStoreListLocal(storeList);
        // Met à jour les noms disponibles
        stores = Array.isArray(storeList) ? storeList.map((s) => s.name) : [];
        // L'interface admin sera rafraîchie par initStoreList appelé dans supprimerBoutique
      }
    });
    row.appendChild(nameSpan);
    row.appendChild(codeInput);
    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    wrapper.appendChild(row);
  });
  // Ligne pour ajouter une nouvelle boutique
  const addRow = document.createElement('div');
  // Utilise aussi une grille afin d'aligner les colonnes avec les autres lignes (nom, code, bouton)
  addRow.style.display = 'grid';
  // Même principe pour la ligne d'ajout : plus de place pour le nom
  addRow.style.gridTemplateColumns = '3fr 2fr auto';
  addRow.style.alignItems = 'center';
  addRow.style.columnGap = '0.5rem';
  addRow.style.marginTop = '1rem';
  const newNameInput = document.createElement('input');
  newNameInput.type = 'text';
  newNameInput.placeholder = 'Nom de la boutique';
  // Ne pas utiliser flex sur un élément de la grille : la largeur sera gérée par la grille
  newNameInput.style.flex = '';
  newNameInput.style.padding = '0.4rem';
  newNameInput.style.borderRadius = 'var(--border-radius)';
  newNameInput.style.border = '1px solid #ccc';
  const newCodeInput = document.createElement('input');
  newCodeInput.type = 'text';
  newCodeInput.placeholder = 'Code d\'accès';
  // Ne pas utiliser flex sur un élément de la grille : la largeur sera gérée par la grille
  newCodeInput.style.flex = '';
  newCodeInput.style.padding = '0.4rem';
  newCodeInput.style.borderRadius = 'var(--border-radius)';
  newCodeInput.style.border = '1px solid #ccc';
  const addBtn = document.createElement('button');
  addBtn.className = 'primary-button';
  addBtn.textContent = 'Ajouter';
  addBtn.addEventListener('click', () => {
    const nameVal = newNameInput.value.trim();
    const codeVal = newCodeInput.value.trim();
    if (nameVal === '' || codeVal === '') {
      alert('Veuillez saisir un nom et un code.');
      return;
    }
    // Vérifie qu'aucune boutique du même nom n'existe déjà
    if (storeList.some((s) => s.name === nameVal)) {
      alert('Une boutique portant ce nom existe déjà.');
      return;
    }
    // Ajoute la boutique via Supabase. Le rechargement de la liste sera géré
    // par initStoreList appelé après insertion.
    ajouterBoutique(nameVal, codeVal);
    // Met également à jour localement en cas de secours
    storeList.push({ name: nameVal, code: codeVal });
    saveStoreListLocal(storeList);
    // Les champs seront réinitialisés lors du rafraîchissement de l'admin panel
  });
  addRow.appendChild(newNameInput);
  addRow.appendChild(newCodeInput);
  addRow.appendChild(addBtn);
  wrapper.appendChild(addRow);
  // Bouton retour pour quitter le panneau d'admin
  const backBtn = document.createElement('button');
  backBtn.className = 'primary-button';
  backBtn.textContent = 'Retour';
  backBtn.style.marginTop = '1.5rem';
  backBtn.addEventListener('click', () => {
    // recharge la liste mise à jour et revient au formulaire
    renderPreCheck();
  });
  wrapper.appendChild(backBtn);
  appContainer.appendChild(wrapper);
}

// ------------------ Initialisation ------------------ //
// Fonction d'initialisation : charge la liste des boutiques depuis Supabase puis
// affiche le formulaire initial. En isolant cette logique dans une fonction
// asynchrone, on s'assure que `storeList` et `stores` sont bien des tableaux
// avant de tenter de les parcourir. Cela évite les erreurs de type `storeList.map is not a function`.
async function init() {
  await initStoreList();
  renderPreCheck();
}

// Démarre l'application dès que le navigateur a chargé le DOM. On utilise
// `DOMContentLoaded` pour garantir que l'élément `#app` est présent avant
// d'injecter du contenu.
window.addEventListener('DOMContentLoaded', () => {
  init();
});
