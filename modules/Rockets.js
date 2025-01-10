const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
require('dotenv').config();

const ANNOUNCED_EVENTS_FILE = path.resolve(__dirname, '../config/announcedEvents.json');

// Função para carregar eventos anunciados
function loadAnnouncedEvents() {
    if (!fs.existsSync(ANNOUNCED_EVENTS_FILE)) {
        fs.writeFileSync(ANNOUNCED_EVENTS_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(ANNOUNCED_EVENTS_FILE);
    return JSON.parse(data);
}

// Função para salvar eventos anunciados
function saveAnnouncedEvents(events) {
    fs.writeFileSync(ANNOUNCED_EVENTS_FILE, JSON.stringify(events, null, 2));
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
        const channelId = process.env.CHANNEL_ROCKETS_ID;

        // Carregar eventos anunciados
        const announcedEvents = loadAnnouncedEvents();

        async function anunciarLançamentos() {
            try {
                const res = await calendar.events.list({
                    calendarId: calendarId,
                    timeMin: new Date().toISOString(),
                    maxResults: 10,
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                const eventos = res.data.items;
                if (eventos.length) {
                    const canal = client.channels.cache.get(channelId);
                    for (const evento of eventos) {
                        const eventId = evento.id;
                        const eventTime = evento.start.dateTime || evento.start.date;
                        const eventMoment = moment(eventTime).tz('America/Sao_Paulo');
                        const unixTimestamp = eventMoment.unix();
                        const nowMoment = moment().tz('America/Sao_Paulo');

                        // Formatar a mensagem com o timestamp do Discord
                        const discordTimestamp = nowMoment.isBefore(eventMoment) ? `<t:${unixTimestamp}:R>` : `<t:${unixTimestamp}:R> ✅`;
                        const mensagemTexto = `🚀 **${evento.summary}** está programado para ${discordTimestamp}.`;

                        // Verificar se o evento já foi anunciado
                        if (!announcedEvents[eventId]) {
                            // Enviar mensagem e guardar o ID da mensagem
                            const mensagem = await canal.send(mensagemTexto);
                            announcedEvents[eventId] = {
                                messageId: mensagem.id,
                                summary: evento.summary,
                                start: eventTime,
                                completed: nowMoment.isSameOrAfter(eventMoment)
                            };
                        } else {
                            // Verificar se houve alterações no evento
                            const storedEvent = announcedEvents[eventId];
                            let mensagemAtualizada = false;

                            if (storedEvent.summary !== evento.summary || storedEvent.start !== eventTime) {
                                const mensagem = await canal.messages.fetch(storedEvent.messageId);
                                if (mensagem) {
                                    mensagemTexto = `🚀 **${evento.summary}** está programado para ${discordTimestamp}.`;
                                    await mensagem.edit(mensagemTexto);
                                    // Atualizar informações no armazenamento
                                    announcedEvents[eventId] = {
                                        messageId: storedEvent.messageId,
                                        summary: evento.summary,
                                        start: eventTime,
                                        completed: storedEvent.completed
                                    };
                                    mensagemAtualizada = true;
                                }
                            }

                            // Verificar se o lançamento já ocorreu e ainda não foi marcado como concluído
                            if (!storedEvent.completed && nowMoment.isSameOrAfter(eventMoment)) {
                                const mensagem = await canal.messages.fetch(storedEvent.messageId);
                                if (mensagem) {
                                    const novaMensagem = `🚀 **${evento.summary}** foi lançado em <t:${unixTimestamp}:F> ✅.`;
                                    await mensagem.edit(novaMensagem);
                                    // Atualizar o status para concluído
                                    announcedEvents[eventId].completed = true;
                                    mensagemAtualizada = true;
                                }
                            }

                            if (mensagemAtualizada) {
                                saveAnnouncedEvents(announcedEvents);
                            }
                        }
                    }
                    // Salvar os eventos anunciados
                    saveAnnouncedEvents(announcedEvents);
                } else {
                    console.log('Nenhum lançamento encontrado.');
                }
            } catch (error) {
                console.error('Erro ao buscar eventos:', error);
            }
        }

        anunciarLançamentos();
        setInterval(anunciarLançamentos, 3600000); // Verifica a cada hora
    },
};