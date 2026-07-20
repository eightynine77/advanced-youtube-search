let isSearching = false;
let totalMatches = 0;
let query = '';
let currentFilterMode = 'default'; 
// --- NEW: CACHE VARIABLES ---
let currentSearchSignature = ''; 
let currentCachedResults = [];   

// --- NEW: INDEXEDDB SETUP ---
const DB_NAME = 'LumigestYTDB';
const STORE_NAME = 'SearchCache';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCache(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setCache(id, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put({ id, ...data });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function clearCache() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const stopButton = document.getElementById('stop-button');
const removeDuplicatesButton = document.getElementById('remove-duplicates-button');
const resultsContainer = document.getElementById('results-container');
const statusElement = document.getElementById('search-status');
const removedDuplicatesText = document.getElementById('removed-duplicates-status');
const filterDropdownBtn = document.getElementById('searchFilterDropdown');
const filterItems = document.querySelectorAll('.dropdown-item');
const filterDescription = document.getElementById('filter-description');
const dateAfterInput = document.getElementById('date-after');
const dateBeforeInput = document.getElementById('date-before');
const clearDatesBtn = document.getElementById('clear-dates-button');
const modal = document.getElementById('api-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeBtn = document.getElementById('close-modal-btn');
const apiToggle = document.getElementById('api-toggle');
const apiKeyInput = document.getElementById('user-api-key');
const saveBtn = document.getElementById('save-settings-btn');

function decodeHTMLEntities(text) {
    if (!text) return '';
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
}

filterItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        filterItems.forEach(i => i.classList.remove('active'));
        e.target.classList.add('active');
        filterDropdownBtn.textContent = e.target.textContent;
        currentFilterMode = e.target.getAttribute('data-value');

        if (currentFilterMode === 'default') {
            filterDescription.textContent = 'Search for videos containing all your keywords.';
        } else if (currentFilterMode === 'phrase') {
            filterDescription.textContent = 'Search for this exact phrase inside a title.';
        } else {
            filterDescription.textContent = 'Search for a video with this exact title.';
        }
    });
});

searchButton.addEventListener('click', startSearch);
stopButton.addEventListener('click', stopSearch);

removeDuplicatesButton.addEventListener('click', () => {
    // A Set allows us to efficiently store unique values
    const seenIds = new Set();
    
    // Grab all the currently rendered video cards
    // Targeting the col wrapper created in displayResults()
    const resultItems = resultsContainer.querySelectorAll('.col-12.col-sm-6.col-md-4.col-lg-3');
    
    let removedCount = 0;

    resultItems.forEach(item => {
        // Find the "Watch Video" anchor tag inside the card
        const videoLink = item.querySelector('a'); 
        
        if (videoLink && videoLink.href) {
            // Extract the video ID from the '?v=' URL parameter
            const url = new URL(videoLink.href);
            const videoId = url.searchParams.get('v');

            if (videoId) {
                if (seenIds.has(videoId)) {
                    // We've seen this ID before, so remove this HTML element entirely
                    item.remove(); 
                    removedCount++;
                } else {
                    // First time seeing this ID, add it to our tracker
                    seenIds.add(videoId); 
                }
            }
        }
    });

    // Provide visual feedback to the user via the status element
    if (removedCount > 0) {
        totalMatches -= removedCount; // Keep the internal counter accurate
        removedDuplicatesText.textContent = `Removed ${removedCount} duplicate${removedCount === 1 ? '' : 's'} — ${totalMatches} search result${totalMatches === 1 ? '' : 's'} remaining`;
        
        // --- NEW: REMOVE DUPLICATES FROM CACHE AS WELL ---
        if (currentCachedResults.length > 0) {
            const seenIdsCache = new Set();
            const uniqueCache = [];

            for (const video of currentCachedResults) {
                const videoId = video.id.videoId;
                if (!seenIdsCache.has(videoId)) {
                    seenIdsCache.add(videoId);
                    uniqueCache.push(video);
                }
            }

            currentCachedResults = uniqueCache;
            setCache('latestSearch', { 
                signature: currentSearchSignature, 
                results: currentCachedResults 
            }).catch(e => console.error("Cache update error:", e));
        }        
    } else if (resultsContainer.children.length > 0) {
        removedDuplicatesText.textContent = ` No duplicates found`;
    }
});

searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        startSearch();
    }
});

clearDatesBtn.addEventListener('click', () => {
    dateAfterInput.value = 'MM-DD-YYYY';
    dateBeforeInput.value = 'MM-DD-YYYY';
});

document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById("search-input");
    if (textarea) {
        textarea.focus();
    }

    // --- NEW: Parse URL parameters on load ---
    const urlParams = new URLSearchParams(window.location.search);
    const qParam = urlParams.get('q');
    
    if (qParam) {
        // 1. Fill out the search input
        searchInput.value = qParam;

        // 2. Set the Filter dropdown
        const filterParam = urlParams.get('filter');
        let targetDataValue = 'default'; // matchWords
        if (filterParam === 'wholeWord') targetDataValue = 'phrase';
        else if (filterParam === 'exactTitle') targetDataValue = 'exact';
        
        // Find the dropdown item and click it programmatically to run your existing event listeners
        const targetDropdownItem = Array.from(filterItems).find(item => item.getAttribute('data-value') === targetDataValue);
        if (targetDropdownItem) {
            targetDropdownItem.click(); 
        }

        // Helper to convert URL format (YYYY-MM-DD) back to Input format (MM-DD-YYYY)
        const convertToUSFormat = (isoStr) => {
            if (!isoStr) return null;
            const parts = isoStr.split('-');
            if (parts.length === 3) return `${parts[1]}-${parts[2]}-${parts[0]}`;
            return null;
        };

        // 3. Set the Date After
        const afterDateParam = urlParams.get('afterDate');
        if (afterDateParam) {
            const usDate = convertToUSFormat(afterDateParam);
            if (usDate) dateAfterInput.value = usDate;
        }

        // 4. Set the Date Before
        const beforeDateParam = urlParams.get('beforeDate');
        if (beforeDateParam) {
            const usDate = convertToUSFormat(beforeDateParam);
            if (usDate) dateBeforeInput.value = usDate;
        }

        // 5. Automatically start the search
        startSearch();
    }
});

settingsBtn.addEventListener('click', () => {
    loadSettings();
    formatImportSuccess();
    modal.classList.remove('hidden');
});

closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');

    cacheTextArea.value = '';
    cacheStatusMsg.innerHTML = '';
});

modal.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.classList.add('hidden');

        cacheTextArea.value = '';
        cacheStatusMsg.innerHTML = '';
    }
});

apiToggle.addEventListener('change', () => {
    apiKeyInput.disabled = !apiToggle.checked;
});

saveBtn.addEventListener('click', () => {
    const settings = {
        useCustom: apiToggle.checked,
        key: apiKeyInput.value.trim()
    };
    
    localStorage.setItem('yt_search_settings', JSON.stringify(settings));

    document.cookie = `yt_use_custom=${settings.useCustom}; path=/; max-age=31536000; SameSite=Lax`;
    
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saved!";
    saveBtn.classList.replace('btn-primary', 'btn-success');

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.classList.replace('btn-success', 'btn-primary');
    }, 800);
});

