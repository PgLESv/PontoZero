# NewPontoZeroBot

Bot multiproposito para Discord com persistencia local em SQLite (.db).

## Funcionalidade inicial

- Configura canais monitorados via comando de admin.
- Em canais monitorados, quando uma mensagem tiver apenas 1 anexo de imagem, gif ou video (sem texto), o bot reage com:
  - ✅
  - ❌
- Comando `!trabalho` com padrao dia sim/dia nao, contagem de consultas e easter eggs por quantidade.
- Excecoes de trabalho (folga/ferias) persistidas para datas futuras.
- Modulo de aniversario com canal configuravel, cadastro de datas e marcacao automatica no dia.
- Monitor de IPv4 publico com alerta automatico em canal configurado quando o IP mudar.
- Monitor de jogos gratis da Epic Games com alerta automatico em canal configurado quando surgir novo jogo.
- Monitor de espaço em disco com atualizacao diaria em canal configurado mostrando espaço livre, margem de reserva e disponivel.
- Rastreador de sumidos de call: monitora quanto tempo usuarios rastreados ficam sem entrar em call e anuncia o retorno apos o minimo configurado.

## Requisitos

- Node.js 18+
- Bot criado no Discord Developer Portal com intents habilitadas:
  - MESSAGE CONTENT INTENT
  - GUILD VOICE STATES INTENT (necessario para o rastreador de sumidos)
  - SERVER MEMBERS INTENT (opcional para expansoes futuras)

## Configuracao

1. Copie `.env.example` para `.env`.
2. Preencha os valores:
   - `DISCORD_TOKEN`: token do bot
   - `ADMIN_USER_ID`: seu ID do Discord (conta admin principal)
  - `BOT_PREFIX`: prefixo de comando do modulo smashorpass (padrao `!smashorpass`)
  - `TRABALHO_COMMAND`: prefixo do comando de trabalho (padrao `!trabalho`)
  - `ANIVERSARIO_COMMAND`: prefixo do comando de aniversario (padrao `!aniversario`)
  - `IPV4_COMMAND`: prefixo do comando de monitoramento de IPv4 (padrao `!ipwatch`)
  - `EPICFREE_COMMAND`: prefixo do comando de jogos gratis da Epic (padrao `!epicfree`)
  - `DISKSPACE_COMMAND`: prefixo do comando de monitoramento de espaço em disco (padrao `!diskspace`)
  - `VOICE_ABSENCE_COMMAND`: prefixo do comando de rastreamento de sumidos (padrao `!sumido`)
  - `VOICE_ABSENCE_MIN_DAYS`: minimo de dias sumido de call para disparar o anuncio de retorno (padrao `3`)
  - `IPV4_CHECK_INTERVAL_MS`: intervalo da checagem automatica do IPv4 em ms (padrao `600000`, 10 min)
  - `IPV4_FETCH_TIMEOUT_MS`: timeout da consulta HTTP de IPv4 em ms (padrao `8000`)
  - `EPICFREE_CHECK_INTERVAL_MS`: intervalo da checagem automatica da Epic em ms (padrao `21600000`, 6 h)
  - `EPICFREE_FETCH_TIMEOUT_MS`: timeout da consulta HTTP da Epic em ms (padrao `15000`)
  - `EPICFREE_LOCALE`: locale usado na API da Epic (padrao `pt-BR`)
  - `EPICFREE_COUNTRY`: pais usado na API da Epic (padrao `BR`)
  - `EPICFREE_ALLOW_COUNTRIES`: allowCountries da API da Epic (padrao `BR`)
  - `BIRTHDAY_ANNOUNCE_HOUR`: hora do anuncio de aniversarios (0-23, padrao `9`)
  - `BIRTHDAY_ANNOUNCE_MINUTE`: minuto do anuncio de aniversarios (0-59, padrao `0`)
  - `DISKSPACE_ANNOUNCE_HOUR`: hora da atualizacao de espaço em disco (0-23, padrao `10`)
  - `DISKSPACE_ANNOUNCE_MINUTE`: minuto da atualizacao de espaço em disco (0-59, padrao `0`)
  - `DISKSPACE_RESERVE_GB`: margem de reserva de segurança em GB (padrao `100`)
  - `WORK_PATTERN_ANCHOR`: data base do padrao dia sim/dia nao (padrao `2026-01-01`)
   - `DB_PATH`: caminho do sqlite (padrao local em `./data/bot.db`)

