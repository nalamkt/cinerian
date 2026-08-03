const TMDB_API_KEY = "f359e4f5496836068edda48527fe8c58";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const STORAGE_KEYS = {
  feed: "cinerian-mvp-feed",
  reactions: "cinerian-mvp-reactions",
  recommendations: "cinerian-mvp-recommendations"
};

const state = {
  feed: loadState(STORAGE_KEYS.feed, []),
  reactions: loadState(STORAGE_KEYS.reactions, []),
  recommendationQueue: loadState(STORAGE_KEYS.recommendations, [])
};

const elements = {
  searchInput: document.getElementById("searchInputMvp"),
  searchStatus: document.getElementById("searchStatus"),
  searchResults: document.getElementById("searchResults"),
  recommendationCard: document.getElementById("recommendationCard"),
  ratingSelect: document.getElementById("ratingSelect"),
  manualPostForm: document.getElementById("manualPostForm"),
  manualPostText: document.getElementById("manualPostText"),
  feedList: document.getElementById("feedList"),
  searchCount: document.getElementById("searchCount"),
  feedCount: document.getElementById("feedCount"),
  profileCount: document.getElementById("profileCount")
};

function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.feed, JSON.stringify(state.feed));
  localStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(state.reactions));
  localStorage.setItem(
    STORAGE_KEYS.recommendations,
    JSON.stringify(state.recommendationQueue)
  );
}

function formatYear(item) {
  const date = item.release_date || item.first_air_date || "";
  return date ? date.slice(0, 4) : "Sin fecha";
}

function normalizeItem(item) {
  return {
    id: item.id,
    mediaType: item.media_type || "movie",
    title: item.title || item.name || "Titulo sin nombre",
    overview: item.overview || "Todavia no tenemos descripcion para este titulo.",
    poster: item.poster_path
      ? `${TMDB_IMAGE_BASE}${item.poster_path}`
      : "images/base.png",
    year: formatYear(item),
    rating: item.vote_average ? item.vote_average.toFixed(1) : "N/A"
  };
}

async function tmdbFetch(path) {
  const connector = path.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE_URL}${path}${connector}api_key=${TMDB_API_KEY}&language=es-MX`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB respondio ${response.status}`);
  }

  return response.json();
}

function renderCounts(searchCount = 0) {
  elements.searchCount.textContent = `${searchCount} resultados`;
  elements.feedCount.textContent = `${state.feed.length} posteos`;
  elements.profileCount.textContent = `${state.reactions.length} ratings`;
}

function prependFeedItem(entry) {
  state.feed.unshift(entry);
  state.feed = state.feed.slice(0, 25);
  persistState();
  renderFeed();
  renderCounts();
}

function createFeedEntry(message, tone = "activity") {
  return {
    id: Date.now(),
    message,
    tone,
    createdAt: new Date().toLocaleString("es-AR")
  };
}

function renderFeed() {
  if (!state.feed.length) {
    elements.feedList.innerHTML =
      '<div class="empty-state">Todavia no hay actividad. Busca algo, puntualo y el feed empieza a vivir.</div>';
    return;
  }

  elements.feedList.innerHTML = state.feed
    .map(
      (entry) => `
        <article class="feed-item">
          <p>${entry.message}</p>
          <div class="feed-meta">${entry.createdAt}</div>
        </article>
      `
    )
    .join("");
}

function saveReaction(item, reactionType, ratingValue = null) {
  state.reactions.unshift({
    id: `${item.mediaType}-${item.id}-${Date.now()}`,
    title: item.title,
    mediaType: item.mediaType,
    reactionType,
    ratingValue,
    createdAt: new Date().toISOString()
  });

  state.reactions = state.reactions.slice(0, 100);
  persistState();
  renderCounts(elements.searchResults.childElementCount || 0);
}

function buildResultCard(item) {
  return `
    <article class="result-card">
      <img class="poster" src="${item.poster}" alt="${item.title}">
      <div>
        <p class="meta-line">${item.mediaType === "tv" ? "Serie" : "Pelicula"} • ${item.year}</p>
        <h3>${item.title}</h3>
        <p class="result-meta">TMDB ${item.rating} • ${item.overview}</p>
        <div class="result-actions">
          <button type="button" class="ghost-button" data-item-id="${item.id}" data-media-type="${item.mediaType}" data-action="like-search">Me gusta</button>
          <button type="button" class="ghost-button" data-item-id="${item.id}" data-media-type="${item.mediaType}" data-action="save-search">Ya la vi</button>
        </div>
      </div>
    </article>
  `;
}

async function handleSearch(query) {
  if (!query.trim()) {
    elements.searchStatus.textContent = "Escribi para buscar en TMDB.";
    elements.searchResults.innerHTML = "";
    renderCounts(0);
    return;
  }

  elements.searchStatus.textContent = "Buscando...";

  try {
    const data = await tmdbFetch(
      `/search/multi?query=${encodeURIComponent(query)}&include_adult=false`
    );

    const items = data.results
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 8)
      .map(normalizeItem);

    elements.searchResults.innerHTML = items.length
      ? items.map(buildResultCard).join("")
      : '<div class="empty-state">No encontre resultados para esa busqueda.</div>';

    elements.searchStatus.textContent = items.length
      ? "Estos son los mejores matches para tu busqueda."
      : "Sin resultados.";

    renderCounts(items.length);
  } catch (error) {
    elements.searchStatus.textContent =
      "La busqueda fallo. Para produccion conviene mover TMDB a backend.";
    elements.searchResults.innerHTML =
      '<div class="empty-state">No pude consultar TMDB en este momento.</div>';
    renderCounts(0);
  }
}

