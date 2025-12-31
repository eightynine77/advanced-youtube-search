let isSearching = false;
let totalMatches = 0;
let query = '';
let currentFilterMode = 'default'; 

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const stopButton = document.getElementById('stop-button');
const resultsContainer = document.getElementById('results-container');
const statusElement = document.getElementById('search-status');
const filterDropdownBtn = document.getElementById('searchFilterDropdown');
const filterItems = document.querySelectorAll('.dropdown-item');
const filterDescription = document.getElementById('filter-description');
const dateAfterInput = document.getElementById('date-after');
const dateBeforeInput = document.getElementById('date-before');
const clearDatesBtn = document.getElementById('clear-dates-button');

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

searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        startSearch();
    }
});

clearDatesBtn.addEventListener('click', () => {
    dateAfterInput.value = '';
    dateBeforeInput.value = '';
});

document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById("search-input");
    if (textarea) {
        textarea.focus();
    }
});

function startSearch() {
    query = searchInput.value;
    
    if (query.trim() === '') {
        statusElement.textContent = 'Please enter a search term.';
        return;
    }

    isSearching = true;
    totalMatches = 0;
    resultsContainer.innerHTML = '';
    statusElement.textContent = 'Starting search...';
    
    searchButton.disabled = true;
    searchInput.disabled = true;
    filterDropdownBtn.classList.add('disabled'); 
    stopButton.disabled = false;

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
    if (afterVal) apiQuery += ` after:${afterVal}`;
    if (beforeVal) apiQuery += ` before:${beforeVal}`;

    statusElement.textContent = `Scanning page ${pageNum}... (Found: ${totalMatches})`;

    let url = `/api/search?q=${encodeURIComponent(apiQuery)}`;
    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

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

        const videos = data.items;
        if (!videos || videos.length === 0) {
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
            const title = video.snippet.title.toLowerCase().trim();
            
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
        }

        const nextPageToken = data.nextPageToken;

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

function displayResults(videos) {
    videos.forEach(video => {
        const col = document.createElement('div');
        col.className = 'col-12 col-sm-6 col-md-4 col-lg-3'; 
        const card = document.createElement('div');
        card.className = 'card h-100 shadow-sm border-0'; 
        const thumbnail = document.createElement('img');
        thumbnail.src = video.snippet.thumbnails.high.url;
        thumbnail.alt = video.snippet.title;
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
        title.textContent = video.snippet.title;
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