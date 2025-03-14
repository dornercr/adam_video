/*************************************************
 * script.js
 * 
 * All JavaScript logic has been moved here.
 *************************************************/

// Global variables
let articles = [];
let filteredArticles = [];
let currentPage = 1;
const resultsPerPage = 10;

// Predefined ILR levels
const predefinedILRLevels = [
  "1.0",
  "1.5",
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5",
];

// DOM Elements
const darkModeToggle = document.getElementById("darkModeToggle");
const languageSelect = document.getElementById("languageSelect");
const topicSearch = document.getElementById("topicSearch");
const ilrSelect = document.getElementById("ilrSelect");
const searchBtn = document.getElementById("searchBtn");
const resultsDiv = document.getElementById("results");
const loadingSpinner = document.getElementById("loadingSpinner");
const pageInfo = document.getElementById("pageInfo");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const categorySelect = document.getElementById("categorySelect");

// NEW Filter Elements
const dialectSelect = document.getElementById("dialectSelect");
const regionSelect = document.getElementById("regionSelect");

// Video Modal
const videoModal = document.getElementById("videoModal");
const videoIframe = document.getElementById("videoIframe");

// Transcript Modal
const transcriptModal = document.getElementById("transcriptModal");
const transcriptContent = document.getElementById("transcriptContent");

/*************************************************
 * Event Listeners
 *************************************************/
document.addEventListener("DOMContentLoaded", initializeApp);
darkModeToggle.addEventListener("change", toggleDarkMode);
languageSelect.addEventListener("change", loadLanguageData);
searchBtn.addEventListener("click", searchArticles);
prevPageBtn.addEventListener("click", () => changePage(-1));
nextPageBtn.addEventListener("click", () => changePage(1));

// Debounced search
const debouncedSearch = debounce(searchArticles, 300);
topicSearch.addEventListener("input", debouncedSearch);
ilrSelect.addEventListener("change", debouncedSearch);
categorySelect.addEventListener("change", debouncedSearch);
dialectSelect.addEventListener("change", debouncedSearch);
regionSelect.addEventListener("change", debouncedSearch);

/*************************************************
 * Initialization
 *************************************************/
function initializeApp() {
  loadAvailableLanguages();
  checkDarkModePreference();
}

/*************************************************
 * Load & Populate
 *************************************************/

/**
 * Loads available language files (from available_files.json) and populates the Language dropdown.
 */
function loadAvailableLanguages() {
  fetch("available_files.json")
    .then((response) => response.json())
    .then((availableFiles) => {
      const languages = Object.keys(availableFiles);
      languages.forEach((lang) => {
        const option = document.createElement("option");
        option.value = lang;
        option.textContent = capitalizeFirstLetter(lang);
        languageSelect.appendChild(option);
      });
    })
    .catch((error) => {
      console.error("Error loading available languages:", error);
      showToast(
        "Failed to load available languages. Please try again later.",
        "danger"
      );
    });
}

/**
 * Fetches CSV files for the chosen language, parses, and populates global articles array.
 */
function loadLanguageData() {
  const language = languageSelect.value;
  if (!language) return;

  showLoading();

  fetch("available_files.json")
    .then((response) => response.json())
    .then((availableFiles) => {
      const languageFiles = availableFiles[language] || [];
      if (languageFiles.length === 0) {
        throw new Error(`No CSV files found for language: ${language}`);
      }

      // Parse each CSV file for this language
      const promises = languageFiles.map((csvFile) =>
        Papa.parsePromise(csvFile, { download: true, header: true })
      );

      return Promise.all(promises);
    })
    .then((results) => {
      // Flatten results from multiple CSVs
      articles = results.flatMap((result) => {
        // 1) Remove "Unnamed" columns
        const cleanedData = result.data.map((row) => {
          const cleaned = {};
          for (const key in row) {
            if (!key.toLowerCase().startsWith("unnamed")) {
              cleaned[key] = row[key];
            }
          }
          return cleaned;
        });

        // 2) Map into a consistent article object
        return cleanedData.map((row) => ({
          Title:
            row["Title"] ||
            row["title"] ||
            row["Standard title"] ||
            "",
          URL: row["URL"] || row["url"] || "",
          text: row["transcript"] || "",
          transcript_length: convertSecondsToHHMMSS(
            row["transcript_length"] || ""
          ),
          transcript_added: row["transcript_added"] || "",
          formatted_length: row["formatted_length"] || "",
          ilr_quantized: normalizeILRLevel(row["ilr_quantized"]),
          ilr_range: row["ilr_range"] || "",
          ilr_regressed: row["ilr_regressed"] || "",
          id: row["id"] || generateId(),
          Category:
            row["Category"] ||
            row["category"] ||
            row["Standard category"] ||
            "",
          SearchTerm:
            row["SearchTerm"] ||
            row["searchTerm"] ||
            "",
          // NEW fields for Dialect & Region
          Dialect:
            (row["dialect"] ||
              row["Dialect"] ||
              row["Standard dialect"] ||
              ""
            ).trim(),
          Region:
            (row["region"] ||
              row["Region"] ||
              row["Standard region"] ||
              ""
            ).trim(),
        }));
      });

      // Populate dropdowns
      populateILRDropdown();
      populateCategoryDropdown();
      populateDialectDropdown();
      populateRegionDropdown();

      searchArticles();
      showToast(
        `Loaded ${articles.length} articles for ${capitalizeFirstLetter(language)}`,
        "success"
      );
    })
    .catch((error) => {
      console.error("Error loading data:", error);
      showToast(
        "An error occurred while loading the data. Please try again.",
        "danger"
      );
    })
    .finally(hideLoading);
}

