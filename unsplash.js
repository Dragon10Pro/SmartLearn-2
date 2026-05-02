// api/unsplash.js - نسخة Vercel
export default async function handler(req, res) {
    // إعدادات CORS للسماح بطلبات من أي مصدر
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    // معالجة طلب preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // التأكد من أن الطلب من نوع POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { word } = req.body;
        
        if (!word) {
            return res.status(400).json({ error: 'Word is required' });
        }

        // قراءة المفتاح من Environment Variables في Vercel
        const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
        
        if (!UNSPLASH_ACCESS_KEY) {
            console.error('Unsplash API key not found');
            return res.status(500).json({ error: 'Unsplash API key not configured' });
        }

        console.log(`جلب صورة لكلمة: ${word}`);

        const response = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(word)}&per_page=1&orientation=landscape`,
            {
                headers: {
                    'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Unsplash API returned ${response.status}`);
        }

        const data = await response.json();
        
        let imageUrl = null;
        if (data.results && data.results.length > 0) {
            imageUrl = data.results[0].urls.small;
        }

        return res.status(200).json({ success: true, imageUrl: imageUrl });

    } catch (error) {
        console.error('Unsplash function error:', error);
        return res.status(500).json({ error: error.message });
    }
}