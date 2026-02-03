const { fetchQuestions, generateEndComments } = require('./quizAPI');

class QuizManager {
    constructor(sendMessage) {
        this.quizzes = new Map();
        this.sendMessage = (sock, jid, text, mentions = [], buttons = []) => {
            const { sendMessageWA } = require('../utils/sendMessageWA');
            return sendMessageWA(sock, jid, text, mentions, buttons);
        };
        this.questionHistory = new Set();
        this.lastQuizStats = new Map();
    }

    async handleMessage(sock, msg, from, body, sender, rawMsg) {
        let quiz = this.quizzes.get(from);
        const bodyClean = (body || "").trim().toLowerCase();

        // Commande rapide : !quiz [mode] [categorie] [langue] [niveau]
        // Exemple: !quiz solo anime fr facile
        if (bodyClean.startsWith('!quiz') && bodyClean.split(' ').length > 1) {
            if (quiz && quiz.state !== 'ended') {
                await this.sendMessage(sock, from, "🚫 Un quiz est déjà en cours !");
                return;
            }
            const args = bodyClean.split(' ');
            const modeInput = args[1];
            const catInput = args[2];
            const langInput = args[3];
            const lvlInput = args[4];

            // Validation du mode
            let mode = null;
            if (['solo', 'alone'].includes(modeInput)) mode = 'solo';
            else if (['equipe', 'team', 'équipe'].includes(modeInput)) mode = 'team';
            
            if (!mode) {
                await this.sendMessage(sock, from, "❌ *MODE INCORRECT !*\nUtilisez : `solo` ou `equipe`.\n\n💡 *Exemple :* `!quiz solo general fr moyen`", [sender]);
                return;
            }

            // Validation de la catégorie
            const validCats = ['general', 'anime', 'manga', 'amour', 'sport', 'gaming', 'cinema', 'musique', 'science', 'histoire', 'tech', 'cuisine'];
            let category = catInput || 'general';
            if (!validCats.includes(category)) {
                await this.sendMessage(sock, from, `❌ *CATÉGORIE INCONNUE !*\nChoisissez parmi : ${validCats.join(', ')}.\n\n💡 *Exemple :* \`!quiz solo anime fr facile\``, [sender]);
                return;
            }

            // Validation de la langue
            let lang = 'français';
            if (langInput) {
                if (['cr', 'creole', 'créole'].includes(langInput)) lang = 'créole';
                else if (['fr', 'francais', 'français'].includes(langInput)) lang = 'français';
                else {
                    await this.sendMessage(sock, from, "❌ *LANGUE INCORRECTE !*\nUtilisez : `fr` ou `cr`.\n\n💡 *Exemple :* `!quiz solo general cr moyen`", [sender]);
                    return;
                }
            }

            // Validation du niveau
            const validLvls = ['facile', 'moyen', 'difficile', 'infernal'];
            let level = lvlInput || 'moyen';
            if (!validLvls.includes(level)) {
                await this.sendMessage(sock, from, `❌ *NIVEAU INCORRECT !*\nChoisissez : facile, moyen, difficile ou infernal.\n\n💡 *Exemple :* \`!quiz solo general fr infernal\``, [sender]);
                return;
            }
            
            this.quizzes.set(from, {
                state: mode === 'team' ? 'selecting_teams' : 'waiting_players',
                players: new Map(),
                questions: [],
                currentQuestionIndex: 0,
                language: lang,
                mode: mode,
                category: category,
                level: level,
                goStarted: true,
                quickCommand: true, 
                teams: mode === 'team' ? { rouge: new Set(), bleu: new Set() } : null
            });
            
            if (mode === 'solo') {
                const buttons = [{ id: 'go', text: '🚀 LANCER / S\'INSCRIRE' }];
                const resp = await this.sendMessage(sock, from, `👤 *MODE SOLO RAPIDE*\n📂 Catégorie: ${category.toUpperCase()}\n🌍 Langue: ${lang.toUpperCase()}\n📊 Niveau: ${level.toUpperCase()}\n\nCliquez sur *LANCER* pour vous inscrire !\n⌛ Lancement automatique dans *30 secondes*...`, [], buttons);
                
                if (resp && resp.key) {
                    let waitTime = 30;
                    quiz.timer = setInterval(async () => {
                        waitTime--;
                        if (waitTime <= 0) {
                            clearInterval(quiz.timer);
                            if (this.quizzes.has(from)) {
                                await this.startQuiz(sock, from);
                            }
                        } else if (waitTime % 10 === 0 || waitTime <= 5) {
                            try { await sock.sendMessage(from, { react: { text: '⏳', key: resp.key } }); } catch (e) {}
                        }
                    }, 1000);
                } else {
                    quiz.timer = setTimeout(() => this.startQuiz(sock, from), 30000);
                }
            } else {
                const buttons = [{ id: 'team:rouge', text: '🔴 ÉQUIPE ROUGE' }, { id: 'team:bleu', text: '🔵 ÉQUIPE BLEU' }];
                await this.sendMessage(sock, from, `⚔️ *MODE ÉQUIPE RAPIDE*\n📂 Catégorie: ${category.toUpperCase()}\n🌍 Langue: ${lang.toUpperCase()}\n📊 Niveau: ${level.toUpperCase()}\n\n*REJOIGNEZ VOTRE ÉQUIPE !*`, [], buttons);
            }
            return;
        }

        if (bodyClean.startsWith('!regle')) {
            let help = "📜 *GUIDE COMPLET DU QUIZ TSUKI* 📜\n\n";
            
            if (bodyClean === '!regle') {
                help += "🌟 *BUT DU JEU :* Accumuler le plus de points en répondant aux questions.\n\n";
                help += "🚀 *DÉMARRAGE RAPIDE :*\n";
                help += "Utilisez: `!quiz [mode] [catégorie] [langue] [niveau]`\n";
                help += "Exemple: `!quiz solo anime fr difficile`\n\n";
                help += "🕹️ *COMMANDES DISPONIBLES :*\n";
                help += "- `!quiz` : Menu interactif étape par étape.\n";
                help += "- `!regle solo` : Détails du mode Solo.\n";
                help += "- `!regle equipe` : Détails du mode Équipe.\n";
                help += "- `!cancel` : Arrêter le quiz en cours.";
                await this.sendMessage(sock, from, help);
                return;
            }

            if (bodyClean.includes('equipe')) {
                help += "👥 *MODE ÉQUIPE (Bataille Royale) :*\n";
                help += "- *Chacun son tour :* Seule l'équipe dont c'est le tour (Rouge ou Bleu) peut répondre.\n";
                help += "- *Points :* +20 pts par bonne réponse.\n";
                help += "- *Pénalité Hors-tour :* -5 pts si tu réponds quand c'est pas ton tour ! 🚫\n";
                help += "- *La Réplique :* Si l'équipe adverse se trompe, tu as 10s pour cliquer sur 'RÉPLIQUE' et voler 10 pts ! 🎤\n";
            } else {
                help += "👤 *MODE SOLO (Course à la montre) :*\n";
                help += "- *Tous ensemble :* Tout le monde peut répondre en même temps.\n";
                help += "- *Bonus de Vitesse :*\n";
                help += "  •  -5 sec : +30 pts (Flash ! ⚡)\n";
                help += "  •  -10 sec : +25 pts (Rapide ! 🏃)\n";
                help += "  •  Normal : +20 pts.\n";
            }
            
            if (bodyClean.includes('infernal')) {
                help += "\n💀 *MODE INFERNAL (Danger) :*\n";
                help += "- Les erreurs retirent des points (-10 pts).\n";
                help += "- Une réplique ratée coûte encore plus cher (-20 pts) !";
            }
            
            await this.sendMessage(sock, from, help);
            return;
        }

        if (bodyClean === '!quiz') {
            if (quiz && quiz.state !== 'ended') {
                await this.sendMessage(sock, from, "🚫 Un quiz est déjà en cours ! Tapez *!cancel* pour l'arrêter.");
                return;
            }
            this.askGameMode(sock, from);
            return;
        }

        if (!quiz) return;

        if (bodyClean === '!cancel') {
            await this.sendMessage(sock, from, "🛑 *OPÉRATION ANNULÉE !* 🚪");
            if (quiz.timer) clearTimeout(quiz.timer);
            this.quizzes.delete(from);
            return;
        }

        switch (quiz.state) {
            case 'selecting_mode':
                if (bodyClean.includes('solo')) {
                    quiz.mode = 'solo';
                    quiz.state = 'selecting_category_page_1';
                    await this.showCategoryMenu(sock, from, 1);
                } else if (bodyClean.includes('team')) {
                    quiz.mode = 'team';
                    quiz.state = 'selecting_teams';
                    quiz.teams = { rouge: new Set(), bleu: new Set() };
                    const buttons = [
                        { id: 'team:rouge', text: '🔴 ÉQUIPE ROUGE' },
                        { id: 'team:bleu', text: '🔵 ÉQUIPE BLEU' }
                    ];
                    await this.sendMessage(sock, from, "⚔️ *CHOISISSEZ VOTRE ÉQUIPE !* ⚔️", [], buttons);
                }
                break;

            case 'selecting_teams':
                if (bodyClean.includes('rouge') || bodyClean.includes('bleu')) {
                    const team = bodyClean.includes('rouge') ? 'rouge' : 'bleu';
                    await this.handleTeamJoin(sock, from, sender, team);
                } else if (bodyClean === 'ready' || bodyClean === 'pret' || bodyClean === 'prêt' || bodyClean === 'go' || bodyClean === 'lancer') {
                    await this.validateTeams(sock, from);
                }
                break;

            case 'selecting_category_page_1':
            case 'selecting_category_page_2':
            case 'selecting_category_page_3':
                await this.handleCategorySelection(sock, from, bodyClean);
                break;

            case 'selecting_level':
                await this.handleLevelSelection(sock, from, bodyClean);
                break;

            case 'selecting_lang':
                await this.handleLangSelection(sock, from, bodyClean);
                break;

            case 'waiting_players':
                if (bodyClean === 'go' || bodyClean === 'lancer' || bodyClean.includes('s\'inscrire')) {
                    await this.handlePlayerJoin(sock, from, sender);
                }
                break;

            case 'in_progress':
                await this.handleAnswer(sock, from, sender, body, rawMsg);
                break;
        }
    }