function loadSettings() {
    const saved = localStorage.getItem('yt_search_settings');
    if (saved) {
        const settings = JSON.parse(saved);
        apiToggle.checked = settings.useCustom;
        apiKeyInput.value = settings.key || '';
        apiKeyInput.disabled = !settings.useCustom;

        localStorage.setItem('yt_search_settings', JSON.stringify(settings));
        document.cookie = `yt_use_custom=${settings.useCustom}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
        apiToggle.checked = false;
        apiKeyInput.disabled = true;
    }
}

loadSettings();

async function startSearch() {
    query = searchInput.value;
    
    if (query.trim() === '') {
        statusElement.textContent = 'Please enter a search term.';
        return;
    }

    document.title = `search: ${query} | advanced youtube search - lumigest`;

    const urlParams = new URLSearchParams();
    urlParams.set('q', query);

    let filterParam = 'matchWords';
    if (currentFilterMode === 'phrase') filterParam = 'wholeWord';
    if (currentFilterMode === 'exact') filterParam = 'exactTitle';
    urlParams.set('filter', filterParam);

    const convertToISO = (dateStr) => {
        if (!dateStr || dateStr.includes('M') || dateStr.includes('D') || dateStr.includes('Y')) return null;
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[0]}-${parts[1]}`;
        return null;
    };

    const afterISO = convertToISO(dateAfterInput.value);
    if (afterISO) urlParams.set('afterDate', afterISO);

    const beforeISO = convertToISO(dateBeforeInput.value);
    if (beforeISO) urlParams.set('beforeDate', beforeISO);

    const newURL = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.pushState({ path: newURL }, '', newURL);

    // --- NEW: GENERATE SEARCH SIGNATURE ---
    const newSignature = `${query}|${currentFilterMode}|${afterISO || ''}|${beforeISO || ''}`;

    isSearching = true;
    searchButton.disabled = true;
    searchInput.disabled = true;
    filterDropdownBtn.classList.add('disabled'); 
    stopButton.disabled = false;

    // --- NEW: CHECK CACHE BEFORE HITTING API ---
    try {
        const cacheRecord = await getCache('latestSearch');
        if (cacheRecord && cacheRecord.signature === newSignature) {
            
            // We have a match! Load from DB.
            resultsContainer.innerHTML = '';
            totalMatches = cacheRecord.results.length;
            currentCachedResults = cacheRecord.results;
            currentSearchSignature = newSignature;
            
            if (totalMatches > 0) {
                displayResults(cacheRecord.results);
            }
            
            statusElement.textContent = `Search loaded from cache. Found ${totalMatches} match(es).`;
            
            // Reset UI and stop execution so we don't hit the API
            isSearching = false;
            searchButton.disabled = false;
            searchInput.disabled = false;
            filterDropdownBtn.classList.remove('disabled'); 
            stopButton.disabled = true;
            return; 
            
        } else {
            // No match. Clear old cache and prepare for new API pull
            await clearCache();
            currentSearchSignature = newSignature;
            currentCachedResults = [];
        }
    } catch (e) {
        console.error("Cache error:", e);
        currentSearchSignature = newSignature;
        currentCachedResults = [];
    }

    // If no cache hit, proceed with the normal API search
    totalMatches = 0;
    resultsContainer.innerHTML = '';
    statusElement.textContent = 'Starting search...';
    searchLoop(null, 1); 
}

function stopSearch() {
    isSearching = false;

    searchButton.disabled = false;
    searchInput.disabled = false;
    filterDropdownBtn.classList.remove('disabled'); 
    stopButton.disabled = true;

    if (typeof overrideMessage === 'string' && overrideMessage.length) {
        statusElement.textContent = overrideMessage;
        return;
    }

    if (totalMatches === 0) {
        statusElement.textContent = 'Search stopped. No matches found yet.';
    } else {
        statusElement.textContent = `Search stopped. Found ${totalMatches} match(es).`;
    }
}

