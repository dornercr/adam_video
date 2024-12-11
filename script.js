// Global variables
let articles = [];
let filteredArticles = [];
let currentPage = 1;
const resultsPerPage = 15;

// Predefined ILR levels
const predefinedILRLevels = ["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5"];

// DOM elements
const darkModeToggle = document.getElementById('darkModeToggle');
const languageSelect = document.getElementById('languageSelect');
const topicSearch = document.getElementById('topicSearch');
const ilrSelect = document.getElementById('ilrSelect');
const searchBtn = document.getElementById('searchBtn');
const resultsDiv = document.getElementById('results');
const loadingSpinner = document.getElementById('loadingSpinner');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

// Modal elements for video playback
const videoModal = document.getElementById('videoModal');
const videoIframe = document.getElementById('videoIframe');

// Event listeners
document.addEventListener('DOMContentLoaded', initializeApp);
darkModeToggle.addEventListener('change', toggleDarkMode);
languageSelect.addEventListener('change', loadLanguageData);
searchBtn.addEventListener('click', searchArticles);
prevPageBtn.addEventListener('click', () => changePage(-1));
nextPageBtn.addEventListener('click', () => changePage(1));

// Debounced search function
const debouncedSearch = debounce(searchArticles, 300);
topicSearch.addEventListener('input', debouncedSearch);
ilrSelect.addEventListener('change', debouncedSearch);

/**
 * Converts a number of seconds into an HH:MM:SS format string.
 * @param {string|number} seconds - The duration in seconds.
 * @returns {string} - The duration in HH:MM:SS format.
 */
function convertSecondsToHHMMSS(seconds) {
    const totalSeconds = parseFloat(seconds);
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);

    return [hours, minutes, secs]
        .map(val => String(val).padStart(2, '0'))
        .join(':');
}

/**
 * Initializes the application by loading available languages and setting dark mode preferences.
 */
function initializeApp() {
    loadAvailableLanguages();
    checkDarkModePreference();
}

/**
 * Fetches available languages from 'available_files.json' and populates the language dropdown.
 */
function loadAvailableLanguages() {
    fetch('available_files.json')
        .then(response => response.json())
        .then(availableFiles => {
            const languages = Object.keys(availableFiles);
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = capitalizeFirstLetter(lang);
                languageSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error loading available languages:", error);
            showToast("Failed to load available languages. Please try again later.", 'danger');
        });
}

/**
 * Capitalizes the first letter of a given string.
 * @param {string} string - The string to capitalize.
 * @returns {string} - The capitalized string.
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Checks and applies the user's dark mode preference from localStorage.
 */
function checkDarkModePreference() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }
}

/**
 * Toggles the dark mode theme and updates the preference in localStorage.
 */
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

/**
 * Loads language-specific data from CSV files and processes articles.
 */
function loadLanguageData() {
    const language = languageSelect.value;
    if (!language) return;

    showLoading();

    fetch('available_files.json')
        .then(response => response.json())
        .then(availableFiles => {
            const languageFiles = availableFiles[language];
            if (!languageFiles || languageFiles.length === 0) {
                throw new Error(`No CSV files found for language: ${language}`);
            }

            const promises = languageFiles.map(csvFile =>
                Papa.parsePromise(csvFile, { download: true, header: true })
            );

            return Promise.all(promises);
        })
        .then(results => {
            // Process and normalize articles
            articles = results.flatMap(result => result.data.map(article => ({
                Title: article.Title || '',
                URL: article.URL || '',
                text: article.text || '',
                // Convert transcript length from seconds to HH:MM:SS
                transcript_length: convertSecondsToHHMMSS(article.transcript_length || ''),
                transcript_added: article.transcript_added || '',
                ilr_quantized: normalizeILRLevel(article.ilr_quantized),
                ilr_range: article.ilr_range || '',
                ilr_regressed: article.ilr_regressed || '',
                id: article.id || generateId()
            })));
            populateILRDropdown();
            searchArticles();
            showToast(`Loaded ${articles.length} articles for ${capitalizeFirstLetter(language)}`, 'success');
        })
        .catch(error => {
            console.error("Error loading data:", error);
            showToast("An error occurred while loading the data. Please try again.", 'danger');
        })
        .finally(hideLoading);
}

/**
 * Normalizes the ILR level to match predefined ILR levels.
 * @param {string|number} ilr - The ILR level to normalize.
 * @returns {string} - The normalized ILR level or 'N/A' if no match is found.
 */
function normalizeILRLevel(ilr) {
    if (!ilr) return 'N/A';

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

    return 'N/A';
}

/**
 * Populates the ILR dropdown with predefined ILR levels.
 */