    async askGameMode(sock, from) {
        this.quizzes.set(from, {
            state: 'selecting_mode',
            players: new Map(),
            questions: [],
            currentQuestionIndex: 0,
            language: 'français',
            mode: 'solo',
            goStarted: false
        });
        const buttons = [{ id: 'mode:solo', text: '👤 SOLO' }, { id: 'mode:team', text: '👥 ÉQUIPE' }];
        await this.sendMessage(sock, from, `🎮 *BIENVENUE AU QUIZ !*\n\nChoisissez votre mode de jeu :`, [], buttons);
    }

    async handleTeamJoin(sock, from, sender, team) {
        const quiz = this.quizzes.get(from);
        
        // Vérifier si déjà dans une équipe
        const currentTeam = quiz.teams.rouge.has(sender) ? 'rouge' : (quiz.teams.bleu.has(sender) ? 'bleu' : null);
        
        // Autoriser le changement d'équipe si on clique sur l'autre, mais bloquer si on clique sur la même
        if (currentTeam === team) {
            await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, tu es déjà dans l'équipe *${team.toUpperCase()}* !`, [sender]);
            return;
        }

        const oppositeTeam = team === 'rouge' ? 'bleu' : 'rouge';
        quiz.teams[oppositeTeam].delete(sender);
        quiz.teams[team].add(sender);
        quiz.players.set(sender, 0);
        
        // Message de bienvenue pour l'équipe
        await this.sendMessage(sock, from, `👋 *BIENVENUE !* @${sender.split('@')[0]} rejoint l'équipe *${team.toUpperCase()}* !`, [sender]);
        
        // En mode équipe, on propose juste le bouton "PRÊT"
        const buttons = [{ id: 'ready', text: '✅ PRÊT !' }];
        await this.sendMessage(sock, from, `✅ @${sender.split('@')[0]} est dans l'équipe *${team.toUpperCase()}* !`, [sender], buttons);
    }

