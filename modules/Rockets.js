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


                    // Verificar se já existe um registro com o mesmo link
                    db.get("SELECT * FROM launches WHERE link = ?", [link], async (err, row) => {
                        if (err) {
                            console.error(`Erro ao verificar evento existente para o link ${link}:`, err);
                            return callback();
                        }
                        if (row) {
                            // Atualizar o registro existente com os novos dados
                            console.log(`Evento com link ${link} já existe, atualizando o registro...`);
                            db.run(
                                "UPDATE launches SET id = ?, name = ?, date = ?, time = ? WHERE link = ?",
                                [eventId, eventName, dateObj.toISOString(), dateObj.toISOString(), link],
                                (updateErr) => {
                                    if (updateErr) {
                                        console.error(`Erro ao atualizar evento com link ${link}:`, updateErr);
                                    }
                                    // Não enviar nova mensagem, pois o anúncio já foi realizado.
                                    return callback();
                                }
                            );
                        } else {
                            // Inserir o novo evento e enviar a mensagem do Discord
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
                        }
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

                    // Tentar extrair o status com o seletor padrão
                    let statusText = $('h6.rcorners.status span').text().trim().toLowerCase();
                    // Se não encontrar, utilizar seletor alternativo
                    if (!statusText) {
                        statusText = $('h6.rcorners.suborbital span').text().trim().toLowerCase();
                    }
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

                    if (!realLaunchTimeText) {
                        realLaunchTimeText = $('strong:contains("Launch Time")').parent().text().replace('Launch Time', '').trim();
                        console.log(`Horário real extraído do texto após "Launch Time": "${realLaunchTimeText}"`);
                    }

                    let realLaunchDate = null;
                    let realLaunchTime = null;
                    let unixTimestamp = null;

                    if (realLaunchTimeText.toUpperCase().startsWith('NET')) {
                        console.log(`Lançamento ${launch.name} ainda está previsto para ${realLaunchTimeText}.`);
                    } else {
                        let parsedDate = new Date(realLaunchTimeText);
                        console.log(`Data parseada inicialmente: ${parsedDate}`);

                        if (isNaN(parsedDate)) {
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

                    // Se o status não está mais 'pending', considerar que o lançamento ocorreu e atualizar
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
                                    try {
                                        const message = await channel.messages.fetch(launch.message_id);
                                        await message.edit(`🚀 **${launch.name}** foi lançado em <t:${unixTimestamp}:R>. Status: ${status === 'success' ? '✅ Sucesso' : '❌ Falha'} - [Mais informações](${launch.link})`);
                                    } catch (error) {
                                        console.error(`Erro ao editar mensagem para lançamento ${launch.id}:`, error);
                                    }
                                }
                            }
                        );
                        console.log(`Lançamento ${launch.name} concluído com status: ${status}.`);
                    }
                    // Caso o status permaneça 'pending', mas o site forneça nova data/hora, atualizar a mensagem como reagendamento
                    else if (realLaunchDate && realLaunchTime && unixTimestamp) {
                        db.run(
                            `UPDATE launches SET real_date = ?, real_time = ? WHERE id = ?`,
                            [realLaunchDate, realLaunchTime, launch.id],
                            async function(err) {
                                if (err) {
                                    console.error(`Erro ao atualizar dados para o lançamento ${launch.id}:`, err);
                                } else {
                                    console.log(`Evento ${launch.name} reagendado para: ${realLaunchDate} ${realLaunchTime}.`);
                                    const channel = await client.channels.fetch(process.env.CHANNEL_ROCKETS_ID);
                                    try {
                                        const message = await channel.messages.fetch(launch.message_id);
                                        await message.edit(`🚀 **${launch.name}** foi reagendado para <t:${unixTimestamp}:R>. - [Mais informações](${launch.link})`);
                                    } catch (error) {
                                        console.error(`Erro ao editar mensagem para lançamento ${launch.id}:`, error);
                                    }
                                }
                            }
                        );
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
        setInterval(async () => {
            try {
                await fetchAndStoreEvents(calendar, calendarId, client)
                await verificarStatusLançamento(client);
                console.log('Verificação de eventos e status concluída.');
            } catch (error) {
                console.error('Erro na verificação periódica:', error);
            }
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
