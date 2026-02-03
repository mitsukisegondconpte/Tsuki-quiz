const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'mistralai/devstral-2512:free';
const HISTORY_DIR = path.join(__dirname, '../history');

if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function getGroupHistory(groupId) {
    const filePath = path.join(HISTORY_DIR, `${groupId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function saveToGroupHistory(groupId, questions) {
    const filePath = path.join(HISTORY_DIR, `${groupId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
    let history = getGroupHistory(groupId);
    const newQuestions = questions.map(q => q.question);
    history = [...new Set([...history, ...newQuestions])];
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

async function fetchQuestions(category, level, language = 'français', groupId = 'default') {
    let categoryPrompt = category;
    if (category.toLowerCase() === 'amour') {
        categoryPrompt = "Amour Romantique. Tu es un expert en quiz. Génère un quiz de l'amour très romantique qui fait tomber les participants amoureux. Évite les questions subjectives ou d'opinion. Évite les questions sur les films ou les romans. Concentre-toi sur la psychologie de l'amour, les gestes romantiques universels et les faits scientifiques sur l'attachement.";
    }

    const history = getGroupHistory(groupId);
    const historyPrompt = history.length > 0 ? `\n\nNE POSE PAS ces questions déjà posées précédemment : ${JSON.stringify(history.slice(-50))}` : "";

    const prompt = `Génère un quiz de 10 questions en langue ${language.toUpperCase()} uniquement.
    Thème : "${categoryPrompt}"
    Niveau : "${level}"${historyPrompt}
    
    Règles strictes :
    1. Langue : ${language.toUpperCase()} OBLIGATOIRE.
    2. Format JSON pur : [{"question": "...", "choices": ["...", "..."], "answer": 0}]
    3. Pas de répétition avec les questions citées plus haut.
    4. 4 choix par question.
    `;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: `Tu es un générateur de quiz expert en ${language}. Tu ne réponds qu'en JSON.` },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://replit.com',
                    'X-Title': 'WhatsApp Quiz Bot'
                }
            }
        );

        const content = response.data.choices[0].message.content;
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const questions = JSON.parse(jsonStr);
            if (!Array.isArray(questions)) return null;
            saveToGroupHistory(groupId, questions);
            return questions;
        } catch (e) {
            return null;
        }
    } catch (error) {
        return null;
    }
}

async function generateEndComments(playerData, language = 'français') {
    const prompt = `Génère des commentaires personnalisés, drôles et uniques pour chaque joueur à la fin d'un quiz Tu es un animateur de quiz WhatsApp drôle et charismatique. Génère un commentaire court et personnalisé pour chaque joueur selon sa performance. Taquine gentiment les perdants sans les humilier, encourage-les avec humour, et félicite les gagnants avec style. Le ton doit être fun, moqueur léger, motivant et très WhatsApp-friendly. en langue ${language.toUpperCase()}.
    
    Données des joueurs :
    ${JSON.stringify(playerData)}
    
    Règles :
    1. Un commentaire par joueur.
    2. Style : Drôle, moqueur (avec tact) ou très élogieux selon le score.
    3. Langue : ${language.toUpperCase()}.
    4. Réponds UNIQUEMENT avec un objet JSON où les clés sont les IDs des joueurs et les valeurs sont les commentaires.
    5. après chaque commentaire sur un joueur utilise un ou deux saut ligne pour lautre commentaire 
    `;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: `Tu es un présentateur de quiz humoristique en ${language}. Tu ne réponds qu'en JSON.` },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.9
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://replit.com',
                    'X-Title': 'WhatsApp Quiz Bot'
                }
            }
        );

        const content = response.data.choices[0].message.content;
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        return null;
    }
}

module.exports = { fetchQuestions, generateEndComments };