/*************************************************
 * Dropdown Population
 *************************************************/
function populateCategoryDropdown() {
  const categories = [
    ...new Set(articles.map((a) => a.Category).filter((cat) => cat.trim())),
  ];
  categorySelect.innerHTML = '<option value="">All Categories</option>';
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
}

function populateDialectDropdown() {
  const dialects = [
    ...new Set(articles.map((a) => a.Dialect).filter((d) => d.trim())),
  ];
  dialectSelect.innerHTML = '<option value="">Select Dialect</option>';
  dialects.forEach((dial) => {
    const option = document.createElement("option");
    option.value = dial;
    option.textContent = dial;
    dialectSelect.appendChild(option);
  });
}

function populateRegionDropdown() {
  const regions = [
    ...new Set(articles.map((a) => a.Region).filter((r) => r.trim())),
  ];
  regionSelect.innerHTML = '<option value="">Select Region</option>';
  regions.forEach((reg) => {
    const option = document.createElement("option");
    option.value = reg;
    option.textContent = reg;
    regionSelect.appendChild(option);
  });
}

function populateILRDropdown() {
  ilrSelect.innerHTML = '<option value="">All Levels</option>';
  predefinedILRLevels.forEach((level) => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = `ILR ${level}`;
    ilrSelect.appendChild(option);
  });
}

/*************************************************
 * Searching & Filtering
 *************************************************/

/**
 * Filters articles based on user-selected criteria (topic, ILR level/range,
 * Category, Dialect, and Region), then displays them.
 */
