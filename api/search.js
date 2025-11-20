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
        if (!youtubeResponse.ok) {
            return res.status(youtubeResponse.status).json(data);
        }
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data from YouTube API' });
    }
}