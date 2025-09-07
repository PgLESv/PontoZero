require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`Evento carregado: ${event.name}`);
    } catch (err) {
        console.error(`Erro ao carregar evento ${file}:`, err);
    }
}

// Importar e executar módulos adicionais após o evento 'ready'
client.once('ready', () => {
    const modulesPath = path.join(__dirname, 'modules');
    const moduleFiles = fs.readdirSync(modulesPath).filter(file => file.endsWith('.js'));

    for (const file of moduleFiles) {
        const filePath = path.join(modulesPath, file);
        try {
            const module = require(filePath);
            if (typeof module.execute === 'function') {
                module.execute(client);
                console.log(`Módulo executado: ${file}`);
            }
        } catch (err) {
            console.error(`Erro ao executar módulo ${file}:`, err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);