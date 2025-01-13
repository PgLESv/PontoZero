const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const ANNOUNCED_EVENTS_FILE = path.resolve(__dirname, '../config/announcedEvents.json');

function loadAnnouncedEvents() {
    if (!fs.existsSync(ANNOUNCED_EVENTS_FILE)) {
        fs.writeFileSync(ANNOUNCED_EVENTS_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(ANNOUNCED_EVENTS_FILE, 'utf-8');
    return JSON.parse(data);
}

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

        const announcedEvents = loadAnnouncedEvents();
        await anunciarLancamentos();

        // Função para verificar o status do lançamento
        async function verificarStatusLancamento(link) {
            try {
                console.log(`🔗 Acessando o link: ${link}`);
                const response = await axios.get(link);
                const html = response.data;
                console.log('📄 HTML da página obtido com sucesso.');

                const $ = cheerio.load(html); // Definindo `$` com Cheerio

                // Seleciona o span que contém o status
                const statusSpan = $('h6.rcorners.status span').first();
                const statusTexto = statusSpan.text().trim();
                console.log(`📈 Status encontrado: ${statusTexto}`);

                let motivo = null;

                if (statusTexto === 'Failure') {
                    // Seleciona o parágrafo que contém o motivo da falha
                    const motivoParagrafo = $('div.mdl-card__supporting-text p').first();
                    motivo = motivoParagrafo.text().trim();
                    console.log(`📝 Motivo da Falha: ${motivo}`);
                }        

                return { status: statusTexto, motivo };
            } catch (error) {
                console.error(`Erro ao verificar status do lançamento em ${link}:`, error);
                return { status: null, motivo: null };
            }
        }

        async function anunciarLancamentos() {
            try {
                const now = new Date();
                const twoMonthsLater = new Date();
                twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
        
                // Buscar eventos do Google Calendar
                const res = await calendar.events.list({
                    calendarId: calendarId,
                    timeMin: now.toISOString(),
                    timeMax: twoMonthsLater.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                });
        
                const eventos = res.data.items;
                console.log(`[Anunciar Lançamentos] Eventos encontrados: ${eventos.length}`);
        
                if (!eventos.length) {
                    console.log('Nenhum lançamento encontrado na Calendar.');
                }
        
                const canal = client.channels.cache.get(channelId);
                if (!canal) {
                    console.error(`[Anunciar Lançamentos] Canal com ID ${channelId} não encontrado.`);
                    return;
                }
        
                // Processar eventos da Calendar
                for (const evento of eventos) {
                    const eventId = evento.id;
                    const eventTime = evento.start.dateTime || evento.start.date;
                    const eventMoment = moment(eventTime).tz('America/Sao_Paulo');
                    const unixTimestamp = eventMoment.unix();
                    const nowMoment = moment().tz('America/Sao_Paulo');
        
                    // Extrair o link da descrição
                    const description = evento.description || '';
                    let linkMatch = description.match(/https?:\/\/\S+|www\.\S+|\S+\.\S+/);
                    let link = linkMatch ? linkMatch[0] : null;
        
                    // Adicionar 'https://' se o link não possui protocolo
                    if (link && !/^https?:\/\//i.test(link)) {
                        link = `https://${link}`;
                    }
        
                    // Formatar a mensagem com o timestamp do Discord
                    const discordTimestamp = nowMoment.isBefore(eventMoment)
                        ? `<t:${unixTimestamp}:R>`
                        : `<t:${unixTimestamp}:F> ✅`;
                    let mensagemTexto = `🚀 **${evento.summary}** está programado para ${discordTimestamp}.`;
        
                    // Adicionar o link se existir
                    if (link) {
                        mensagemTexto += ` - [Mais informações](${link})`;
                    }
        
                    console.log(`[Analisar Evento] ID: ${eventId}, Summary: ${evento.summary}, Início: ${eventMoment.format()}, Agora: ${nowMoment.format()}`);
                    console.log(`Descrição do evento (${eventId}):`, description);
                    console.log(`Link extraído:`, link);
        
                    // Verificar se o evento já foi anunciado
                    if (!announcedEvents[eventId]) {
                        // Enviar mensagem e guardar o ID da mensagem
                        const mensagem = await canal.send(mensagemTexto);
                        console.log(`[Enviar Mensagem] Evento ${eventId} anunciado com a mensagem ID ${mensagem.id}.`);
                        announcedEvents[eventId] = {
                            messageId: mensagem.id,
                            summary: evento.summary,
                            start: eventTime,
                            completed: nowMoment.isSameOrAfter(eventMoment),
                            link: link,
                            status: null,
                            motivo: null,
                        };
                    } else {
                        // Verificar se houve alterações no evento
                        const storedEvent = announcedEvents[eventId];
                        let mensagemAtualizada = false;
        
                        if (storedEvent.summary !== evento.summary || storedEvent.start !== eventTime) {
                            const mensagem = await canal.messages.fetch(storedEvent.messageId);
                            if (mensagem) {
                                let novaMensagem = `🚀 **${evento.summary}** está programado para <t:${unixTimestamp}:R>.`;
                                if (link) {
                                    novaMensagem += ` - [Mais informações](${link})`;
                                }
                                await mensagem.edit(novaMensagem);
                                console.log(`[Editar Mensagem] Evento ${eventId} atualizado com a nova mensagem.`);
                                // Atualizar informações no armazenamento incluindo o link
                                announcedEvents[eventId] = {
                                    messageId: storedEvent.messageId,
                                    summary: evento.summary,
                                    start: eventTime,
                                    completed: storedEvent.completed,
                                    link: link,
                                    status: storedEvent.status,
                                    motivo: storedEvent.motivo,
                                };
                                mensagemAtualizada = true;
                            } else {
                                console.warn(`[Editar Mensagem] Mensagem com ID ${storedEvent.messageId} não encontrada.`);
                            }
                        }
        
                        // Verificar se o lançamento já ocorreu e ainda não foi marcado como concluído
                        if (!storedEvent.completed && nowMoment.isSameOrAfter(eventMoment)) {
                            // Verificar o status do lançamento acessando o link
                            let statusInfo = { status: null, motivo: null };
                            if (link) {
                                statusInfo = await verificarStatusLancamento(link);
                            }
        
                            const mensagem = await canal.messages.fetch(storedEvent.messageId);
                            if (mensagem) {
                                let novaMensagem = `🚀 **${evento.summary}** foi lançado em <t:${unixTimestamp}:F> ✅.`;
                                if (statusInfo.status === 'Failure' && statusInfo.motivo) {
                                    novaMensagem += `\n**Motivo do Failure:** ${statusInfo.motivo}`;
                                }
                                await mensagem.edit(novaMensagem);
                                console.log(`[Atualizar Conclusão] Evento ${eventId} marcado como concluído.`);
                                // Atualizar o status para concluído e salvar a informação do status
                                announcedEvents[eventId] = {
                                    ...storedEvent,
                                    completed: true,
                                    status: statusInfo.status,
                                    motivo: statusInfo.motivo,
                                };
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
        
                // **Processar eventos que já foram anunciados mas não estão mais na Calendar**
                console.log(`[Anunciar Lançamentos] Processando eventos anunciados previamente...`);
                for (const eventId in announcedEvents) {
                    if (!eventos.find(evento => evento.id === eventId)) {
                        console.log(`[Processar Externo] Evento ${eventId} não está na Calendar. Iniciando verificação...`);
                        const evento = announcedEvents[eventId];
                        const eventTime = evento.start;
                        const eventMoment = moment(eventTime).tz('America/Sao_Paulo');
                        const nowMoment = moment().tz('America/Sao_Paulo');
        
                        // Remover a condição de tempo para permitir verificação independente
                        if (!evento.completed) {
                            let statusInfo = { status: null, motivo: null };
                            if (evento.link) {
                                statusInfo = await verificarStatusLancamento(evento.link);
                            }
        
                            const mensagem = await canal.messages.fetch(evento.messageId);
                            if (mensagem) {
                                let novaMensagem = `🚀 **${evento.summary}** foi lançado em <t:${eventMoment.unix()}:F> ✅.`;
                                if (statusInfo.status === 'Failure' && statusInfo.motivo) {
                                    novaMensagem += `\n**❌ Motivo do Failure:** ${statusInfo.motivo}`;
                                }
                                try {
                                    await mensagem.edit(novaMensagem);
                                    console.log(`[Atualizar Conclusão Externa] Evento ${eventId} marcado como concluído.`);
                                    // Atualizar o status para concluído e salvar a informação do status
                                    announcedEvents[eventId] = {
                                        ...evento,
                                        completed: true,
                                        status: statusInfo.status,
                                        motivo: statusInfo.motivo,
                                    };
                                    saveAnnouncedEvents(announcedEvents);
                                } catch (error) {
                                    console.error(`[Atualizar Conclusão Externa] Erro ao atualizar a mensagem do evento ${eventId}:`, error);
                                }
                            } else {
                                console.warn(`[Atualizar Conclusão Externa] Mensagem com ID ${evento.messageId} não encontrada.`);
                            }
                        } else {
                            console.log(`[Processar Externo] Evento ${eventId} já está concluído.`);
                        }
                    }
                }
        
                // Salvar os eventos anunciados após o processamento
                saveAnnouncedEvents(announcedEvents);
                console.log(`[Salvar Eventos] Eventos anunciados atualizados.`);
            } catch (error) {
                console.error('Erro ao buscar eventos:', error);
            }
        }

        // Listener para comandos de chat (ex: !testestatus <eventId>)
        client.on('messageCreate', async (message) => {
        });

        setInterval(anunciarLancamentos, 1800000); // Verificar a cada 30 minutos
    },
};