async function searchLoop(pageToken, pageNum) {
    if (!isSearching) return;

    const afterVal = dateAfterInput.value;
    const beforeVal = dateBeforeInput.value;

    let apiQuery = query; 

    let publishedAfter = null;
    let publishedBefore = null;

    statusElement.textContent = `Scanning page ${pageNum}... (Found: ${totalMatches})`;

    const savedSettings = JSON.parse(localStorage.getItem('yt_search_settings')) || {};
    const useCustom = savedSettings.useCustom;
    const userKey = savedSettings.key;

    const formatDate = (dateStr, isEndOfDay = false) => {
        if (!dateStr || dateStr.includes('M') || dateStr.includes('D') || dateStr.includes('Y')) return null;
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            dateStr = `${parts[2]}-${parts[0]}-${parts[1]}`;
        }
        const timePart = isEndOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
        return `${dateStr}${timePart}`;
    };

    if (afterVal) {
        publishedAfter = formatDate(afterVal);
    }
    if (beforeVal) {
        publishedBefore = formatDate(beforeVal, true); 
    }

    let activeApiKey = null;
    
    if (apiKeyInput.value.trim() !== '') {
        activeApiKey = apiKeyInput.value.trim();
    } else if (useCustom && userKey) {
        activeApiKey = userKey;
    }

    let url;

    if (activeApiKey) {
        url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&key=${activeApiKey}&q=${encodeURIComponent(apiQuery)}`;
    } else {
        url = `/api/search?q=${encodeURIComponent(apiQuery)}`;
    }

    if (pageToken) url += `&pageToken=${pageToken}`;
    if (publishedAfter) url += `&publishedAfter=${publishedAfter}`;
    if (publishedBefore) url += `&publishedBefore=${publishedBefore}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorMessage = `Server error ${response.status}`;
            try {
                const errData = await response.json();
                if (errData.error) errorMessage = errData.error;
            } catch (e) {
                const text = await response.text();
                if (text) errorMessage = text;
            }
            throw new Error(errorMessage);
        }
        const data = await response.json();

        const nextPageToken = data.nextPageToken;
        const videos = data.items;

        if (!videos || videos.length === 0) {
            if (nextPageToken) {
                setTimeout(() => searchLoop(nextPageToken, pageNum + 1), 100);
                return; 
            }

            isSearching = false;
            statusElement.textContent = `Search complete. Found ${totalMatches} match(es).`;
            searchButton.disabled = false;
            searchInput.disabled = false;
            filterDropdownBtn.classList.remove('disabled');
            stopButton.disabled = true;
            return;
        }

        const normalizedQuery = query.toLowerCase().trim();

        const exactMatches = videos.filter(video => {
            const decodedTitle = decodeHTMLEntities(video.snippet.title);
            const title = decodedTitle.toLowerCase().trim();
            
            if (currentFilterMode === 'exact') {
                return title === normalizedQuery;
            } else if (currentFilterMode === 'phrase') {
                return title.includes(normalizedQuery);
            } else {
                const queryWords = normalizedQuery.split(/\s+/); 
                return queryWords.every(word => title.includes(word));
            }
        });

        if (exactMatches.length > 0) {
            totalMatches += exactMatches.length;
            displayResults(exactMatches);

            // --- NEW: UPDATE CACHE INCREMENTALLY ---
            currentCachedResults.push(...exactMatches);
            setCache('latestSearch', { 
                signature: currentSearchSignature, 
                results: currentCachedResults 
            }).catch(e => console.error("Cache save error:", e));
        }

        if (isSearching && nextPageToken) {
            setTimeout(() => searchLoop(nextPageToken, pageNum + 1), 100);
        } else if (!nextPageToken) {
            isSearching = false;
            statusElement.textContent = `Search complete: Reached the end of results. Found ${totalMatches} match(es).`;
            searchButton.disabled = false;
            searchInput.disabled = false;
            filterDropdownBtn.classList.remove('disabled');
            stopButton.disabled = true;
        }

    } catch (error) {
        stopSearch(`error: ${error.message}`);
    }
}

function formatVideoDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' }).toLowerCase();
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// --- Custom Modal Calendar Functionality ---
const calendarModal = document.getElementById('calendar-modal');
const closeCalendarBtn = document.getElementById('close-calendar-btn');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const calendarMonthInput = document.getElementById('calendar-month-input');
const calendarYearInput = document.getElementById('calendar-year-input');
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const calendarDaysContainer = document.getElementById('calendar-days');
const openCalendarBtns = document.querySelectorAll('.open-calendar-btn');

let currentTargetInput = null;
let calendarDate = new Date();