function searchArticles() {
  const topic = topicSearch.value.trim().toLowerCase();
  const selectedILR = ilrSelect.value;
  const lowRange = parseFloat(document.getElementById("lowRange").value);
  const highRange = parseFloat(document.getElementById("highRange").value);
  const selectedCategory = categorySelect.value;
  const selectedDialect = dialectSelect.value;
  const selectedRegion = regionSelect.value;

  filteredArticles = articles.filter((article) => {
    // Basic text matching (title or transcript)
    const titleMatch = article.Title.toLowerCase().includes(topic);
    const textMatch = article.text.toLowerCase().includes(topic);

    // ILR exact match if selected
    let ilrMatch = !selectedILR || article.ilr_quantized === selectedILR;

    // Category, Dialect, Region exact matches if selected
    let categoryMatch =
      !selectedCategory || article.Category === selectedCategory;
    let dialectMatch =
      !selectedDialect || article.Dialect === selectedDialect;
    let regionMatch =
      !selectedRegion || article.Region === selectedRegion;

    // ILR range logic
    if (article.ilr_range) {
      let parsedRange;
      try {
        parsedRange = JSON.parse(article.ilr_range);
      } catch (err) {
        // fallback for non-JSON
        const parts = article.ilr_range
          .split(",")
          .map((val) => parseFloat(val.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          parsedRange = parts;
        }
      }

      if (Array.isArray(parsedRange) && parsedRange.length === 2) {
        const [lowVal, highVal] = parsedRange.map((val) => parseFloat(val));
        if (!isNaN(lowVal) && !isNaN(highVal)) {
          if (!isNaN(lowRange) && !isNaN(highRange)) {
            ilrMatch = ilrMatch && lowVal >= lowRange && highVal <= highRange;
          } else if (!isNaN(lowRange)) {
            ilrMatch = ilrMatch && lowVal >= lowRange;
          } else if (!isNaN(highRange)) {
            ilrMatch = ilrMatch && highVal <= highRange;
          }
        }
      }
    }

    // Final check
    return (
      (topic === "" || titleMatch || textMatch) &&
      ilrMatch &&
      categoryMatch &&
      dialectMatch &&
      regionMatch
    );
  });

  currentPage = 1;
  displayResults();
}

/*************************************************
 * Results & Pagination
 *************************************************/
function displayResults() {
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = startIndex + resultsPerPage;
  const paginatedResults = filteredArticles.slice(startIndex, endIndex);

  resultsDiv.innerHTML = "";

  if (paginatedResults.length === 0) {
    resultsDiv.innerHTML =
      '<div class="col-12"><div class="alert alert-info">No results found. Try adjusting your search criteria.</div></div>';
    return;
  }

  const selectedLanguage =
    languageSelect.options[languageSelect.selectedIndex]?.textContent || "";

  paginatedResults.forEach((article) => {
    // If there's truly no Title, skip rendering:
    if (!article.Title) return;

    const ilrRangeDisplay = formatILRRange(article.ilr_range);
    const isArabicTitle = /[\u0600-\u06FF]/.test(article.Title);
    const isArabicText = /[\u0600-\u06FF]/.test(article.text);
    const truncatedText = truncateText(article.text, 200);

    // Check if article.URL is a YouTube link
    let thumbnailHTML = "";
    let playButtonHTML = "";
    if (article.URL) {
      const videoID = extractYouTubeID(article.URL);
      if (videoID) {
        const thumbnailURL = `https://img.youtube.com/vi/${videoID}/hqdefault.jpg`;
        thumbnailHTML = `
          <img
            src="${sanitizeURL(thumbnailURL)}"
            alt="Video Thumbnail"
            class="img-fluid mb-3"
            style="cursor:pointer;"
            onclick="playVideo('${sanitizeHTML(videoID)}')"
          />
        `;
        playButtonHTML = `
          <button
            class="btn btn-sm btn-outline-success ms-2"
            onclick="playVideo('${sanitizeHTML(videoID)}')"
          >
            Play Video
          </button>
        `;
      }
    }

    const articleDiv = document.createElement("div");
    articleDiv.className = "col-md-6 mb-4";
    articleDiv.innerHTML = `
      <div class="card h-100">
        <div class="card-body">
          ${thumbnailHTML}
          <span
            class="badge ${
              article.ilr_quantized !== 'N/A' ? 'bg-primary' : 'bg-secondary'
            } ilr-badge"
          >
            ILR ${article.ilr_quantized || 'N/A'}
          </span>
          <h5
            class="card-title"
            style="${isArabicTitle ? 'text-align: right; direction: rtl;' : ''}"
          >
            ${sanitizeHTML(article.Title)}
          </h5>
          <h6 class="card-subtitle mb-2 text-muted">
            ${sanitizeHTML(selectedLanguage)}
          </h6>

          <p class="card-text">
            <strong>Category:</strong>
            ${sanitizeHTML(article.Category)}
          </p>

          <!-- Show the Dialect & Region -->
          <p class="card-text">
            <strong>Dialect:</strong>
            ${sanitizeHTML(article.Dialect)}
          </p>
          <p class="card-text">
            <strong>Region:</strong>
            ${sanitizeHTML(article.Region)}
          </p>

          <p
            class="card-text"
            style="${isArabicText ? 'text-align: right; direction: rtl;' : ''}"
          >
            ${sanitizeHTML(truncatedText)}
          </p>
          <p class="card-text">
            <strong>ILR Range:</strong>
            ${sanitizeHTML(ilrRangeDisplay)}
          </p>
          <p class="card-text">
            <strong>Transcript Length:</strong>
            ${sanitizeHTML(article.transcript_length)}
          </p>
          <p class="card-text">
            <strong>Transcript Added:</strong>
            ${sanitizeHTML(article.transcript_added)}
          </p>
          <p class="card-text">
            <strong>ILR Regressed:</strong>
            ${sanitizeHTML(article.ilr_regressed)}
          </p>
        </div>
        <div class="card-footer bg-transparent border-top-0">
          ${
            article.URL
              ? `<a
                    href="${sanitizeURL(article.URL)}"
                    class="btn btn-sm btn-outline-primary"
                    target="_blank"
                  >
                    Open URL
                  </a>`
              : ""
          }
          <button
            class="btn btn-sm btn-outline-secondary ms-2"
            onclick="saveForLater('${sanitizeHTML(article.id)}')"
          >
            Save for Later
          </button>
          ${playButtonHTML}

          <!-- NEW: Open Transcript button -->
          <button
            class="btn btn-sm btn-outline-warning ms-2"
            onclick="openTranscript('${sanitizeHTML(article.id)}')"
          >
            Open Transcript
          </button>
        </div>
      </div>
    `;
    resultsDiv.appendChild(articleDiv);
  });

  updatePaginationControls();
}

function updatePaginationControls() {
  const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
}

function changePage(delta) {
  const newPage = currentPage + delta;
  const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    displayResults();
  }
}

function saveForLater(articleId) {
  showToast(`Article ${sanitizeHTML(articleId)} saved for later`, "info");
}

