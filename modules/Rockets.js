const { google } = require('googleapis');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('discord.js');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../config/rockets.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
    }
});

// Definir o busyTimeout para 5 segundos
db.configure("busyTimeout", 5000);

// Inicializar banco de dados com as colunas 'status', 'real_date' e 'real_time'
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS launches (
        id TEXT PRIMARY KEY,
        name TEXT,
        date TEXT,
        time TEXT,
        link TEXT,
        status TEXT DEFAULT 'pending',
        real_date TEXT,
        real_time TEXT,
        message_id TEXT
    )`, (err) => {
        if (err) {
            console.error('Erro ao criar tabela launches:', err);
        }
    });
});

async function fetchAndStoreEvents(calendar, calendarId, client) {
    const now = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    try {
        const res = await calendar.events.list({
            calendarId: calendarId,
            timeMin: now.toISOString(),
            timeMax: oneMonthLater.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = res.data.items;
        console.log(`Eventos encontrados: ${eventos.length}`);

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION;");

                const stmt = db.prepare(`INSERT OR IGNORE INTO launches (id, name, date, time, link) VALUES (?, ?, ?, ?, ?)`);
                const inserirEvento = async (evento, callback) => {
                    const eventId = evento.id;
                    const eventName = evento.summary;
                    const eventDate = evento.start.dateTime || evento.start.date;

                    const descricao = evento.description || '';
                    console.log(`\nDescrição do Evento (${eventName}):\n${descricao}\n`);

                    // Extração do link
                    let linkMatch = descricao.match(/more info:\s*([^\s]+)/i);
                    let link = '';

                    if (linkMatch && linkMatch[1]) {
                        link = linkMatch[1];
                        console.log(`Link capturado após "more info:": ${link}`);
                    } else {
                        linkMatch = descricao.match(/(?:https?:\/\/)?(?:www\.)?[^\s]+\.[^\s]+/i);
                        link = linkMatch ? linkMatch[0] : '';
                        if (link) {
                            console.log(`Link capturado com regex fallback: ${link}`);
                        } else {
                            console.log('Nenhum link encontrado na descrição.');
                        }
                    }

                    // Adicionar 'https://' se o link não possui protocolo
                    if (link && !/^https?:\/\//i.test(link)) {
                        link = `https://${link}`;
                        console.log(`Link ajustado com protocolo: ${link}`);
                    }

                    const dateObj = new Date(eventDate);
                    const unixTimestamp = Math.floor(dateObj.getTime() / 1000);

                    stmt.run(eventId, eventName, dateObj.toISOString(), dateObj.toISOString(), link, async function(err) {
                        if (err) {
                            console.error(`Erro ao inserir evento ${eventId}:`, err);
                        } else {
                            // Verifica se a linha foi realmente inserida
                            if (this.changes > 0) {
                                const channel = await client.channels.fetch(process.env.CHANNEL_ROCKETS_ID);
                                const message = await channel.send(`🚀 **${eventName}** está programado para <t:${unixTimestamp}:R>. - [Mais informações](${link})`);
                                db.run(`UPDATE launches SET message_id = ? WHERE id = ?`, [message.id, eventId]);
                            } else {
                                console.log(`Evento ${eventName} já existe no banco de dados. Nenhuma mensagem enviada.`);
                            }
                        }
                        callback();
                    });
                };

                const inserirSequencialmente = (eventos, index = 0) => {
                    if (index >= eventos.length) {
                        stmt.finalize((err) => {
                            if (err) {
                                db.run("ROLLBACK;");
                                reject(err);
                            } else {
                                db.run("COMMIT;", (commitErr) => {
                                    if (commitErr) {
                                        console.error('Erro ao commitar transação:', commitErr);
                                        reject(commitErr);
                                    } else {
                                        console.log('Transação de inserção concluída com sucesso.');
                                        resolve();
                                    }
                                });
                            }
                        });
                        return;
                    }

                    inserirEvento(eventos[index], () => {
                        inserirSequencialmente(eventos, index + 1);
                    });
                };

                inserirSequencialmente(eventos);
            });
        });
    } catch (error) {
        console.error('Erro ao buscar eventos:', error);
    }
}

