let isSearching = false;
let totalMatches = 0;
let query = '';

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const stopButton = document.getElementById('stop-button');
const resultsContainer = document.getElementById('results-container');
const statusElement = document.getElementById('search-status');
const filterSelect = document.getElementById('search-filter');

searchButton.addEventListener('click', startSearch);
stopButton.addEventListener('click', stopSearch);

searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        startSearch();
    }
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
    filterSelect.disabled = true; 
    stopButton.disabled = false;

    searchLoop(null, 1); 
}

function stopSearch() {
    isSearching = false;

    searchButton.disabled = false;
    searchInput.disabled = false;
    filterSelect.disabled = false; 
    stopButton.disabled = true;

    if (totalMatches === 0) {
        statusElement.textContent = 'Search stopped. No matches found yet.';
    } else {
        statusElement.textContent = `Search stopped. Found ${totalMatches} match(es).`;
    }
}

async function searchLoop(pageToken, pageNum) {
    if (!isSearching) return;

    statusElement.textContent = `Scanning page ${pageNum}... (Found: ${totalMatches})`;

    let url = `/api/search?q=${encodeURIComponent(query)}`;
    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Unknown error');
        }

        const videos = data.items;
        if (!videos || videos.length === 0) {
            isSearching = false;
            statusElement.textContent = `Search complete. Found ${totalMatches} match(es).`;
            searchButton.disabled = false;
            searchInput.disabled = false;
            filterSelect.disabled = false;
            stopButton.disabled = true;
            return;
        }

        const filterType = filterSelect.value;
        const normalizedQuery = query.toLowerCase().trim();
        const exactMatches = videos.filter(video => {
            const title = video.snippet.title.toLowerCase().trim();
            
            if (filterType === 'exact') {
                return title === normalizedQuery;
            } else {
                return title.includes(normalizedQuery);
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
            filterSelect.disabled = false;
            stopButton.disabled = true;
        }

    } catch (error) {
        statusElement.textContent = `Network error: ${error.message}`;
        stopSearch();
    }
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
        title.className = 'card-title fs-6'; 
        title.textContent = video.snippet.title;
        const videoLink = document.createElement('a');
        videoLink.href = `https://www.youtube.com/watch?v=${video.id.videoId}`;
        videoLink.target = '_blank';
        videoLink.rel = 'noopener noreferrer';
        videoLink.className = 'btn btn-outline-danger mt-auto'; 
        videoLink.textContent = 'Watch Video';
        cardBody.appendChild(title);
        cardBody.appendChild(videoLink);
        card.appendChild(thumbnail);
        card.appendChild(cardBody);
        col.appendChild(card);
        resultsContainer.appendChild(col);
    });
}