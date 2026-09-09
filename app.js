// ============================================================
// Cineteca — logica applicativa
// ============================================================

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Stato della copertina in fase di analisi, prima del salvataggio
let pendingFile = null;
let pendingBase64 = null;

// ---------- Riferimenti agli elementi ----------
const coverInput = document.getElementById("cover-input");
const previewImg = document.getElementById("preview-img");
const previewPlaceholder = document.getElementById("preview-placeholder");
const analyzeBtn = document.getElementById("analyze-btn");
const analyzeStatus = document.getElementById("analyze-status");
const reviewForm = document.getElementById("review-form");
const saveBtn = document.getElementById("save-btn");
const saveStatus = document.getElementById("save-status");

const fTitle = document.getElementById("f-title");
const fType = document.getElementById("f-type");
const fYear = document.getElementById("f-year");
const fDuration = document.getElementById("f-duration");
const fGenres = document.getElementById("f-genres");
const fDirector = document.getElementById("f-director");
const fPlot = document.getElementById("f-plot");

const shelfGrid = document.getElementById("shelf-grid");
const shelfEmpty = document.getElementById("shelf-empty");
const filterType = document.getElementById("filter-type");

// ============================================================
// 1. Caricamento copertina
// ============================================================
coverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  pendingFile = file;
  previewImg.src = URL.createObjectURL(file);
  previewImg.hidden = false;
  previewPlaceholder.hidden = true;
  analyzeBtn.disabled = false;
  analyzeStatus.textContent = "";
  reviewForm.hidden = true;

  pendingBase64 = await fileToBase64(file);
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// 2. Riconoscimento automatico (copertina -> titolo + tipo)
//    poi arricchimento dati (TMDB -> anno, durata, trama, genere, regia)
// ============================================================
analyzeBtn.addEventListener("click", async () => {
  if (!pendingFile || !pendingBase64) return;

  setStatus(analyzeStatus, "Lettura della copertina in corso...", null);
  analyzeBtn.disabled = true;

  try {
    const guess = await identifyCover(pendingBase64, pendingFile.type);

    setStatus(analyzeStatus, `Titolo riconosciuto: "${guess.title}". Ricerco i dettagli...`, null);

    const details = await searchTMDB(guess.title);

    fTitle.value = guess.title || "";
    fType.value = normalizeMediaType(guess.media_type_guess);
    fYear.value = details.year || "";
    fDuration.value = details.duration || "";
    fGenres.value = (details.genres || []).join(", ");
    fDirector.value = details.director || "";
    fPlot.value = details.plot || "";

    reviewForm.hidden = false;
    setStatus(analyzeStatus, "Fatto. Controlla i campi e correggi se necessario.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(analyzeStatus, "Non sono riuscito ad analizzare la copertina. Puoi compilare i campi a mano qui sotto.", "error");
    // Anche in caso di errore, apriamo il form per l'inserimento manuale
    fTitle.value = "";
    reviewForm.hidden = false;
  } finally {
    analyzeBtn.disabled = false;
  }
});

// Chiama la funzione edge Supabase che usa un modello con visione per leggere la copertina
async function identifyCover(base64, mimeType) {
  const response = await fetch(CONFIG.IDENTIFY_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": `Bearer ${CONFIG.SUPABASE_KEY}`,
    },
    body: JSON.stringify({ imageBase64: base64, mediaType: mimeType }),
  });

  if (!response.ok) throw new Error("Errore nella funzione di riconoscimento");
  return await response.json(); // { title, media_type_guess, language }
}

function normalizeMediaType(guess) {
  if (!guess) return "DVD";
  const g = guess.toLowerCase();
  if (g.includes("4k")) return "Blu-ray 4K";
  if (g.includes("blu")) return "Blu-ray";
  return "DVD";
}

// Cerca il film su TMDB a partire dal titolo e restituisce i metadati principali
async function searchTMDB(title) {
  const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&language=${CONFIG.TMDB_LANGUAGE}&query=${encodeURIComponent(title)}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  const best = searchData.results && searchData.results[0];
  if (!best) return {};

  const detailsUrl = `https://api.themoviedb.org/3/movie/${best.id}?api_key=${CONFIG.TMDB_API_KEY}&language=${CONFIG.TMDB_LANGUAGE}&append_to_response=credits`;
  const detailsRes = await fetch(detailsUrl);
  const details = await detailsRes.json();

  const director = (details.credits?.crew || []).find((c) => c.job === "Director");

  return {
    year: details.release_date ? details.release_date.slice(0, 4) : "",
    duration: details.runtime || "",
    plot: details.overview || "",
    genres: (details.genres || []).map((g) => g.name),
    director: director ? director.name : "",
    tmdbTitle: details.title || title,
  };
}