// Função para verificar o status do lançamento
async function verificarStatusLançamento(client) {
    return new Promise((resolve, reject) => {
        // Selecionar lançamentos com status 'pending'
        db.all(`SELECT * FROM launches WHERE status = 'pending'`, async (err, rows) => {
            if (err) {
                console.error('Erro ao buscar lançamentos pendentes:', err);
                return reject(err);
            }

            for (const launch of rows) {
                try {
                    const response = await axios.get(launch.link);
                    const html = response.data;
                    const $ = cheerio.load(html);

                    // Extrair o status
                    const statusText = $('h6.rcorners.status span').text().trim().toLowerCase();
                    console.log(`\nVerificando lançamento: ${launch.name}`);
                    console.log(`Status extraído: ${statusText}`);

                    let status = 'pending';
                    if (statusText === 'success') {
                        status = 'success';
                    } else if (statusText === 'failure') {
                        status = 'failure';
                    }

                    // Extrair o horário real de lançamento
                    let realLaunchTimeText = $('span#localized').text().trim();
                    console.log(`Horário real extraído do span#localized: "${realLaunchTimeText}"`);

                    // Verificar se o span existe e contém um horário válido
                    if (!realLaunchTimeText) {
                        // Extrair o texto após "Launch Time" se o span não existir
                        realLaunchTimeText = $('strong:contains("Launch Time")').parent().text().replace('Launch Time', '').trim();
                        console.log(`Horário real extraído do texto após "Launch Time": "${realLaunchTimeText}"`);
                    }

                    let realLaunchDate = null;
                    let realLaunchTime = null;
                    let unixTimestamp = null;

                    // Verificar se o texto contém uma data válida ou "NET"
                    if (realLaunchTimeText.toUpperCase().startsWith('NET')) {
                        console.log(`Lançamento ${launch.name} ainda está previsto para ${realLaunchTimeText}.`);
                        // Manter status como 'pending' e não atualizar data/hora real
                    } else {
                        // Tentar parsear a data
                        let parsedDate = new Date(realLaunchTimeText);
                        console.log(`Data parseada inicialmente: ${parsedDate}`);

                        // Se a data não for válida, tentar ajustar o formato
                        if (isNaN(parsedDate)) {
                            // Remover possíveis caracteres indesejados
                            const cleanedText = realLaunchTimeText.replace(/BRT|BST|UTC|GMT|\+[\d]{4}/g, '').trim();
                            console.log(`Tentando parsear a data limpa: "${cleanedText}"`);
                            parsedDate = new Date(cleanedText);
                            console.log(`Data parseada após limpeza: ${parsedDate}`);
                        }

                        if (!isNaN(parsedDate)) {
                            realLaunchDate = parsedDate.toLocaleDateString('pt-BR');
                            realLaunchTime = parsedDate.toLocaleTimeString('pt-BR');
                            unixTimestamp = Math.floor(parsedDate.getTime() / 1000);
                            console.log(`Data real parseada: ${realLaunchDate}`);
                            console.log(`Hora real parseada: ${realLaunchTime}`);
                        } else {
                            console.log(`Formato de data inválido para o lançamento ${launch.name}: "${realLaunchTimeText}".`);
                        }
                    }

                    // Atualizar o status e, se disponível, o horário real no banco de dados
                    if (status !== 'pending') {
                        db.run(
                            `UPDATE launches SET status = ?, real_date = ?, real_time = ? WHERE id = ?`,
                            [status, realLaunchDate, realLaunchTime, launch.id],
                            async function(err) {
                                if (err) {
                                    console.error(`Erro ao atualizar dados para o lançamento ${launch.id}:`, err);
                                } else {
                                    console.log(
                                        `Dados atualizados para o lançamento ${launch.name}: Status=${status}, Real Date=${realLaunchDate || 'NULL'}, Real Time=${realLaunchTime || 'NULL'}`
                                    );
                                    const channel = await client.channels.fetch(process.env.CHANNEL_ROCKETS_ID);
                                    const message = await channel.messages.fetch(launch.message_id);
                                    await message.edit(`🚀 **${launch.name}** foi lançado em <t:${unixTimestamp}:R>. Status: ${status === 'success' ? '✅ Sucesso' : '❌ Falha'} - [Mais informações](${launch.link})`);
                                }
                            }
                        );

                        // Logar o status atualizado
                        console.log(`Lançamento ${launch.name} concluído com status: ${status}.`);
                    }

                } catch (error) {
                    console.error(`Erro ao verificar status do lançamento ${launch.id}:`, error);
                }
            }

            resolve();
        });
    });
}

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.resolve(__dirname, '../config/credentials.json'),
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });

        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = process.env.CALENDAR_ID;

        try {
            await fetchAndStoreEvents(calendar, calendarId, client);
            await verificarStatusLançamento(client); // Executa a verificação após armazenar eventos
        } catch (error) {
            console.error('Erro ao executar fetchAndStoreEvents:', error);
        }

        // Agendar verificações periódicas
        setInterval(() => {
            verificarStatusLançamento(client)
                .then(() => console.log('Verificação de status concluída.'))
                .catch(err => console.error('Erro na verificação de status:', err));
        }, 60 * 60 * 1000); // 60 minutos
    },
};

// Para testar o arquivo isoladamente
if (require.main === module) {
    const client = {
        channels: {
            cache: new Map(),
        },
    };
    module.exports.execute(client).then(() => {
        console.log('Teste concluído.');
        db.close();
    }).catch(err => {
        console.error('Erro no teste:', err);
        db.close();
    });
}