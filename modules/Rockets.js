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
                // Buscar novos eventos até 1 dia atrás
                const res = await calendar.events.list({
                    calendarId: calendarId,
                    timeMin: moment().subtract(1, 'day').toISOString(), // Inclui eventos até 1 dia atrás
                    maxResults: 20, // Ajuste conforme necessário
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                const eventos = res.data.items;
                console.log(`[Anunciar Lançamentos] Eventos encontrados: ${eventos.length}`);

                if (eventos.length) {
                    const canal = client.channels.cache.get(channelId);
                    if (!canal) {
                        console.error(`[Anunciar Lançamentos] Canal com ID ${channelId} não encontrado.`);
                        return;
                    }

                    for (const evento of eventos) {
                        const eventId = evento.id;
                        const eventTime = evento.start.dateTime || evento.start.date;
                        const eventMoment = moment(eventTime).tz('America/Sao_Paulo');
                        const unixTimestamp = eventMoment.unix();
                        const nowMoment = moment().tz('America/Sao_Paulo');

                        // Formatar a mensagem com o timestamp do Discord
                        const discordTimestamp = nowMoment.isBefore(eventMoment) ? `<t:${unixTimestamp}:R>` : `<t:${unixTimestamp}:F> ✅`;
                        let mensagemTexto = `🚀 **${evento.summary}** está programado para ${discordTimestamp}.`;

                        console.log(`[Analisar Evento] ID: ${eventId}, Summary: ${evento.summary}, Início: ${eventMoment.format()}, Agora: ${nowMoment.format()}`);

                        // Verificar se o evento já foi anunciado
                        if (!announcedEvents[eventId]) {
                            // Enviar mensagem e guardar o ID da mensagem
                            const mensagem = await canal.send(mensagemTexto);
                            console.log(`[Enviar Mensagem] Evento ${eventId} anunciado com a mensagem ID ${mensagem.id}.`);
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
                                    mensagemTexto = `🚀 **${evento.summary}** está programado para <t:${unixTimestamp}:R>.`;
                                    await mensagem.edit(mensagemTexto);
                                    console.log(`[Editar Mensagem] Evento ${eventId} atualizado com a nova mensagem.`);
                                    // Atualizar informações no armazenamento
                                    announcedEvents[eventId] = {
                                        messageId: storedEvent.messageId,
                                        summary: evento.summary,
                                        start: eventTime,
                                        completed: storedEvent.completed
                                    };
                                    mensagemAtualizada = true;
                                } else {
                                    console.warn(`[Editar Mensagem] Mensagem com ID ${storedEvent.messageId} não encontrada.`);
                                }
                            }

                            // Verificar se o lançamento já ocorreu e ainda não foi marcado como concluído
                            if (!storedEvent.completed && nowMoment.isSameOrAfter(eventMoment)) {
                                const mensagem = await canal.messages.fetch(storedEvent.messageId);
                                if (mensagem) {
                                    const novaMensagem = `🚀 **${evento.summary}** foi lançado em <t:${unixTimestamp}:F> ✅.`;
                                    await mensagem.edit(novaMensagem);
                                    console.log(`[Atualizar Conclusão] Evento ${eventId} marcado como concluído.`);
                                    // Atualizar o status para concluído
                                    announcedEvents[eventId].completed = true;
                                    mensagemAtualizada = true;
                                } else {
                                    console.warn(`[Atualizar Conclusão] Mensagem com ID ${storedEvent.messageId} não encontrada.`);
                                }
                            }

                            if (mensagemAtualizada) {
                                saveAnnouncedEvents(announcedEvents);
                                console.log(`[Salvar Eventos] Eventos anunciados atualizados.`);
                            }
                        }
                    }
                    // Salvar os eventos anunciados
                    saveAnnouncedEvents(announcedEvents);
                } else {
                    console.log('Nenhum lançamento encontrado.');
                }

                // Iterar sobre todos os eventos armazenados para verificar se foram concluídos
                for (const [eventId, storedEvent] of Object.entries(announcedEvents)) {
                    if (!storedEvent.completed) {
                        const eventMoment = moment(storedEvent.start).tz('America/Sao_Paulo');
                        const nowMoment = moment().tz('America/Sao_Paulo');

                        if (nowMoment.isSameOrAfter(eventMoment)) {
                            try {
                                const canal = client.channels.cache.get(channelId);
                                if (!canal) {
                                    console.error(`[Verificação Conclusão] Canal com ID ${channelId} não encontrado.`);
                                    continue;
                                }

                                const mensagem = await canal.messages.fetch(storedEvent.messageId);
                                if (mensagem) {
                                    const unixTimestamp = eventMoment.unix();
                                    const novaMensagem = `🚀 **${storedEvent.summary}** foi lançado em <t:${unixTimestamp}:F> ✅.`;
                                    await mensagem.edit(novaMensagem);
                                    console.log(`[Verificação Conclusão] Evento ${eventId} marcado como concluído.`);
                                    // Atualizar o status para concluído
                                    announcedEvents[eventId].completed = true;
                                    saveAnnouncedEvents(announcedEvents);
                                } else {
                                    console.warn(`[Verificação Conclusão] Mensagem com ID ${storedEvent.messageId} não encontrada.`);
                                }
                            } catch (error) {
                                console.error(`[Verificação Conclusão] Erro ao marcar evento ${eventId} como concluído:`, error);
                            }
                        }
                    }
                }

            } catch (error) {
                console.error('Erro ao buscar eventos:', error);
            }
        }

        anunciarLançamentos();
        setInterval(anunciarLançamentos, 1800000); // Verifica a cada 30 minutos para teste
    },
};