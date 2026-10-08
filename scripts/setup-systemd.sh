#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="newpontozerobot"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(whoami)}"
NODE_PATH=""
SKIP_NPM_INSTALL="false"

print_help() {
  cat <<'EOF'
Uso:
  sudo ./scripts/setup-systemd.sh [opcoes]

Opcoes:
  --service-name NOME     Nome do servico systemd (padrao: newpontozerobot)
  --app-dir CAMINHO       Caminho do projeto (padrao: pasta raiz do repo)
  --user USUARIO          Usuario Linux para executar o bot
  --node-path CAMINHO     Caminho completo do binario node (ex.: /usr/bin/node)
  --skip-npm-install      Nao executa npm ci/npm install
  --help                  Exibe esta ajuda

Exemplo:
  sudo ./scripts/setup-systemd.sh --user debian --service-name pontozero-bot
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --user)
      RUN_USER="$2"
      shift 2
      ;;
    --node-path)
      NODE_PATH="$2"
      shift 2
      ;;
    --skip-npm-install)
      SKIP_NPM_INSTALL="true"
      shift 1
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      echo "Opcao invalida: $1"
      print_help
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Este script precisa ser executado com sudo/root."
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd nao encontrado (systemctl indisponivel)."
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "Diretorio da aplicacao nao encontrado: $APP_DIR"
  exit 1
fi

if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "Usuario nao encontrado: $RUN_USER"
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Arquivo .env nao encontrado em $APP_DIR/.env"
  echo "Crie o .env antes de instalar o servico."
  exit 1
fi

if [[ -z "$NODE_PATH" ]]; then
  NODE_PATH="$(sudo -u "$RUN_USER" bash -lc 'command -v node' || true)"
fi

if [[ -z "$NODE_PATH" || ! -x "$NODE_PATH" ]]; then
  echo "Nao foi possivel localizar um binario node executavel."
  echo "Informe manualmente com --node-path /caminho/do/node"
  exit 1
fi

if [[ "$SKIP_NPM_INSTALL" != "true" ]]; then
  if [[ -f "$APP_DIR/package-lock.json" ]]; then
    echo "Instalando dependencias com npm ci --omit=dev..."
    sudo -u "$RUN_USER" bash -lc "cd '$APP_DIR' && npm ci --omit=dev"
  else
    echo "Instalando dependencias com npm install --omit=dev..."
    sudo -u "$RUN_USER" bash -lc "cd '$APP_DIR' && npm install --omit=dev"
  fi
fi

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "Criando arquivo de servico em $SERVICE_FILE"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Discord Bot (${SERVICE_NAME})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=${NODE_PATH} src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "Aplicando configuracoes do systemd..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo
echo "Instalacao concluida."
echo "Status:"
systemctl --no-pager --full status "$SERVICE_NAME" || true

echo
echo "Comandos uteis:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
echo "  sudo systemctl restart $SERVICE_NAME"
echo "  sudo systemctl stop $SERVICE_NAME"