// ============================================================
// 3. Salvataggio nello scaffale
// ============================================================
saveBtn.addEventListener("click", async () => {
  if (!fTitle.value.trim()) {
    setStatus(saveStatus, "Inserisci almeno il titolo.", "error");
    return;
  }

  saveBtn.disabled = true;
  setStatus(saveStatus, "Salvataggio in corso...", null);

  try {
    const coverUrl = await uploadCover(pendingFile);

    const { error } = await supabase.from("movies").insert({
      title: fTitle.value.trim(),
      media_type: fType.value,
      release_year: fYear.value ? parseInt(fYear.value, 10) : null,
      duration_minutes: fDuration.value ? parseInt(fDuration.value, 10) : null,
      plot: fPlot.value.trim() || null,
      genres: fGenres.value ? fGenres.value.split(",").map((s) => s.trim()).filter(Boolean) : null,
      director: fDirector.value.trim() || null,
      cover_url: coverUrl,
    });

    if (error) throw error;

    setStatus(saveStatus, "Aggiunto allo scaffale.", "ok");
    resetAddPanel();
    await loadMovies();
  } catch (err) {
    console.error(err);
    setStatus(saveStatus, "Salvataggio non riuscito. Riprova.", "error");
  } finally {
    saveBtn.disabled = false;
  }
});

async function uploadCover(file) {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from("covers").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}

function resetAddPanel() {
  pendingFile = null;
  pendingBase64 = null;
  coverInput.value = "";
  previewImg.hidden = true;
  previewPlaceholder.hidden = false;
  analyzeBtn.disabled = true;
  reviewForm.hidden = true;
  [fTitle, fYear, fDuration, fGenres, fDirector, fPlot].forEach((el) => (el.value = ""));
}

// ============================================================
// 4. Scaffale: caricamento ed elenco dei film
// ============================================================
async function loadMovies() {
  const { data, error } = await supabase
    .from("movies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderShelf(data);
}

function renderShelf(movies) {
  const filter = filterType.value;
  const filtered = filter === "all" ? movies : movies.filter((m) => m.media_type === filter);

  shelfGrid.innerHTML = "";
  shelfEmpty.hidden = filtered.length > 0;

  filtered.forEach((movie) => {
    shelfGrid.appendChild(renderMovieCard(movie));
  });
}

function renderMovieCard(movie) {
  const card = document.createElement("div");
  card.className = "movie-card";

  const badgeClass = movie.media_type === "DVD" ? "badge-dvd" : "badge-bluray";

  card.innerHTML = `
    <img class="movie-cover" src="${movie.cover_url || ""}" alt="Copertina di ${escapeHtml(movie.title)}">
    <div class="movie-info">
      <div class="movie-title">${escapeHtml(movie.title)}</div>
      <div class="movie-meta">
        <span class="badge ${badgeClass}">${movie.media_type}</span>
        <span>${movie.release_year || "—"}</span>
        <span>${movie.duration_minutes ? movie.duration_minutes + " min" : ""}</span>
      </div>
      <div class="stars" data-id="${movie.id}"></div>
    </div>
  `;

  const starsBox = card.querySelector(".stars");
  renderStars(starsBox, movie.rating || 0, movie.id);

  return card;
}

function renderStars(container, currentRating, movieId) {
  container.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.textContent = "★";
    btn.className = i <= currentRating ? "filled" : "";
    btn.setAttribute("aria-label", `Vota ${i} stelle`);
    btn.addEventListener("click", () => setRating(movieId, i, container));
    container.appendChild(btn);
  }
}

async function setRating(movieId, rating, container) {
  const { error } = await supabase.from("movies").update({ rating }).eq("id", movieId);
  if (error) {
    console.error(error);
    return;
  }
  renderStars(container, rating, movieId);
}

filterType.addEventListener("change", loadMovies);

// ---------- Utilità ----------
function setStatus(el, message, kind) {
  el.textContent = message;
  el.className = "status" + (kind ? " " + kind : "");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------- Avvio ----------
loadMovies();
