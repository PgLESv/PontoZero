const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_REDDIT_ID;
const SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'funny';

let dailyPosts = [];
let lastFetchedDate = '';

async function fetchTopPosts() {
    try {
        // Busca os top posts do último dia (últimas 24 horas)
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
    // Define "ontem" para garantir que são os posts qualificados do dia anterior.
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (lastFetchedDate !== yesterday) {
        await fetchTopPosts();
        lastFetchedDate = yesterday;
    }
    if (!dailyPosts || dailyPosts.length < 3) {
        console.error('Número insuficiente de posts para postar.');
        return;
    }
    const post = dailyPosts[index];
    if (!post) {
        console.error(`Post de índice ${index} não encontrado.`);
        return;
    }
    const title = post.title;
    const url = `https://reddit.com${post.permalink}`;
    const selftext = post.selftext ? post.selftext.trim() : '';
    // Encapsula o link com <> para evitar embed no Discord
    const content = `**${title}**\n${selftext}\n<${url}>`;
    
    // Verifica se há imagem
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
    } catch (error) {
        console.error('Erro ao postar mensagem no Discord:', error);
    }
}

function scheduleRedditPosts(client) {
    cron.schedule('0 12 * * *', () => {
        console.log('Agendado post do Reddit às 12:00.');
        postRedditPost(0, client);
    });
    cron.schedule('0 17 * * *', () => {
        console.log('Agendado post do Reddit às 17:00.');
        postRedditPost(1, client);
    });
    cron.schedule('0 21 * * *', () => {
        console.log('Agendado post do Reddit às 21:00.');
        postRedditPost(2, client);
    });
    console.log('Tarefas de agendamento dos posts do Reddit configuradas.');
}

module.exports = {
    name: 'RedditSuperPower',
    execute: scheduleRedditPosts,
};