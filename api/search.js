export default async function handler(req, res) {
    const API_KEY = process.env.youtube_api_key;
    const { q, pageToken } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Search query "q" is required.' });
    }

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&key=${API_KEY}&q=${encodeURIComponent(q)}`;

    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

    try {
        const youtubeResponse = await fetch(url);
        const data = await youtubeResponse.json();
        if (data.items && q) {
            const searchTerms = q.trim().toLowerCase().split(/\s+/).filter(word => word.length > 0);

            data.items = data.items.filter(item => {
                const title = item.snippet.title || "";
                const description = item.snippet.description || "";
                const contentToCheck = (title + " " + description).toLowerCase();

                return searchTerms.every(term => {
                    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escapedTerm}\\b`);
                    return regex.test(contentToCheck);
                });
            });
        }
        if (data.error) {
            throw new Error(`youTube API error: ${data.error.message} (Code: ${data.error.code})`);
        }
        if (!youtubeResponse.ok) {
            throw new Error(`HTTP error: ${youtubeResponse.status}`);
        }
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: `An error occurred while searching.\n${error.message}` });
    }
}