function attachSearchActions() {
  elements.searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    const card = button.closest(".result-card");
    const title = card.querySelector("h3").textContent;
    const mediaType = button.dataset.mediaType;
    const item = {
      id: Number(button.dataset.itemId),
      title,
      mediaType
    };

    if (button.dataset.action === "like-search") {
      saveReaction(item, "liked");
      prependFeedItem(createFeedEntry(`<strong>Vos</strong> marcaste <strong>${title}</strong> como "me gusta".`));
      return;
    }

    const ratingValue = Number(elements.ratingSelect.value);
    saveReaction(item, "watched", ratingValue);
    prependFeedItem(
      createFeedEntry(
        `<strong>Vos</strong> viste <strong>${title}</strong> y la puntuaste con <strong>${ratingValue}/5</strong>.`
      )
    );
  });
}

function renderRecommendation(item) {
  elements.recommendationCard.innerHTML = `
    <img src="${item.poster}" alt="${item.title}">
    <div class="recommendation-body">
      <p class="meta-line">${item.mediaType === "tv" ? "Serie" : "Pelicula"} • ${item.year}</p>
      <h3>${item.title}</h3>
      <p class="result-meta">TMDB ${item.rating}</p>
      <p>${item.overview}</p>
    </div>
  `;
}

async function ensureRecommendationQueue() {
  if (state.recommendationQueue.length >= 5) {
    renderRecommendation(state.recommendationQueue[0]);
    return;
  }

  try {
    const data = await tmdbFetch("/discover/movie?sort_by=popularity.desc&include_adult=false&page=1");
    const freshItems = data.results.slice(0, 10).map(normalizeItem);

    state.recommendationQueue = [
      ...state.recommendationQueue,
      ...freshItems.filter(
        (freshItem) =>
          !state.recommendationQueue.some((queued) => queued.id === freshItem.id)
      )
    ].slice(0, 12);

    persistState();
    renderRecommendation(state.recommendationQueue[0]);
  } catch (error) {
    elements.recommendationCard.innerHTML =
      '<div class="recommendation-body"><h3>No pude cargar recomendaciones</h3><p class="result-meta">La idea esta lista, pero la integracion final deberia ir por backend.</p></div>';
  }
}

function cycleRecommendation() {
  state.recommendationQueue.shift();
  persistState();
  if (state.recommendationQueue.length) {
    renderRecommendation(state.recommendationQueue[0]);
  } else {
    ensureRecommendationQueue();
  }
}

function attachRecommendationActions() {
  document
    .querySelector(".recommendation-actions")
    .addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      const current = state.recommendationQueue[0];

      if (!button || !current) {
        return;
      }

      if (button.dataset.action === "skip") {
        saveReaction(current, "skipped");
        prependFeedItem(
          createFeedEntry(
            `<strong>Vos</strong> pasaste de <strong>${current.title}</strong>.`,
            "skip"
          )
        );
        cycleRecommendation();
        return;
      }

      if (button.dataset.action === "like") {
        saveReaction(current, "liked");
        prependFeedItem(
          createFeedEntry(
            `<strong>Vos</strong> dijiste que <strong>${current.title}</strong> te interesa.`
          )
        );
        cycleRecommendation();
        return;
      }

      const ratingValue = Number(elements.ratingSelect.value);
      saveReaction(current, "watched", ratingValue);
      prependFeedItem(
        createFeedEntry(
          `<strong>Vos</strong> ya viste <strong>${current.title}</strong> y la puntuaste con <strong>${ratingValue}/5</strong>.`
        )
      );
      cycleRecommendation();
    });
}

function attachManualPostForm() {
  elements.manualPostForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const message = elements.manualPostText.value.trim();
    if (!message) {
      return;
    }

    prependFeedItem(createFeedEntry(`<strong>Vos</strong> recomendaste: ${message}`));
    elements.manualPostText.value = "";
  });
}

function attachSearchInput() {
  let timeoutId = null;

  elements.searchInput.addEventListener("input", () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => handleSearch(elements.searchInput.value), 350);
  });
}

function seedInitialFeed() {
  if (state.feed.length) {
    return;
  }

  state.feed = [
    createFeedEntry('<strong>Mica</strong> recomendo <strong>Perfect Days</strong> para quienes quieren algo sensible y minimalista.'),
    createFeedEntry('<strong>Leo</strong> califico <strong>The Bear</strong> con <strong>5/5</strong> y la subio a su perfil.'),
    createFeedEntry('<strong>Vos</strong> todavia no publicaste nada. Busca una peli y activamos tu feed.')
  ];

  persistState();
}

function init() {
  seedInitialFeed();
  renderFeed();
  renderCounts(0);
  attachSearchInput();
  attachSearchActions();
  attachRecommendationActions();
  attachManualPostForm();
  ensureRecommendationQueue();
}

document.addEventListener("DOMContentLoaded", init);