## Instalar e rodar

```bash
npm install
npm start
```

## Rodar Em Producao No Debian (Auto)

Foi adicionado um script que configura tudo automaticamente com systemd:

1. Crie e ajuste seu arquivo `.env` na raiz do projeto.
2. No servidor Debian, execute:

```bash
cd /opt/NewPontoZeroBot
chmod +x scripts/setup-systemd.sh
sudo ./scripts/setup-systemd.sh --user seu_usuario_linux
```

O script faz:
- instalacao de dependencias em modo producao
- criacao do servico systemd
- habilitacao no boot
- restart automatico em queda
- start imediato do bot

Opcoes uteis:

```bash
sudo ./scripts/setup-systemd.sh --help
sudo ./scripts/setup-systemd.sh --service-name pontozero-bot --user debian
sudo ./scripts/setup-systemd.sh --node-path /usr/bin/node --skip-npm-install
```

## Atualizar No Servidor

Quando voce alterar o codigo localmente e quiser publicar no Debian, siga este fluxo:

1. Envie ou sincronize os arquivos atualizados para o servidor.
2. No servidor, entre na pasta do bot:

```bash
cd /opt/NewPontoZeroBot
```

3. Atualize as dependencias, se necessario:

```bash
npm ci --omit=dev
```

Se nao existir `package-lock.json`, use:

```bash
npm install --omit=dev
```

4. Reinicie o servico systemd:

```bash
sudo systemctl restart newpontozerobot
```

5. Verifique se subiu corretamente:

```bash
sudo systemctl status newpontozerobot
sudo journalctl -u newpontozerobot -f
```

Se voce tiver alterado apenas o `.env`, reiniciar o servico tambem e suficiente.

Se preferir reinstalar tudo em um unico passo, pode rodar novamente o script de instalacao:

```bash
sudo ./scripts/setup-systemd.sh --user seu_usuario_linux --skip-npm-install
```

Use `--skip-npm-install` se as dependencias ja estiverem atualizadas e voce quiser apenas recriar/reaplicar o servico.

## Comandos

### Help Geral

- `!help`
- `!helpall` (somente dono do bot)

### Smash Or Pass (admin)

- `!smashorpass help`
- `!smashorpass canal add #canal`
- `!smashorpass canal remove #canal`
- `!smashorpass canal list`

### Trabalho

- `!trabalho`
- `!trabalho hoje`
- `!trabalho amanha`
- `!trabalho 2026-04-20`
- `!trabalho 20/04/2026`

### Trabalho (admin)

- `!trabalho folga add 2026-04-20 consulta medica`
- `!trabalho ferias add 2026-05-15 2026-05-30 viagem`
- `!trabalho folga remove 2026-04-20`
- `!trabalho ferias remove 2026-05-15 2026-05-30`
- `!trabalho folga list`
- `!trabalho ferias list`
- `!trabalho padrao show`
- `!trabalho padrao inverter`
- `!trabalho padrao set 2026-09-27`
- `!trabalho padrao reset`
- `!trabalho contador show`
- `!trabalho contador set 123`

Obs.:
- em `ferias add/remove`, se informar data inicial e final, o bot aplica no intervalo completo.
- `padrao inverter` desloca a escala dia sim/dia não em 1 dia (útil quando você troca um plantão).
- `padrao set <data>` define uma nova data base de trabalho para ancorar a escala alternada.

### Aniversario

- `!aniversario help`
- `!aniversario canal show`
- `!aniversario list`

### Aniversario (admin)

