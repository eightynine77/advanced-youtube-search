let isSearching = false;
let totalMatches = 0;
let query = '';

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const stopButton = document.getElementById('stop-button');
const resultsContainer = document.getElementById('results-container');
const statusElement = document.getElementById('search-status');

searchButton.addEventListener('click', startSearch);
stopButton.addEventListener('click', stopSearch);

searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        startSearch();
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
    stopButton.disabled = false;

    searchLoop(null, 1); 
}

function stopSearch() {
    isSearching = false;

    searchButton.disabled = false;
    searchInput.disabled = false;
    stopButton.disabled = true;

    if (totalMatches === 0) {
        statusElement.textContent = 'Search stopped. No matches found.';
    } else {
        statusElement.textContent = `Search stopped. Found ${totalMatches} total match(es).`;
    }
}

async function searchLoop(pageToken, pageNum) {
    if (!isSearching) {
        return; 
    }

    statusElement.textContent = `Searching page ${pageNum}... (Found ${totalMatches} so far)`;
    
    let url = `/api/search?q=${encodeURIComponent(query)}`;
    
    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            statusElement.textContent = `API Error: ${data.error.message}`;
            stopSearch();
            return;
        }

        const exactMatches = data.items.filter(item => 
            item.snippet.title.toLowerCase().includes(query.toLowerCase())
        );

        if (exactMatches.length > 0) {
            totalMatches += exactMatches.length;
            displayResults(exactMatches);
        }

        const nextPageToken = data.nextPageToken;

        if (isSearching && nextPageToken) {
            searchLoop(nextPageToken, pageNum + 1);
        } else if (!nextPageToken) {
            isSearching = false;
            statusElement.textContent = `Search complete: Reached the end of results. Found ${totalMatches} match(es).`;
            searchButton.disabled = false;
            searchInput.disabled = false;
            stopButton.disabled = true;
        }

    } catch (error) {
        statusElement.textContent = `Network Error: ${error.message}`;
        stopSearch();
    }
}

function displayResults(videos) {
    videos.forEach(video => {
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';

        const videoLink = document.createElement('a');
        videoLink.href = `https://www.youtube.com/watch?v=${video.id.videoId}`;
        videoLink.target = '_blank';
        videoLink.rel = 'noopener noreferrer';

        const thumbnail = document.createElement('img');
        thumbnail.src = video.snippet.thumbnails.high.url;
        thumbnail.alt = video.snippet.title;

        const title = document.createElement('h3');
        title.textContent = video.snippet.title;

        videoLink.appendChild(thumbnail);
        videoLink.appendChild(title);
        videoItem.appendChild(videoLink);
        resultsContainer.appendChild(videoItem);
    });
}