function renderCalendar() {
    calendarDaysContainer.innerHTML = '';
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    // Setup Heading Inputs (Only overwrite if the user isn't actively typing in them)
    if (document.activeElement !== calendarMonthInput) {
        calendarMonthInput.value = monthNames[month];
    }
    if (document.activeElement !== calendarYearInput) {
        calendarYearInput.value = year;
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Insert Empty Cells for Offset Days
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        calendarDaysContainer.appendChild(emptyCell);
    }

    const currentInputValue = currentTargetInput ? currentTargetInput.value.trim() : '';

    // Populate actual days
    for (let day = 1; day <= totalDays; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';
        dayCell.textContent = day;

        const formattedMonth = String(month + 1).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        
        // FIX 2: Changed output format to MM-DD-YYYY
        const cellDateStr = `${formattedMonth}-${formattedDay}-${year}`;

        // Highlight selected day cell if active matches user field
        if (currentInputValue === cellDateStr) {
            dayCell.classList.add('selected');
        }

        // On selection click hook
        dayCell.addEventListener('click', () => {
            if (currentTargetInput) {
                currentTargetInput.value = cellDateStr;
            }
            calendarModal.classList.add('hidden');
        });

        calendarDaysContainer.appendChild(dayCell);
    }

    // FIX 1: Add trailing empty cells to ensure the grid always has 42 cells (6 rows)
    // This stops the modal height from jumping around when months change
    const totalCellsRendered = firstDayIndex + totalDays;
    const remainingCells = 42 - totalCellsRendered;
    
    for (let i = 0; i < remainingCells; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        calendarDaysContainer.appendChild(emptyCell);
    }
}

// Bind Open Triggers to Buttons
openCalendarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        currentTargetInput = document.getElementById(targetId);

        // Synchronize view to input content if valid date is already inside field
        if (currentTargetInput && currentTargetInput.value) {
            const parsedDate = new Date(currentTargetInput.value);
            if (!isNaN(parsedDate)) {
                calendarDate = parsedDate;
            } else {
                calendarDate = new Date();
            }
        } else {
            calendarDate = new Date();
        }

        renderCalendar();
        calendarModal.classList.remove('hidden');
    });
});

// Window and Close Button Triggers
closeCalendarBtn.addEventListener('click', () => calendarModal.classList.add('hidden'));

calendarModal.addEventListener('click', (event) => {
    if (event.target === calendarModal) {
        calendarModal.classList.add('hidden');
    }
});

// Month Pagination Nav Buttons
prevMonthBtn.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