function populateILRDropdown() {
    ilrSelect.innerHTML = '<option value="">All Levels</option>';
    predefinedILRLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = `ILR ${level}`;
        ilrSelect.appendChild(option);
    });
}

/**
 * Filters and sorts articles based on search criteria and ILR selection.
 */
function searchArticles() {
    const topic = topicSearch.value.trim().toLowerCase();
    const selectedILR = ilrSelect.value;
    const lowRange = parseFloat(document.getElementById('lowRange').value);
    const highRange = parseFloat(document.getElementById('highRange').value);

    filteredArticles = articles.filter(article => {
        const titleMatch = article.Title.toLowerCase().includes(topic);
        const textMatch = article.text.toLowerCase().includes(topic);

        // Check ILR quantized match
        let ilrMatch = !selectedILR || article.ilr_quantized === selectedILR;

        // Parse article ilr_range
        if (article.ilr_range) {
            let parsedRange;
            try {
                parsedRange = JSON.parse(article.ilr_range);
            } catch (err) {
                // If that fails, try comma-separated
                const parts = article.ilr_range.split(',').map(val => parseFloat(val.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    parsedRange = parts;
                }
            }

            if (Array.isArray(parsedRange) && parsedRange.length === 2) {
                const [low, high] = parsedRange.map(val => parseFloat(val));
                if (!isNaN(low) && !isNaN(high)) {
                    // Apply user range filters if provided
                    if (!isNaN(lowRange) && !isNaN(highRange)) {
                        ilrMatch = ilrMatch && (low >= lowRange && high <= highRange);
                    } else if (!isNaN(lowRange)) {
                        ilrMatch = ilrMatch && (low >= lowRange);
                    } else if (!isNaN(highRange)) {
                        ilrMatch = ilrMatch && (high <= highRange);
                    }
                }
            }
        }

        return (topic === "" || titleMatch || textMatch) && ilrMatch;
    });

    currentPage = 1; 
    displayResults();
}

/**
 * Parses and formats the ILR range value.
 */
function formatILRRange(range) {
    if (!range) return 'N/A';
    try {
        let parsedRange;
        if (Array.isArray(range)) {
            parsedRange = range;
        } else if (typeof range === 'string') {
            range = range.trim();
            if (range.startsWith('[') && range.endsWith(']')) {
                parsedRange = JSON.parse(range);
            } else {
                parsedRange = range.split(',').map(num => parseFloat(num.trim()));
            }
        }

        if (
            Array.isArray(parsedRange) &&
            parsedRange.length === 2 &&
            !isNaN(parsedRange[0]) &&
            !isNaN(parsedRange[1])
        ) {
            const [low, high] = parsedRange.map(val => parseFloat(val));
            if (low >= 0 && low <= 5 && high >= 0 && high <= 5 && low <= high) {
                return `[${low.toFixed(1)}, ${high.toFixed(1)}]`;
            }
        }

        return 'N/A';
    } catch (error) {
        console.error("Error parsing ILR range:", error, range);
        return 'N/A';
    }
}

/**
 * Truncates a given text to the specified number of words.
 */
function truncateText(text, wordLimit) {
    if (!text) return 'No text available';
    const words = text.trim().split(/\s+/);
    if (words.length <= wordLimit) {
        return text;
    }
    return words.slice(0, wordLimit).join(' ') + '...';
}

/**
 * Extracts a YouTube Video ID from a URL.
 */
function extractYouTubeID(url) {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname.includes('youtube.com')) {
            return parsed.searchParams.get('v') || '';
        } else if (hostname === 'youtu.be') {
            return parsed.pathname.slice(1);
        }
    } catch (e) {
        console.error("Invalid URL:", url);
    }
    return '';
}

// Reset video when modal hides
if (videoModal && videoIframe) {
    videoModal.addEventListener('hide.bs.modal', () => {
        videoIframe.src = "";
    });
}

/**
 * Plays a YouTube video in the modal.
 * @param {string} videoID - The YouTube video ID
 */
function playVideo(videoID) {
    if (!videoModal || !videoIframe || !videoID) return;
    const embedURL = `https://www.youtube.com/embed/${encodeURIComponent(videoID)}?autoplay=1`;
    videoIframe.src = embedURL;
    const bootstrapModal = new bootstrap.Modal(videoModal);
    bootstrapModal.show();
}

/**
 * Displays the search results with pagination and truncated text.
 */