- `!aniversario canal set #canal`
- `!aniversario canal remove`
- `!aniversario add @usuario 15/04`
- `!aniversario edit @usuario 15/04`
- `!aniversario remove @usuario`

Quando chega o dia cadastrado, o bot envia automaticamente a marcacao no canal configurado de aniversario no horario definido em `BIRTHDAY_ANNOUNCE_HOUR` e `BIRTHDAY_ANNOUNCE_MINUTE` (hora local da maquina).

### Monitor IPv4

- `!ipwatch help`
- `!ipwatch canal show`
- `!ipwatch status`

### Monitor IPv4 (admin)

- `!ipwatch canal set #canal`
- `!ipwatch canal remove`
- `!ipwatch check`

Quando o IPv4 publico da maquina mudar, o bot envia automaticamente um aviso no canal configurado.

### Epic Free Games

- `!epicfree help`
- `!epicfree canal show`
- `!epicfree status`

### Epic Free Games (admin)

- `!epicfree canal set #canal`
- `!epicfree canal remove`
- `!epicfree check`

Quando surgir novo jogo gratuito na Epic, o bot envia automaticamente um embed no canal configurado.

### Espaço em Disco

- `!diskspace help`
- `!diskspace canal show`
- `!diskspace status`

### Espaço em Disco (admin)

- `!diskspace canal set #canal`
- `!diskspace canal remove`

Diariamente no horario configurado em `DISKSPACE_ANNOUNCE_HOUR` e `DISKSPACE_ANNOUNCE_MINUTE`, o bot atualiza automaticamente uma mensagem no canal configurado mostrando:
- Espaço total livre em disco (soma de `/` e `/mnt`)
- Espaço disponível para uso (total - reserva total)
- Detalhes de cada disco separadamente:
  - `/` : espaço livre e disponível (com metade da reserva)
  - `/mnt` : espaço livre e disponível (com metade da reserva)

A margem de reserva de segurança (`DISKSPACE_RESERVE_GB`, padrao 100 GB) é dividida igualmente entre os dois discos (50 GB cada).

### Sumidos (Rastreador de Call)

- `!sumido help`
- `!sumido list`
- `!sumido status @usuario`

### Sumidos (admin)

- `!sumido canal set #canal`
- `!sumido canal remove`
- `!sumido canal show`
- `!sumido add @usuario`
- `!sumido remove @usuario`
- `!sumido set @usuario 15d`
- `!sumido set @usuario 5d 3h 30m`
- `!sumido set @usuario 2026-01-15`
- `!sumido set @usuario 15/01/2026`

Quando um usuario rastreado entrar em qualquer canal de voz apos ficar sumido pelo minimo configurado (`VOICE_ABSENCE_MIN_DAYS`, padrao 3 dias), o bot envia um embed no canal configurado informando o tempo de ausencia.

O comando `!sumido set` permite ajustar manualmente o tempo sumido:
- Duracao relativa: `15d`, `5d 3h 30m`, `2h 45m`
- Data absoluta: `2026-01-15` (YYYY-MM-DD) ou `15/01/2026` (DD/MM/YYYY)

O contador e resetado automaticamente sempre que o usuario entra em call, independentemente do tempo.

## Estrutura

- `src/index.js`: eventos do Discord, comandos e reacoes
- `src/db.js`: inicializacao do SQLite
- `src/configStore.js`: operacoes de configuracao persistente
- `src/trabalhoStore.js`: persistencia de consultas e excecoes do comando trabalho
- `src/workSchedule.js`: regra de calendario dia sim/dia nao e parsing de datas
- `src/birthdayStore.js`: persistencia de canal, aniversarios e controle de anuncios diarios
- `src/ipWatchStore.js`: persistencia de canal e estado do monitor de IPv4 publico
- `src/epicFreeStore.js`: persistencia de canal e historico de jogos do monitor Epic Free
- `src/diskSpaceStore.js`: persistencia de canal e ultima mensagem do monitor de espaço em disco
- `src/voiceAbsenceStore.js`: persistencia de canal, usuarios rastreados e estado do monitor de ausência em calls