/*************************************************
 * UI Helpers (Spinner, Toast, Dark Mode, etc.)
 *************************************************/
function showLoading() {
  loadingSpinner.style.display = "flex";
}

function hideLoading() {
  loadingSpinner.style.display = "none";
}

function showToast(message, type = "info") {
  const toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${sanitizeHTML(message)}
      </div>
      <button
        type="button"
        class="btn-close btn-close-white me-2 m-auto"
        data-bs-dismiss="toast"
        aria-label="Close"
      ></button>
    </div>
  `;
  toastContainer.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
}

function checkDarkModePreference() {
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
    darkModeToggle.checked = true;
  }
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(
    "darkMode",
    document.body.classList.contains("dark-mode")
  );
}

/*************************************************
 * Video Modal
 *************************************************/
if (videoModal && videoIframe) {
  videoModal.addEventListener("hide.bs.modal", () => {
    videoIframe.src = "";
  });
}

function playVideo(videoID) {
  if (!videoModal || !videoIframe || !videoID) return;
  const embedURL = `https://www.youtube.com/embed/${encodeURIComponent(videoID)}?autoplay=1`;
  videoIframe.src = embedURL;
  const bootstrapModal = new bootstrap.Modal(videoModal);
  bootstrapModal.show();
}

/*************************************************
 * Transcript Modal (NEW)
 *************************************************/
function openTranscript(articleId) {
  // Find the article by ID in the current filtered set
  const article = filteredArticles.find((a) => a.id === articleId);
  if (!article) {
    showToast("Transcript not found.", "danger");
    return;
  }

  // If there's no transcript text, show a toast or handle as needed
  if (!article.text) {
    showToast("No transcript available for this article.", "info");
    return;
  }

  // Put the transcript into the modal
  transcriptContent.textContent = article.text;

  // Show the modal
  const bootstrapModal = new bootstrap.Modal(transcriptModal);
  bootstrapModal.show();
}

/*************************************************
 * Utility Functions
 *************************************************/
function extractYouTubeID(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v") || "";
    } else if (hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
  } catch (e) {
    console.error("Invalid URL:", url);
  }
  return "";
}

function truncateText(text, wordLimit) {
  if (!text) return "No text available";
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) return text;
  return words.slice(0, wordLimit).join(" ") + "...";
}

function sanitizeHTML(str) {
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

function sanitizeURL(url) {
  try {
    const parsedURL = new URL(url);
    return parsedURL.href;
  } catch (e) {
    console.error("Invalid URL:", url);
    return "#";
  }
}

function formatILRRange(range) {
  if (!range) return "N/A";
  try {
    let parsedRange;
    if (Array.isArray(range)) {
      parsedRange = range;
    } else if (typeof range === "string") {
      const trimmedRange = range.trim();
      if (trimmedRange.startsWith("[") && trimmedRange.endsWith("]")) {
        parsedRange = JSON.parse(trimmedRange);
      } else {
        parsedRange = trimmedRange
          .split(",")
          .map((num) => parseFloat(num.trim()));
      }
    }

    if (
      Array.isArray(parsedRange) &&
      parsedRange.length === 2 &&
      !isNaN(parsedRange[0]) &&
      !isNaN(parsedRange[1])
    ) {
      const [low, high] = parsedRange;
      if (low >= 0 && low <= 5 && high >= 0 && high <= 5 && low <= high) {
        return `[${low.toFixed(1)}, ${high.toFixed(1)}]`;
      }
    }
    return "N/A";
  } catch (error) {
    console.error("Error parsing ILR range:", error, range);
    return "N/A";
  }
}

function convertSecondsToHHMMSS(seconds) {
  const totalSeconds = parseFloat(seconds);
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00:00";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  return [hours, minutes, secs]
    .map((val) => String(val).padStart(2, "0"))
    .join(":");
}

function normalizeILRLevel(ilr) {
  if (!ilr) return "N/A";
  const ilrStr = String(ilr).trim();
  if (predefinedILRLevels.includes(ilrStr)) {
    return ilrStr;
  }
  const ilrFloat = parseFloat(ilrStr);
  if (!isNaN(ilrFloat)) {
    const ilrFormatted = ilrFloat.toFixed(1);
    if (predefinedILRLevels.includes(ilrFormatted)) {
      return ilrFormatted;
    }
  }
  if (ilrStr.startsWith("ILR ")) {
    const ilrValue = ilrStr.substring(4);
    if (predefinedILRLevels.includes(ilrValue)) {
      return ilrValue;
    }
  }
  return "N/A";
}

function generateId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// Extend Papa Parse to support Promises
Papa.parsePromise = function (file, config) {
  return new Promise((complete, error) => {
    Papa.parse(file, { ...config, complete, error });
  });
};

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Simple Debounce Utility
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