function displayResults() {
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    const paginatedResults = filteredArticles.slice(startIndex, endIndex);

    resultsDiv.innerHTML = '';

    if (paginatedResults.length === 0) {
        resultsDiv.innerHTML = '<div class="col-12"><div class="alert alert-info">No results found. Try adjusting your search criteria.</div></div>';
        return;
    }

    const selectedLanguage = languageSelect.options[languageSelect.selectedIndex]?.textContent || '';

    paginatedResults.forEach(article => {
        if (!article.Title) return;
        const ilrRangeDisplay = formatILRRange(article.ilr_range);

        const isArabicTitle = /[\u0600-\u06FF]/.test(article.Title);
        const isArabicText = /[\u0600-\u06FF]/.test(article.text);

        const truncatedText = truncateText(article.text, 200);

        // Check if URL is a YouTube link and get the video ID
        let thumbnailHTML = '';
        let playButtonHTML = ''; 
        if (article.URL) {
            const videoID = extractYouTubeID(article.URL);
            if (videoID) {
                // Make thumbnail clickable
                const thumbnailURL = `https://img.youtube.com/vi/${videoID}/hqdefault.jpg`;
                thumbnailHTML = `
                    <img src="${sanitizeURL(thumbnailURL)}" 
                         alt="Video Thumbnail" 
                         class="img-fluid mb-3" 
                         style="cursor:pointer;" 
                         onclick="playVideo('${sanitizeHTML(videoID)}')"
                    />
                `;
                
                // If you still want a play button separately:
                playButtonHTML = `
                    <button class="btn btn-sm btn-outline-success ms-2" onclick="playVideo('${sanitizeHTML(videoID)}')">
                        Play Video
                    </button>
                `;
            }
        }

        const articleDiv = document.createElement('div');
        articleDiv.className = 'col-md-6 mb-4';
        articleDiv.innerHTML = `
            <div class="card h-100">
                <div class="card-body">
                    ${thumbnailHTML}
                    <span class="badge ${article.ilr_quantized !== 'N/A' ? 'bg-primary' : 'bg-secondary'} ilr-badge">
                        ILR ${article.ilr_quantized || 'N/A'}
                    </span>
                    <h5 class="card-title" style="${isArabicTitle ? 'text-align: right; direction: rtl;' : ''}">
                        ${sanitizeHTML(article.Title)}
                    </h5>
                    <h6 class="card-subtitle mb-2 text-muted">${sanitizeHTML(selectedLanguage)}</h6>
                    <p class="card-text" style="${isArabicText ? 'text-align: right; direction: rtl;' : ''}">
                        ${sanitizeHTML(truncatedText)}
                    </p>
                    <p class="card-text">
                        <strong>ILR Range:</strong> ${sanitizeHTML(ilrRangeDisplay)}
                    </p>
                    <p class="card-text">
                        <strong>Transcript Length:</strong> ${sanitizeHTML(article.transcript_length)}
                    </p>
                    <p class="card-text">
                        <strong>Transcript Added:</strong> ${sanitizeHTML(article.transcript_added)}
                    </p>
                    <p class="card-text">
                        <strong>ILR Regressed:</strong> ${sanitizeHTML(article.ilr_regressed)}
                    </p>
                </div>
                <div class="card-footer bg-transparent border-top-0">
                    ${article.URL ? 
                        `<a href="${sanitizeURL(article.URL)}" class="btn btn-sm btn-outline-primary" target="_blank">
                            Open URL
                        </a>` : ''
                    }
                    <button class="btn btn-sm btn-outline-secondary ms-2" onclick="saveForLater('${sanitizeHTML(article.id)}')">
                        Save for Later
                    </button>
                    ${playButtonHTML}
                </div>
            </div>
        `;
        resultsDiv.appendChild(articleDiv);
    });

    updatePaginationControls();
}

/**
 * Updates the pagination controls.
 */
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

/**
 * Changes the current page.
 */
function changePage(delta) {
    const newPage = currentPage + delta;
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayResults();
    }
}

/**
 * Saves an article for later viewing.
 */
function saveForLater(articleId) {
    showToast(`Article ${sanitizeHTML(articleId)} saved for later`, 'info');
}

/**
 * Displays the loading spinner.
 */
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

/**
 * Hides the loading spinner.
 */
function hideLoading() {
    loadingSpinner.style.display = 'none';
}

/**
 * Displays a toast notification.
 */
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) return; 

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${sanitizeHTML(message)}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

/**
 * Sanitizes HTML.
 */
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

/**
 * Sanitizes URLs.
 */
function sanitizeURL(url) {
    try {
        const parsedURL = new URL(url);
        return parsedURL.href;
    } catch (e) {
        console.error("Invalid URL:", url);
        return '#';
    }
}

/**
 * Generates a unique ID.
 */
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Extend Papa Parse with a promise-based method.
 */
Papa.parsePromise = function(file, config) {
    return new Promise((complete, error) => {
        Papa.parse(file, { ...config, complete, error });
    });
};

/**
 * Debounce utility function.
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
