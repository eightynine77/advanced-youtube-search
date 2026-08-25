export default async function handler(req, res) {
    const API_KEY = process.env.youtube_api_key;
    const { q, pageToken, publishedAfter, publishedBefore } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Search query "q" is required.' });
    }

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&safeSearch=none&key=${API_KEY}&q=${encodeURIComponent(q)}`;

    if (pageToken) url += `&pageToken=${pageToken}`;
    if (publishedAfter) url += `&publishedAfter=${publishedAfter}`;
    if (publishedBefore) url += `&publishedBefore=${publishedBefore}`;

    try {
        const youtubeResponse = await fetch(url);
        const data = await youtubeResponse.json();

        if (data.error) {
            throw new Error(`youTube API error: ${data.error.message} (Code: ${data.error.code})`);
        }
        if (!youtubeResponse.ok) {
            throw new Error(`HTTP error: ${youtubeResponse.status}`);
        }

        // --- NEW: FETCH VIEWS AND DURATION ---
        if (data.items && data.items.length > 0) {
            // Extract the video IDs from the search results
            const videoIds = data.items.map(item => item.id.videoId).join(',');
            
            // Hit the /videos endpoint for statistics and contentDetails
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            // Map the new details back into the original search data
            if (detailsData.items) {
                const detailsMap = {};
                detailsData.items.forEach(vid => {
                    detailsMap[vid.id] = {
                        duration: vid.contentDetails.duration,
                        viewCount: vid.statistics.viewCount
                    };
                });

                data.items = data.items.map(item => {
                    if (detailsMap[item.id.videoId]) {
                        item.contentDetails = { duration: detailsMap[item.id.videoId].duration };
                        item.statistics = { viewCount: detailsMap[item.id.videoId].viewCount };
                    }
                    return item;
                });
            }
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: `An error occurred while searching.\n${error.message}` });
    }
}