// --- WinForms Style Masked Date Input (Mobile & Desktop Safe) ---
function setupWinformsDateMask(input) {
    if (!input) return;

    // Handle Clicking (Segment Selection)
    input.addEventListener('click', function() {
        const pos = this.selectionStart;
        if (pos < 3) this.setSelectionRange(0, 2); // Select MM
        else if (pos < 6) this.setSelectionRange(3, 5); // Select DD
        else this.setSelectionRange(6, 10); // Select YYYY
    });

    // The core logic function for inserting/deleting
    function processInput(el, action, char) {
        let val = el.value.split('');
        let start = el.selectionStart;
        let end = el.selectionEnd;

        if (action === 'delete') {
            if (start !== end) { 
                if (start === 0) { val[0] = 'M'; val[1] = 'M'; el.value = val.join(''); el.setSelectionRange(0, 2); }
                else if (start === 3) { val[3] = 'D'; val[4] = 'D'; el.value = val.join(''); el.setSelectionRange(3, 5); }
                else if (start === 6) { val[6] = 'Y'; val[7] = 'Y'; val[8] = 'Y'; val[9] = 'Y'; el.value = val.join(''); el.setSelectionRange(6, 10); }
            } else {
                let target = start - 1;
                if (target === 2 || target === 5) target--; // Jump over the hyphens
                if (target >= 0) {
                    if (target < 2) val[target] = 'M';
                    else if (target < 5) val[target] = 'D';
                    else val[target] = 'Y';
                    el.value = val.join('');
                    el.setSelectionRange(target, target);
                }
            }
        } else if (action === 'insert' && /^\d$/.test(char)) {
            if (start === 0 && end === 2) { val[0] = char; val[1] = 'M'; el.value = val.join(''); el.setSelectionRange(1, 1); }
            else if (start === 1) {
            const month = parseInt(val[0] + char, 10);

                // Only allow 01-12
                if (month >= 1 && month <= 12) {
                    val[1] = char;
                    el.value = val.join('');
                    el.setSelectionRange(3, 5);
                }
                // Otherwise ignore the keystroke
            }
            
            else if (start === 3 && end === 5) {
                // First day digit can only be 0-3
                if (char >= '0' && char <= '3') {
                    val[3] = char;
                    val[4] = 'D';
                    el.value = val.join('');
                    el.setSelectionRange(4, 4);
                }
            }

            else if (start === 4) {
            const day = parseInt(val[3] + char, 10);
        
            // Only allow 01-31
            if (day >= 1 && day <= 31) {
                val[4] = char;
                el.value = val.join('');
                el.setSelectionRange(6, 10);
            }
            // Otherwise ignore the keystroke
        }
            
            else if (start === 6 && end === 10) { val[6] = char; val[7] = 'Y'; val[8] = 'Y'; val[9] = 'Y'; el.value = val.join(''); el.setSelectionRange(7, 7); }
            else if (start === 7) { val[7] = char; el.value = val.join(''); el.setSelectionRange(8, 8); }
            else if (start === 8) { val[8] = char; el.value = val.join(''); el.setSelectionRange(9, 9); }
            else if (start === 9) { val[9] = char; el.value = val.join(''); el.setSelectionRange(10, 10); }
        }
    }

    // PRIMARY LISTENER: Catches Mobile Virtual Keyboard Inputs safely
    input.addEventListener('beforeinput', function(e) {
        if (e.inputType === 'deleteContentBackward') {
            e.preventDefault();
            processInput(this, 'delete', null);
        } else if (e.inputType === 'insertText') {
            e.preventDefault();
            processInput(this, 'insert', e.data);
        }
    });

    // FALLBACK LISTENER: Handles Desktop Keyboards (Tab, Arrows, and strict Desktop Backspace)
    input.addEventListener('keydown', function(e) {
        // Allow Desktop Navigation
        if (['Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        // On pure desktop browsers, prevent default to avoid double-firing, and process manually
        if (e.key === 'Backspace') {
            e.preventDefault();
            processInput(this, 'delete', null);
        } else if (/^\d$/.test(e.key)) {
            e.preventDefault();
            processInput(this, 'insert', e.key);
        } else if (e.key !== 'Unidentified') {
            // Block all other keys (letters, symbols) except mobile 'Unidentified' strokes
            e.preventDefault(); 
        }
    });
}

// Hook it up to your fields
setupWinformsDateMask(document.getElementById('date-after'));
setupWinformsDateMask(document.getElementById('date-before'));

// Jump to custom Year LIVE
calendarYearInput.addEventListener('input', function() {
    let newYear = parseInt(this.value);
    // Only jump if they have typed a valid 4-digit year
    if (!isNaN(newYear) && newYear >= 1970 && newYear <= 2200) { 
        calendarDate.setFullYear(newYear);
        renderCalendar();
    }
});

// Clean up Year if user clicks away and left it invalid
calendarYearInput.addEventListener('change', function() {
    let newYear = parseInt(this.value);
    if (isNaN(newYear) || newYear < 1970 || newYear > 2200) {
        this.value = calendarDate.getFullYear(); 
    }
});

// Jump to custom Month LIVE
calendarMonthInput.addEventListener('input', function() {
    let inputVal = this.value.trim().toLowerCase();
    if (!inputVal) return;
    
    // Check if what they typed exactly matches a month
    let newMonthIndex = monthNames.findIndex(m => m.toLowerCase() === inputVal);
    
    // Quality of life: if they type "jan" or "feb", find the prefix match instantly
    if (newMonthIndex === -1) {
        newMonthIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(inputVal));
    }

    if (newMonthIndex !== -1) {
        calendarDate.setMonth(newMonthIndex);
        renderCalendar();
    }
});

// Auto-fill full month name nicely when user clicks away
calendarMonthInput.addEventListener('change', function() {
    this.value = monthNames[calendarDate.getMonth()];
});

// ==========================================
// CACHE IMPORT/EXPORT & DELETION LOGIC
// ==========================================

const cacheTextArea = document.getElementById('cache-text-area');
const copyCacheBtn = document.getElementById('copy-cache-btn');
const importTextBtn = document.getElementById('import-text-btn');
const exportFileBtn = document.getElementById('export-file-btn');
const importFileTrigger = document.getElementById('import-file-trigger');
const importFileInput = document.getElementById('import-file-input');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const cacheStatusMsg = document.getElementById('cache-status-message');
const loadCacheBtn = document.getElementById('load-cache-btn');

// 0. Load Cache into Textarea
loadCacheBtn.addEventListener('click', async () => {
    try {
        loadCacheBtn.textContent = '⏳ Loading...';
        loadCacheBtn.disabled = true;
        
        const cache = await getCache('latestSearch');
        if (cache) {
            cacheTextArea.value = JSON.stringify(cache, null, 2); 
            showCacheStatus('Search cache loaded!');
        } else {
            cacheTextArea.value = '';
            showCacheStatus('No cache found.', true);
        }
    } catch (e) {
        console.error("Error loading cache into textarea:", e);
        showCacheStatus('Error loading cache.', true);
    } finally {
        // Reset the button text and state once done
        loadCacheBtn.textContent = '👁️ Show Search Cache';
        loadCacheBtn.disabled = false;
    }
});

// Helper to show temporary status messages in the modal
function showCacheStatus(msg, isError = false) {
    cacheStatusMsg.innerHTML = msg; // Changed to innerHTML to support <br> tags
    cacheStatusMsg.style.color = isError ? '#ff0000' : '#198754';
}

// Helper to format the detailed success message and update UI
async function formatImportSuccess(signature = null, returnMessage = false) {
    const cacheDiv = document.getElementById('cached-search-div');
    let currentSignature = signature;

    // If no signature is provided, try to fetch it from the DB (e.g., when opening modal)
    if (!currentSignature) {
        try {
            const cache = await getCache('latestSearch');
            if (cache && cache.signature) {
                currentSignature = cache.signature;
            }
        } catch (e) {
            console.error("Error reading cache for display:", e);
        }
    }

    if (currentSignature) {
        try {
            const parts = currentSignature.split('|');
            const searchTerm = parts[0] || 'Unknown';
            const filterMode = parts[1] || 'default';
            const afterDate = parts[2] || '';
            const beforeDate = parts[3] || '';
            
            const urlParams = new URLSearchParams();
            if (searchTerm) urlParams.set('q', searchTerm);
            
            let filterParam = 'matchWords';
            if (filterMode === 'phrase') filterParam = 'wholeWord';
            if (filterMode === 'exact') filterParam = 'exactTitle';
            urlParams.set('filter', filterParam);
            
            if (afterDate) urlParams.set('afterDate', afterDate);
            if (beforeDate) urlParams.set('beforeDate', beforeDate);
            
            const reconstructedUrl = `${window.location.origin}${window.location.pathname}?${urlParams.toString()}`;

            // Update the UI element
            if (cacheDiv) {
                cacheDiv.innerHTML = `<a href="${reconstructedUrl}" id="cached-search" style="word-break: break-all;">${reconstructedUrl}</a>`;
            }

            if (returnMessage) {
                return `Search Cache imported successfully!<br>
                        <span class="text-muted fw-normal" style="font-size: 1rem; word-break: break-all;">the search URL: <a href="${reconstructedUrl}">${reconstructedUrl}</a></span>`;
            }
        } catch (e) {
            if (returnMessage) {
                return `Search Cache imported successfully!<br>
                        <span class="text-muted fw-normal" style="font-size: 1rem; word-break: break-all;">Signature: ${currentSignature}</span>`;
            }
        }
    } else {
        // No cache / no signature found
        if (cacheDiv) {
            cacheDiv.innerHTML = `<a href="" id="cached-search"></a>no cached search yet.`;
        }
    }
}

// 1. Copy Cache (Text)
copyCacheBtn.addEventListener('click', async () => {
    try {
        const cache = await getCache('latestSearch');
        if (!cache) {
            showCacheStatus('No cache found to copy.', true);
            return;
        }
        const cacheStr = JSON.stringify(cache);
        cacheTextArea.value = cacheStr;
        await navigator.clipboard.writeText(cacheStr);
        showCacheStatus('Cache copied to clipboard!');
    } catch (e) {
        showCacheStatus('Error reading cache.', true);
        console.error(e);
    }
});

// 2. Import Cache (Text)
importTextBtn.addEventListener('click', async () => {
    try {
        const val = cacheTextArea.value.trim();
        if (!val) {
            showCacheStatus('Please paste JSON data first.', true);
            return;
        }
        const parsedData = JSON.parse(val);
        
        // Basic validation to ensure it matches your cache structure
        if (!parsedData.signature || !Array.isArray(parsedData.results)) {
            throw new Error('Invalid structure');
        }
        
        await setCache('latestSearch', parsedData);
        showCacheStatus(await formatImportSuccess(parsedData.signature, true));
        cacheTextArea.value = ''; // Clean up textarea
    } catch (e) {
        showCacheStatus('Invalid JSON or cache format.', true);
        console.error(e);
    }
});

// 3. Export Cache (File)
exportFileBtn.addEventListener('click', async () => {
    try {
        const cache = await getCache('latestSearch');
        if (!cache) {
            showCacheStatus('No cache found to export.', true);
            return;
        }
        // Create a downloadable JSON file
        const blob = new Blob([JSON.stringify(cache, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lumigest_cache_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showCacheStatus('Cache file downloaded!');
    } catch (e) {
        showCacheStatus('Error exporting file.', true);
        console.error(e);
    }
});

// 4. Import Cache (File)
importFileTrigger.addEventListener('click', () => {
    importFileInput.click(); // Trigger the hidden file input
});

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsedData = JSON.parse(event.target.result);
            
            if (!parsedData.signature || !Array.isArray(parsedData.results)) {
                throw new Error('Invalid structure');
            }
            
            await setCache('latestSearch', parsedData);
            showCacheStatus(await formatImportSuccess(parsedData.signature, true));
        } catch (err) {
            showCacheStatus('Invalid cache file format.', true);
            console.error(err);
        }
        importFileInput.value = ''; // Reset input so the same file can be selected again if needed
    };
    reader.readAsText(file);
});

