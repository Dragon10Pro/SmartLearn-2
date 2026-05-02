// api/deepseek.js - نسخة Vercel
export default async function handler(req, res) {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { action, text, word, term } = req.body;

        // قراءة المفتاح من Environment Variables في Vercel
        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
        
        if (!DEEPSEEK_API_KEY) {
            return res.status(500).json({ error: 'DeepSeek API key not configured' });
        }

        let prompt = '';
        
        if (action === 'translate' && text) {
            prompt = `Translate the following English text to Arabic. Provide only the translation.\n\nText: "${text}"\n\nArabic translation:`;
        } 
        else if (action === 'example' && word) {
            prompt = `Create a simple example sentence for the word "${word}". Output only the sentence.`;
        } 
        else if (action === 'explain' && term) {
            prompt = `Explain the term "${term}" in simple Arabic. Provide definition, context, and an example.`;
        } 
        else if (action === 'flashcard' && word) {
            prompt = `Create a flashcard for "${word}". Output in JSON format: {"translation":"...", "example":"...", "synonyms":["...","...","..."]}`;
        } 
        else {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'API request failed');
        }

        const reply = data.choices[0].message.content;

        if (action === 'flashcard') {
            try {
                const parsed = JSON.parse(reply);
                return res.status(200).json({ success: true, data: parsed });
            } catch (e) {
                return res.status(200).json({ success: true, raw: reply });
            }
        }

        return res.status(200).json({ success: true, result: reply });

    } catch (error) {
        console.error('DeepSeek function error:', error);
        return res.status(500).json({ error: error.message });
    }
}