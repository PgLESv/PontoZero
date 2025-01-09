const CHANNEL_ID = '1301603798577582091';

module.exports = {
    name: 'messageCreate',
    execute(message, client) {
        if (message.author.bot) return;

        if (message.channel.id === CHANNEL_ID) {
            console.log(`Mensagem recebida no canal correto: ${message.channel.id}`);
            console.log(`Número de anexos: ${message.attachments.size}`);
            if (message.attachments.size > 0) {
                console.log('Mensagem contém anexos');
                for (const attachment of message.attachments.values()) {
                    console.log(`URL do anexo: ${attachment.url}`);
                    console.log(`Tipo de conteúdo: ${attachment.contentType}`);

                    if (attachment.contentType && attachment.contentType.startsWith('image')) {
                        console.log('Anexo é uma imagem ou GIF');
                        message.react('✅')
                            .then(() => console.log('Reação ✅ adicionada com sucesso'))
                            .catch(error => {
                                if (error.code === 50013) { // Discord.FORBIDDEN
                                    console.log('Permissão negada para adicionar reações');
                                } else {
                                    console.log(`Erro ao adicionar reações: ${error}`);
                                }
                            });
                        message.react('❌')
                            .then(() => console.log('Reação ❌ adicionada com sucesso'))
                            .catch(error => {
                                if (error.code === 50013) {
                                    console.log('Permissão negada para adicionar reações');
                                } else {
                                    console.log(`Erro ao adicionar reações: ${error}`);
                                }
                            });
                        break;
                    } else {
                        console.log('Anexo não é uma imagem ou GIF');
                    }
                }
            } else {
                console.log('Mensagem não contém anexos');
            }
        }
    },
};