    async validateTeams(sock, from) {
        const quiz = this.quizzes.get(from);
        if (quiz.teams.rouge.size === 0 || quiz.teams.bleu.size === 0) {
            await this.sendMessage(sock, from, "🚫 *ERREUR :* Chaque équipe doit avoir au moins 1 joueur pour lancer le quiz !");
            return;
        }
        
        // Si c'est une commande rapide, on lance direct le quiz après validation des équipes
        if (quiz.quickCommand) {
            await this.startQuiz(sock, from);
        } else {
            quiz.state = 'selecting_category_page_1';
            await this.showCategoryMenu(sock, from, 1);
        }
    }

    async showCategoryMenu(sock, from, page) {
        let text = `✨ *MENU DES CATÉGORIES (${page}/3)* ✨\n\n`;
        let buttons = [];
        if (page === 1) {
            text += `1. 🌍 Général\n2. 🇯🇵 Anime\n3. 📚 Manga\n4. ❤️ Amour`;
            buttons = [
                { id: 'cat:general', text: '🌍 GÉNÉRAL' }, { id: 'cat:anime', text: '🇯🇵 ANIME' },
                { id: 'cat:manga', text: '📚 MANGA' }, { id: 'cat:amour', text: '❤️ AMOUR' },
                { id: 'cat:next', text: '➡️ SUIVANT' }
            ];
        } else if (page === 2) {
            text += `5. ⚽ Sport\n6. 🎮 Gaming\n7. 🎬 Cinéma\n8. 🎵 Musique`;
            buttons = [
                { id: 'cat:sport', text: '⚽ SPORT' }, { id: 'cat:gaming', text: '🎮 GAMING' },
                { id: 'cat:cinema', text: '🎬 CINÉMA' }, { id: 'cat:musique', text: '🎵 MUSIQUE' },
                { id: 'cat:next', text: '➡️ SUIVANT' }, { id: 'cat:prev', text: '⬅️ RETOUR' }
            ];
        } else {
            text += `9. 🧪 Science\n10. 🏛️ Histoire\n11. 💻 Tech\n12. 🍕 Cuisine`;
            buttons = [
                { id: 'cat:science', text: '🧪 SCIENCE' }, { id: 'cat:histoire', text: '🏛️ HISTOIRE' },
                { id: 'cat:tech', text: '💻 TECH' }, { id: 'cat:cuisine', text: '🍕 CUISINE' },
                { id: 'cat:prev', text: '⬅️ RETOUR' }
            ];
        }
        await this.sendMessage(sock, from, text, [], buttons);
    }