// 5. Clear Cache
clearCacheBtn.addEventListener('click', async () => {
    try {
        await clearCache(); // Uses your existing IndexedDB clear function
        
        // Reset local variables just in case a search was active
        currentSearchSignature = '';
        currentCachedResults = [];
        cacheTextArea.value = '';
        
        showCacheStatus('Cache wiped clean successfully!');
        formatImportSuccess();
    } catch (e) {
        showCacheStatus('Error clearing cache.', true);
        console.error(e);
    }
});

function displayResults(videos) {
    videos.forEach(video => {
        const col = document.createElement('div');
        col.className = 'col-12 col-sm-6 col-md-4 col-lg-3'; 
        const card = document.createElement('div');
        card.className = 'card h-100 shadow-sm border-0'; 
        const thumbnail = document.createElement('img');
        thumbnail.src = video.snippet.thumbnails.high.url;
        thumbnail.alt = decodeHTMLEntities(video.snippet.title);
        thumbnail.className = 'card-img-top';
        thumbnail.style.objectFit = 'cover';
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body d-flex flex-column';
        const title = document.createElement('h5');
        
        //date section
        const dateElement = document.createElement('p');
        dateElement.className = 'card-text small text-muted mb-2';
        dateElement.textContent = `upload date: ${formatVideoDate(video.snippet.publishedAt)}`;

        title.className = 'card-title fs-6'; 
        title.textContent = decodeHTMLEntities(video.snippet.title);
        const videoLink = document.createElement('a');
        videoLink.href = `https://www.youtube.com/watch?v=${video.id.videoId}`;
        videoLink.target = '_blank';
        videoLink.rel = 'noopener noreferrer';
        videoLink.className = 'btn btn-outline-danger mt-auto'; 
        videoLink.textContent = 'Watch Video';

        //append all elements to search result
        cardBody.appendChild(title);
        cardBody.appendChild(dateElement);
        cardBody.appendChild(videoLink);
        card.appendChild(thumbnail);
        card.appendChild(cardBody);
        col.appendChild(card);
        resultsContainer.appendChild(col);
    });
}
