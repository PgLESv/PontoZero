const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_EPIC_ID;
const LAST_FREE_GAMES_FILE = path.join(__dirname, '..', 'lastFreeGames.json');

function loadLastFreeGames() {
    if (fs.existsSync(LAST_FREE_GAMES_FILE)) {
        const data = fs.readFileSync(LAST_FREE_GAMES_FILE, 'utf-8');
        try {
            const parsedData = JSON.parse(data);
            console.log('lastFreeGames carregado com sucesso:', parsedData);
            return parsedData;
        } catch (error) {
            console.error('Erro ao parsear lastFreeGames.json:', error);
            return [];
        }
    }
    console.log('lastFreeGames.json não encontrado. Inicializando como array vazio.');
    return [];
}

function saveLastFreeGames(ids) {
    fs.writeFileSync(LAST_FREE_GAMES_FILE, JSON.stringify(ids, null, 2), 'utf-8');
    console.log('lastFreeGames salvo com sucesso:', ids);
}

let lastFreeGames = loadLastFreeGames();

async function fetchFreeGames() {
    try {
        console.log('Iniciando busca de jogos gratuitos...');
        const response = await fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (!data || !data.data || !data.data.Catalog || !data.data.Catalog.searchStore || !data.data.Catalog.searchStore.elements) {
            console.error('Estrutura de dados inesperada na resposta da API.');
            return;
        }

        const elements = data.data.Catalog.searchStore.elements;

        console.log('Jogos recebidos da API:');
        elements.forEach(game => {
            console.log(`- ${game.title}`);
        });

        const turmoil = elements.find(game => game.title.toLowerCase() === 'turmoil');
        if (turmoil) {
            console.log('Jogo "Turmoil" encontrado:', turmoil);
            console.log('Detalhes das promoções do Turmoil:', JSON.stringify(turmoil.promotions, null, 2));
        } else {
            console.log('Jogo "Turmoil" não foi encontrado nos elementos.');
        }

        const freeGames = elements.filter(game => {
            if (!game.promotions || !game.promotions.promotionalOffers) return false;
            return game.promotions.promotionalOffers.some(offerPeriod => {
                if (!offerPeriod.promotionalOffers) return false;
                return offerPeriod.promotionalOffers.some(promo => {
                    const discount = promo.discountSetting && promo.discountSetting.discountPercentage;
                    const startDate = promo.startDate ? new Date(promo.startDate) : null;
                    const endDate = promo.endDate ? new Date(promo.endDate) : null;
                    const now = new Date();

                    console.log(`Detalhes da promoção para "${game.title}":`, JSON.stringify(promo, null, 2));

                    const discountNumber = Number(discount);

                    const discountPrice = game.price && game.price.totalPrice && game.price.totalPrice.discountPrice;

                    return (discountNumber === 100 || discountPrice === 0) && startDate && endDate && now >= startDate && now <= endDate;
                });
            });
        });

        console.log(`Total de jogos gratuitos encontrados: ${freeGames.length}`);

        freeGames.forEach(game => {
            console.log(`Jogo gratuito detectado: ${game.title}`);
        });

        const newFreeGames = freeGames.filter(game => !lastFreeGames.includes(game.id));

        console.log(`Novos jogos gratuitos a serem anunciados: ${newFreeGames.length}`);

        if (newFreeGames.length > 0) {
            console.log(`Encontrados ${newFreeGames.length} novos jogos gratuitos.`);
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel) {
                console.error('Canal não encontrado');
                return;
            }

            newFreeGames.forEach(game => {
                const gameTitle = game.title;
                const pageSlug = (game.offerMappings && game.offerMappings[0].pageSlug) || game.productSlug || game.urlSlug;
                if (!pageSlug) {
                    console.log(`Jogo "${gameTitle}" não possui slug válido. Ignorando.`);
                    return;
                }
                const gameUrl = `https://store.epicgames.com/pt-BR/p/${pageSlug}`;

                let thumbnailUrl = null;
                const thumbnailTypes = ['DieselStoreFrontWide', 'OfferImageWide', 'VaultClosed'];

                for (const type of thumbnailTypes) {
                    const image = game.keyImages.find(img => img.type === type);
                    if (image) {
                        thumbnailUrl = image.url;
                        break;
                    }
                }
                thumbnailUrl = thumbnailUrl || 'https://via.placeholder.com/150';

                const embed = new EmbedBuilder()
                    .setTitle(gameTitle)
                    .setURL(gameUrl)
                    .setImage(thumbnailUrl)
                    .setDescription(`\`🔥\` **Novo jogo gratuito disponível:** [${gameTitle}](${gameUrl})`);

                channel.send({ embeds: [embed] })
                    .then(() => console.log(`Anúncio enviado para o jogo: ${gameTitle}`))
                    .catch(error => console.error(`Erro ao enviar anúncio para ${gameTitle}:`, error));
            });

            lastFreeGames = freeGames.map(game => game.id);
            saveLastFreeGames(lastFreeGames);
        } else {
            console.log('Nenhum novo jogo gratuito encontrado.');
        }
    } catch (error) {
        console.error('Erro ao buscar jogos gratuitos:', error);
    }
}

function scheduleEpicFreeBot(clientInstance) {
    global.client = clientInstance;
    cron.schedule('00 12 * * *', () => {
        console.log('Verificando jogos gratuitos no Epic Games...');
        fetchFreeGames();
    });

    fetchFreeGames();
}

module.exports = {
    name: 'EpicFree',
    execute: scheduleEpicFreeBot,
};