    async handleCategorySelection(sock, from, body) {
        const quiz = this.quizzes.get(from);
        const page = parseInt(quiz.state.slice(-1));
        if (body.includes('next')) {
            quiz.state = `selecting_category_page_${page + 1}`;
            await this.showCategoryMenu(sock, from, page + 1);
        } else if (body.includes('prev')) {
            quiz.state = `selecting_category_page_${page - 1}`;
            await this.showCategoryMenu(sock, from, page - 1);
        } else {
            quiz.category = body.split(':').pop();
            quiz.state = 'selecting_level';
            const buttons = [
                { id: 'lvl:facile', text: '🌱 FACILE' },
                { id: 'lvl:moyen', text: '🌿 MOYEN' },
                { id: 'lvl:difficile', text: '🔥 DIFFICILE' },
                { id: 'lvl:infernal', text: '💀 INFERNAL' }
            ];
            await this.sendMessage(sock, from, `📊 *NIVEAU DE DÉFI*`, [], buttons);
        }
    }

    async handleLevelSelection(sock, from, body) {
        const quiz = this.quizzes.get(from);
        quiz.level = body.split(':').pop();
        if (quiz.level === 'infernal') {
            await this.sendMessage(sock, from, "🚨 *MODE INFERNAL ACTIVÉ !* Préparez-vous à souffrir ! 💀");
        }
        quiz.state = 'selecting_lang';
        const buttons = [{ id: 'lang:fr', text: '🇫🇷 FRANÇAIS' }, { id: 'lang:cr', text: '🇭🇹 CRÉOLE' }];
        await this.sendMessage(sock, from, `🌐 *LANGUE DU QUIZ*`, [], buttons);
    }

    async handleLangSelection(sock, from, body) {
        const quiz = this.quizzes.get(from);
        quiz.language = body.includes('cr') ? 'créole' : 'français';
        quiz.state = 'waiting_players';
        quiz.goStarted = true;
        const buttons = [{ id: 'go', text: '🚀 LANCER' }];
        const resp = await this.sendMessage(sock, from, `📢 *PRÊT ?* Cliquez sur *LANCER* pour démarrer ! 🚀`, [], buttons);
        if (resp && resp.key) {
            let goTime = 15;
            quiz.timer = setInterval(async () => {
                goTime--;
                if (goTime <= 0) { clearInterval(quiz.timer); this.startQuiz(sock, from); }
                else if (goTime <= 5) { try { await sock.sendMessage(from, { react: { text: '⏳', key: resp.key } }); } catch (e) {} }
            }, 1000);
        } else { setTimeout(() => this.startQuiz(sock, from), 10000); }
    }

