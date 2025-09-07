const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_REDDIT_ID;
const SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'funny';

let dailyPosts = [];
let lastFetchedDate = '';
let postedIds = new Set(); // Armazena os IDs dos posts já enviados

async function fetchTopPosts() {
    try {
        // Busca os top posts do "ontem" (últimas 24 horas referentes ao dia anterior)
        const response = await axios.get(`https://www.reddit.com/r/${SUBREDDIT}/top.json`, {
            params: {
                t: 'day',
                limit: 3
            }
        });
        if (response.data && response.data.data && response.data.data.children) {
            dailyPosts = response.data.data.children.map(child => child.data);
            console.log(`Posts capturados de r/${SUBREDDIT}: ${dailyPosts.length}`);
        } else {
            console.error('Estrutura de resposta inesperada da API do Reddit.');
        }
    } catch (error) {
        console.error('Erro ao buscar posts no Reddit:', error);
    }
}

async function postRedditPost(index, client) {
    // Calcula a data de "ontem"
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    // Se a data dos posts armazenados não for a de ontem, atualiza os posts
    if (lastFetchedDate !== yesterday) {
        await fetchTopPosts();
        lastFetchedDate = yesterday;
    }

    if (!dailyPosts || dailyPosts.length < 2) {
        console.error('Número insuficiente de posts para postar.');
        return;
    }

    let currentIndex = index;
    let post;

    // Tenta encontrar um post não postado
    while (currentIndex < dailyPosts.length) {
        post = dailyPosts[currentIndex];
        if (!post) {
            console.error(`Post de índice ${currentIndex} não encontrado.`);
            currentIndex++;
            continue;
        }

        if (!postedIds.has(post.id)) {
            break; // Encontrou um post não postado
        } else {
            console.log(`Post com ID ${post.id} já foi postado. Tentando o próximo.`);
            currentIndex++;
        }
    }

    // Se todos os posts já foram postados
    if (currentIndex >= dailyPosts.length) {
        console.log('Todos os posts já foram postados.');
        return;
    }

    const title = post.title;
    const url = `https://reddit.com${post.permalink}`;
    const selftext = post.selftext ? post.selftext.trim() : '';
    const content = `**${title}**\n${selftext}\n<${url}>`;

    const image = post.url_overridden_by_dest &&
        (post.post_hint === 'image' ||
            post.url_overridden_by_dest.endsWith('.jpg') ||
            post.url_overridden_by_dest.endsWith('.png'))
        ? post.url_overridden_by_dest
        : null;

    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        const sentMessage = await channel.send({
            content,
            ...(image ? { files: [image] } : {})
        });
        await sentMessage.react('✅');
        await sentMessage.react('❌');
        console.log(`Postado no canal ${CHANNEL_ID}: ${title}`);

        // Adiciona o ID do post ao conjunto de posts enviados
        postedIds.add(post.id);
    } catch (error) {
        console.error('Erro ao postar mensagem no Discord:', error);
    }
}

function scheduleRedditPosts(client) {
    // Agenda a busca diária para pegar os posts do dia anterior (executa às 00:05)
    cron.schedule('5 0 * * *', async () => {
        await fetchTopPosts();
        // Define lastFetchedDate como o dia de ontem
        lastFetchedDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        console.log('Posts do dia anterior atualizados.');
    });
    
    // Caso o bot inicie e ainda não tenha os posts, faz a busca inicial
    if (!lastFetchedDate) {
        fetchTopPosts();
        lastFetchedDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    }

    // Agenda as postagens (exemplo: 12:30, 17:00 e 21:00)
    cron.schedule('30 12 * * *', () => {
        console.log('Agendado post do Reddit às 12:30.');
        postRedditPost(0, client);
    });
    cron.schedule('0 21 * * *', () => {
        console.log('Agendado post do Reddit às 21:00.');
        postRedditPost(1, client);
    });
    console.log('Tarefas de agendamento dos posts do Reddit configuradas.');
}

module.exports = {
    name: 'RedditSuperPower',
    execute: scheduleRedditPosts,
};