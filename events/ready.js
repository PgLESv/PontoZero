module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Bot conectado como ${client.user.tag}`);
        // Sincroniza comandos de barra aqui, se necessário
    },
};