    async handlePlayerJoin(sock, from, sender) {
        const quiz = this.quizzes.get(from);
        
        // Sécurité inscription
        if (quiz.players.has(sender)) {
            await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, tu es déjà inscrit !`, [sender]);
            return;
        }

        quiz.players.set(sender, 0);
        if (quiz.mode === 'team') {
            if (!quiz.teams.rouge.has(sender) && !quiz.teams.bleu.has(sender)) quiz.teams.rouge.add(sender);
        }
        // Message de bienvenue systématique
        await this.sendMessage(sock, from, `👋 *BIENVENUE !* @${sender.split('@')[0]} participe au quiz !`, [sender]);
        await sock.sendMessage(from, { react: { text: '✅', key: { remoteJid: from, id: sender } } }).catch(() => {});

        // Si c'est une commande rapide et qu'il y a des joueurs inscrits, on s'assure que le quiz démarre bien
        if (quiz.quickCommand && quiz.mode === 'solo' && !quiz.timer) {
            this.startQuiz(sock, from);
        }
    }

    async handleAnswer(sock, from, sender, body, msg) {
        const quiz = this.quizzes.get(from);
        if (!quiz) return;
        const currentQ = quiz.questions[quiz.currentQuestionIndex];
        if (!currentQ || currentQ.answered) return;

        let processed = (body || "").trim().toUpperCase();
        if (processed.includes(':')) {
            const parts = processed.split(':');
            processed = parts[parts.length - 1].toUpperCase();
        }

        const senderTeam = quiz.mode === 'team' ? (quiz.teams.rouge.has(sender) ? 'rouge' : (quiz.teams.bleu.has(sender) ? 'bleu' : null)) : null;

        const deleteMessage = async () => {
            try {
                if (sock.authState.creds.me.id.includes(':')) { // simple check for bot being admin
                    await sock.sendMessage(from, { delete: msg.key });
                }
            } catch (e) {}
        };

        try {
            // RÉPLIQUE
            if (processed === 'REPLICA' || processed === 'REPLIQUE' || processed === 'RÉPLIQUE') {
                if (quiz.mode === 'team') {
                    if (senderTeam === quiz.currentTurn) {
                        await deleteMessage();
                        await this.sendMessage(sock, from, `🚫 @${sender.split('@')[0]}, ton équipe a déjà la main ! Réponds directement.`, [sender]);
                        return;
                    }
                    if (currentQ.canReplica && !currentQ.replicaUsed) {
                        currentQ.replicaUsed = true;
                        currentQ.replicaBy = sender;
                        currentQ.canReplica = false; // Fermer immédiatement l'accès aux autres
                        
                        if (quiz.timer) {
                            clearInterval(quiz.timer);
                            clearTimeout(quiz.timer);
                            quiz.timer = null;
                        }
                        
                        // Réaction de boost pour la réplique
                        await sock.sendMessage(from, { react: { text: '🔥', key: msg.key } }).catch(() => {});
                        
                        await this.sendMessage(sock, from, `🎤 *RÉPLIQUE ACTIVÉE* par @${sender.split('@')[0]} !`, [sender], [
                            { id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }
                        ]);
                        quiz.timer = setTimeout(() => this.showAnswer(sock, from), 10000);
                    } else if (currentQ.replicaUsed) {
                        await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, la RÉPLIQUE a déjà été prise !`, [sender]);
                    } else if (!currentQ.canReplica) {
                        await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, tu ne peux pas encore RÉPLIQUER. Attends une erreur !`, [sender]);
                    }
                }
                return;
            }

            const choices = ['A', 'B', 'C', 'D'];
            if (!choices.includes(processed)) {
                // Si ce n'est pas un choix A,B,C,D, on ne traite pas comme une réponse
                return;
            }

            // Réaction visuelle immédiate sur le choix
            await sock.sendMessage(from, { react: { text: '🔘', key: msg.key } }).catch(() => {});

            const isCorrect = choices.indexOf(processed) === currentQ.data.answer;

            if (quiz.mode === 'team') {
                if (currentQ.replicaUsed) {
                    if (sender !== currentQ.replicaBy) {
                        await deleteMessage();
                        await this.sendMessage(sock, from, `🚫 @${sender.split('@')[0]}, seule la personne en RÉPLIQUE peut répondre !`, [sender]);
                        return;
                    }
                    currentQ.answered = true;
                    if (isCorrect) {
                        quiz.players.set(sender, (quiz.players.get(sender) || 0) + 10);
                        await this.sendMessage(sock, from, `🌟 *RÉPLIQUE RÉUSSIE !* +10 pts pour l'équipe ${senderTeam.toUpperCase()} !`);
                    } else {
                        quiz.players.set(sender, (quiz.players.get(sender) || 0) - (quiz.level === 'infernal' ? 20 : 10));
                        await this.sendMessage(sock, from, `💀 *RÉPLIQUE ÉCHOUÉE !* -${quiz.level === 'infernal' ? 20 : 10} pts pour l'équipe ${senderTeam.toUpperCase()} !`);
                    }
                } else {
                    if (senderTeam !== quiz.currentTurn) {
                        if (quiz.players.has(sender)) {
                            await deleteMessage();
                            quiz.players.set(sender, (quiz.players.get(sender) || 0) - 5);
                            await this.sendMessage(sock, from, `🚫 @${sender.split('@')[0]}, ce n'est pas le tour de ton équipe ! *-5 pts* ⏳`, [sender]);
                        } else {
                            await deleteMessage();
                        }
                        return;
                    }
                    if (currentQ.answeredByTeam) {
                        await deleteMessage();
                        await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, ton équipe a déjà répondu ! 🛑`, [sender]);
                        return;
                    }
                    
                    currentQ.answeredByTeam = true;
                    if (isCorrect) {
                        currentQ.answered = true;
                        quiz.players.set(sender, (quiz.players.get(sender) || 0) + 20);
                        await this.sendMessage(sock, from, `✅ *BRAVO !* +20 pts pour l'équipe ${senderTeam.toUpperCase()} !`);
                    } else {
                        if (currentQ.canReplica) return; // Sécurité anti-spam réplique
                        currentQ.canReplica = true;
                        if (quiz.level === 'infernal') quiz.players.set(sender, (quiz.players.get(sender) || 0) - 10);
                        const buttons = [{ id: 'REPLICA', text: '🎤 RÉPLIQUE' }];
                        await this.sendMessage(sock, from, `❌ *ÉCHEC de l'équipe ${senderTeam.toUpperCase()} !* L'adversaire a 10s pour RÉPLIQUER !`, [sender], buttons);
                        
                        // Timer de 10s pour la réplique après une erreur
                        if (quiz.timer) { clearInterval(quiz.timer); clearTimeout(quiz.timer); }
                        quiz.timer = setTimeout(() => {
                            if (!currentQ.replicaUsed && currentQ.canReplica) {
                                currentQ.canReplica = false;
                                this.showAnswer(sock, from);
                            }
                        }, 10000);
                        return;
                    }
                }
            } else {
                // SOLO
                if (!quiz.players.has(sender)) {
                    await deleteMessage();
                    await this.sendMessage(sock, from, `🚫 @${sender.split('@')[0]}, tu ne t'es pas inscrit (LANCER) !`, [sender]);
                    return;
                }
                if (currentQ.answeredBy && currentQ.answeredBy.has(sender)) {
                    await deleteMessage();
                    await this.sendMessage(sock, from, `⚠️ @${sender.split('@')[0]}, tu as déjà répondu ! 🛑`, [sender]);
                    return;
                }
                
                if (!currentQ.answeredBy) currentQ.answeredBy = new Set();
                currentQ.answeredBy.add(sender);

                if (isCorrect) {
                    let pts = 20;
                    if (quiz.mode === 'solo') {
                        // Estimation basée sur timeLeft du timer (30s par défaut)
                        const timeTaken = 30 - timeLeft;
                        if (timeTaken <= 5) pts = 30;
                        else if (timeTaken <= 10) pts = 25;
                    }
                    const currentPoints = quiz.players.get(sender) || 0;
                    quiz.players.set(sender, currentPoints + pts);
                    await this.sendMessage(sock, from, `✅ *BRAVO* @${sender.split('@')[0]} ! +${pts} pts !`, [sender]);
                } else if (quiz.level === 'infernal') {
                    const currentPoints = quiz.players.get(sender) || 0;
                    quiz.players.set(sender, currentPoints - 10);
                    await this.sendMessage(sock, from, `❌ *MAUVAISE RÉPONSE* @${sender.split('@')[0]} ! -10 pts ! 💀`, [sender]);
                }

                if (currentQ.answeredBy.size === quiz.players.size) {
                    currentQ.answered = true;
                } else {
                    return;
                }
            }

            if (quiz.timer) clearInterval(quiz.timer);
            await this.showAnswer(sock, from);
        } catch (e) {
            console.error("Erreur handleAnswer:", e);
        }
    }

    async startQuiz(sock, from) {
        const quiz = this.quizzes.get(from);
        if (!quiz || quiz.state === 'starting' || quiz.state === 'in_progress') return;
        
        quiz.state = 'starting';
        if (quiz.timer) {
            clearInterval(quiz.timer);
            clearTimeout(quiz.timer);
            quiz.timer = null;
        }

        if (quiz.players.size === 0) {
            await this.sendMessage(sock, from, "📉 Personne n'a rejoint. Quiz annulé.");
            this.quizzes.delete(from); return;
        }
        await this.sendMessage(sock, from, "🌀 *CHARGEMENT DES QUESTIONS...* 🧠⚡");
        const questions = await fetchQuestions(quiz.category, quiz.level, quiz.language, from);
        if (!questions) {
            await this.sendMessage(sock, from, "💥 Erreur technique. Réessayez.");
            this.quizzes.delete(from); return;
        }
        quiz.questions = questions.map(q => ({ data: q, answered: false, canReplica: false, replicaUsed: false, answeredBy: new Set() }));
        quiz.state = 'in_progress';
        quiz.currentTurn = 'rouge';
        await this.nextQuestion(sock, from);
    }

    async nextQuestion(sock, from) {
        const quiz = this.quizzes.get(from);
        if (!quiz) return;
        if (quiz.currentQuestionIndex >= 10) { await this.endQuiz(sock, from); return; }
        const q = quiz.questions[quiz.currentQuestionIndex];
        let text = `🎯 *QUESTION ${quiz.currentQuestionIndex + 1}/10*\n\n`;
        if (quiz.mode === 'team') text += `🚩 TOUR : *${quiz.currentTurn.toUpperCase()}*\n\n`;
        text += `${q.data.question}\n\n🇦 ${q.data.choices[0]}\n🇧 ${q.data.choices[1]}\n🇨 ${q.data.choices[2]}\n🇩 ${q.data.choices[3]}`;
        const buttons = [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }];
        const resp = await this.sendMessage(sock, from, text, [], buttons);
        
        let timeLeft = 30;
        quiz.timer = setInterval(async () => {
            timeLeft--;
            
            // Compte à rebours visuel avec réactions sur les 10 dernières secondes
            if (resp && resp.key && timeLeft <= 10 && timeLeft >= 0) {
                const reactions = ['🔟', '9️⃣', '8️⃣', '7️⃣', '6️⃣', '5️⃣', '4️⃣', '3️⃣', '2️⃣', '1️⃣', '⏰'];
                const emoji = reactions[10 - timeLeft];
                try { await sock.sendMessage(from, { react: { text: emoji, key: resp.key } }); } catch (e) {}
            }

            if (timeLeft <= 0) {
                clearInterval(quiz.timer);
                if (quiz.mode === 'team' && !q.answered && !q.replicaUsed) {
                    if (q.canReplica) return; // Sécurité anti-double message réplique
                    q.canReplica = true;
                    const buttons = [{ id: 'REPLICA', text: '🎤 RÉPLIQUE' }];
                    await this.sendMessage(sock, from, `⏰ *TEMPS ÉCOULÉ !* L'équipe ${quiz.currentTurn.toUpperCase()} n'a pas répondu. L'adversaire a 10s pour RÉPLIQUER !`, [], buttons);
                    
                    // Ajout du timeout pour passer à la suite si personne ne réplique
                    quiz.timer = setTimeout(() => {
                        if (!q.replicaUsed && q.canReplica) {
                            q.canReplica = false; // Fermer la réplique
                            this.showAnswer(sock, from);
                        }
                    }, 10000);
                } else {
                    await this.showAnswer(sock, from);
                }
            }
        }, 1000);
    }

    async showAnswer(sock, from) {
        const quiz = this.quizzes.get(from);
        if (!quiz) return;
        const q = quiz.questions[quiz.currentQuestionIndex];
        const correctChar = ['A', 'B', 'C', 'D'][q.data.answer];
        
        let scoreText = `\n\n📊 *SCORES :*\n`;
        if (quiz.mode === 'team') {
            let ptsRouge = 0;
            let ptsBleu = 0;
            quiz.teams.rouge.forEach(j => ptsRouge += (quiz.players.get(j) || 0));
            quiz.teams.bleu.forEach(j => ptsBleu += (quiz.players.get(j) || 0));
            scoreText = `\n\n📊 *SCORES ÉQUIPES :*\n🔴 ROUGE : ${ptsRouge} pts\n🔵 BLEU : ${ptsBleu} pts\n`;
        } else {
            [...quiz.players.entries()].sort((a,b) => b[1]-a[1]).forEach(([j,p]) => {
                scoreText += `- @${j.split('@')[0]} : ${p} pts\n`;
            });
        }

        await this.sendMessage(sock, from, `💡 *RÉPONSE :* ${correctChar}\n\n${q.data.explanation || ''}${scoreText}`, [...quiz.players.keys()]);
        quiz.currentQuestionIndex++;
        if (quiz.mode === 'team') quiz.currentTurn = quiz.currentTurn === 'rouge' ? 'bleu' : 'rouge';
        setTimeout(() => this.nextQuestion(sock, from), 4000);
    }

    async endQuiz(sock, from) {
        const quiz = this.quizzes.get(from);
        const sorted = [...quiz.players.entries()].sort((a, b) => b[1] - a[1]);
        
        let res = `🏆 *FIN DU QUIZ* 🏆\n\n`;
        
        if (quiz.mode === 'team') {
            let ptsRouge = 0;
            let ptsBleu = 0;
            quiz.teams.rouge.forEach(j => ptsRouge += (quiz.players.get(j) || 0));
            quiz.teams.bleu.forEach(j => ptsBleu += (quiz.players.get(j) || 0));
            
            const winner = ptsRouge > ptsBleu ? "🔴 ÉQUIPE ROUGE" : (ptsBleu > ptsRouge ? "🔵 ÉQUIPE BLEU" : "🤝 ÉGALITÉ");
            res += `🏁 *RÉSULTAT FINAL :* ${winner}\n\n`;
            res += `🔴 ROUGE : ${ptsRouge} pts\n🔵 BLEU : ${ptsBleu} pts\n\n`;
            
            const mvpRouge = [...quiz.teams.rouge].sort((a,b) => (quiz.players.get(b)||0) - (quiz.players.get(a)||0))[0];
            const mvpBleu = [...quiz.teams.bleu].sort((a,b) => (quiz.players.get(b)||0) - (quiz.players.get(a)||0))[0];
            
            if (mvpRouge) res += `🌟 MVP ROUGE : @${mvpRouge.split('@')[0]} (${quiz.players.get(mvpRouge)} pts)\n`;
            if (mvpBleu) res += `🌟 MVP BLEU : @${mvpBleu.split('@')[0]} (${quiz.players.get(mvpBleu)} pts)\n\n`;
        }

        try {
            const comments = await generateEndComments(sorted.map(([jid, pts]) => ({ jid, score: pts })), quiz.language);
            if (comments) {
                sorted.forEach(([jid, pts]) => {
                    const comment = comments[jid] || comments[jid.split('@')[0]] || "";
                    res += `👤 @${jid.split('@')[0]} : ${pts} pts\n💬 ${comment}\n\n`;
                });
            } else {
                sorted.forEach(([jid, pts], i) => { res += `${i + 1}. @${jid.split('@')[0]} : ${pts} pts\n`; });
            }
        } catch (e) {
            sorted.forEach(([jid, pts], i) => { res += `${i + 1}. @${jid.split('@')[0]} : ${pts} pts\n`; });
        }
        
        await this.sendMessage(sock, from, res, sorted.map(s => s[0]));
        this.quizzes.delete(from);
    }
}

module.exports = QuizManager;
