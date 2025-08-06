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

// Liste des boutiques disponibles. Permet de choisir pour quel magasin effectuer l'audit.
const stores = ['Disney Store', 'Disney & CO', 'Emporium'];

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
function renderHistory() {
  if (!selectedStore) return null;
  const history = loadHistory().filter((h) => h.store === selectedStore);
  if (history.length === 0) return null;
  // Inverse pour afficher les plus récentes en premier
  history.reverse();
  // Limite à 5 entrées
  const toShow = history.slice(0, 5);
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
function renderStart() {
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
  const historyElem = renderHistory();
  if (historyElem) {
    introCard.appendChild(historyElem);
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
  const checkFormValidity = () => {
    // Vérifie si une entrée existe déjà pour cette boutique et cette date
    const duplicate = storeSelect.value && dateInput.value ? findEntry(storeSelect.value, dateInput.value) : null;
    // Si c'est un doublon, désactive le bouton continuer et affiche le bouton consulter
    if (duplicate) {
      continueBtn.disabled = true;
      viewResultsBtn.style.display = 'inline-block';
      latestInfo.style.display = 'block';
      // Définit le texte pour la dernière vérification si ce n'est pas déjà fait
      const latest = findLatestForStore(storeSelect.value);
      if (latest) {
        latestInfo.textContent = `Dernière vérification le ${latest.date} par ${latest.name} (Période couverte du ${latest.periodStart} au ${latest.periodEnd})`;
      }
      // Affecte l'action au bouton consulter
      viewResultsBtn.onclick = () => viewExistingEntry(duplicate);
    } else {
      // Pas de doublon : masque le bouton consulter
      viewResultsBtn.style.display = 'none';
      // Met à jour la dernière vérification (affichée si une boutique est sélectionnée)
      if (storeSelect.value) {
        const latest = findLatestForStore(storeSelect.value);
        if (latest) {
          latestInfo.style.display = 'block';
          latestInfo.textContent = `Dernière vérification le ${latest.date} par ${latest.name} (Période couverte du ${latest.periodStart} au ${latest.periodEnd})`;
        } else {
          latestInfo.style.display = 'block';
          latestInfo.textContent = 'Aucune vérification précédente.';
        }
      } else {
        latestInfo.style.display = 'none';
      }
      // Active ou désactive le bouton suivant selon les champs remplis
      continueBtn.disabled =
        nameInput.value.trim() === '' || dateInput.value === '' || storeSelect.value === '';
    }
  };
  nameInput.addEventListener('input', checkFormValidity);
  dateInput.addEventListener('input', checkFormValidity);
  storeSelect.addEventListener('change', checkFormValidity);
  // Assemblage
  formCard.appendChild(title);
  formCard.appendChild(storeLabel);
  formCard.appendChild(storeSelect);
  formCard.appendChild(latestInfo);
  formCard.appendChild(viewResultsBtn);
  formCard.appendChild(nameLabel);
  formCard.appendChild(nameInput);
  formCard.appendChild(dateLabel);
  formCard.appendChild(dateInput);
  formCard.appendChild(continueBtn);
  appContainer.appendChild(formCard);

  // Mise à jour initiale de la ligne de dernière vérification
  // Cela permet d'afficher la dernière entrée si une boutique est pré-sélectionnée (cas improbable)
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
function renderSummary() {
  currentAppState = APP_STATE.SUMMARY;
  appContainer.innerHTML = '';
  // Sauvegarde l'entrée d'historique si ce n'est pas déjà fait
  if (!hasSavedHistory && personName && verificationDate && selectedStore) {
    // Appelle le calcul de période si elle n'a pas été définie (sécurité)
    if (!periodStart || !periodEnd) {
      [periodStart, periodEnd] = computeWeekPeriod(verificationDate);
    }
    saveHistoryEntry({
      store: selectedStore,
      name: personName,
      date: verificationDate,
      periodStart,
      periodEnd,
      // Conserve également les résultats détaillés pour consultation ultérieure
      results: JSON.parse(JSON.stringify(userResponses)),
    });
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

// ------------------ Initialisation ------------------ //
// Affiche le formulaire initial par défaut
renderPreCheck();
