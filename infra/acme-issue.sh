#!/bin/sh
# Выпуск/установка TLS для nginx и LiveKit TURN (DNS-01 DuckDNS, без /var/www/acme:
# хостовые 80/443 заняты чужим nginx, HTTP-01 webroot недоступен).
# Не пишет в /acme.sh/output, пока нет полной пары cert+key — иначе
# --install-cert затирает live fullchain.pem пустым файлом и nginx не стартует.
DOMAIN="${TLS_DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  echo "[acme] TLS_DOMAIN is empty"
  exit 1
fi
OUT=/acme.sh/output
mkdir -p "$OUT"

log() { echo "[acme] $*"; }

log "acme.sh --list"
acme.sh --list || true
log "persisted cert files in volume /acme.sh"
find /acme.sh -type f \( -name '*.cer' -o -name '*.key' -o -name 'fullchain*' \) ! -path '/acme.sh/output/*' 2>/dev/null || true
log "host bind-mount $OUT"
ls -la "$OUT" || true

install_pair() {
  full="$1"
  key="$2"
  if [ ! -s "$full" ] || [ ! -s "$key" ]; then
    return 1
  fi
  cp "$full" "$OUT/fullchain.pem.new"
  cp "$key" "$OUT/domain.key.new"
  mv "$OUT/fullchain.pem.new" "$OUT/fullchain.pem"
  mv "$OUT/domain.key.new" "$OUT/domain.key"
  log "wrote $OUT/fullchain.pem from $full"
  openssl x509 -in "$OUT/fullchain.pem" -noout -issuer -subject -dates
}

install_from_acme() {
  tmp=$(mktemp -d)
  if acme.sh --install-cert -d "$DOMAIN" --ecc --key-file "$tmp/domain.key" --fullchain-file "$tmp/fullchain.pem"; then
    install_pair "$tmp/fullchain.pem" "$tmp/domain.key" && return 0
  fi
  if acme.sh --install-cert -d "$DOMAIN" --key-file "$tmp/domain.key" --fullchain-file "$tmp/fullchain.pem"; then
    install_pair "$tmp/fullchain.pem" "$tmp/domain.key" && return 0
  fi
  return 1
}

install_from_disk() {
  for d in \
    "/acme.sh/${DOMAIN}_ecc" \
    "/acme.sh/${DOMAIN}" \
    "${OUT}/${DOMAIN}_ecc" \
    "${OUT}/${DOMAIN}"
  do
    if install_pair "$d/fullchain.cer" "$d/${DOMAIN}.key"; then
      return 0
    fi
  done
  return 1
}

if install_from_acme || install_from_disk; then
  log "reused existing certificate"
  exit 0
fi

issue() {
  server="$1"
  log "issuing via $server (dns_duckdns)"
  acme.sh --issue --dns dns_duckdns -d "$DOMAIN" --server "$server"
}

# Let's Encrypt: 5 certs / 168h, retry after 2026-09-07 04:15 UTC.
# ZeroSSL и BuyPass браузеры тоже доверяют — ими обходим лимит.
log "registering ZeroSSL account"
acme.sh --register-account -m "tls@${DOMAIN}" --server zerossl || true
if issue zerossl; then
  if install_from_acme || install_from_disk; then
    log "ZeroSSL certificate installed"
    exit 0
  fi
fi

log "registering BuyPass account"
acme.sh --register-account -m "tls@${DOMAIN}" --server buypass || true
if issue buypass; then
  if install_from_acme || install_from_disk; then
    log "BuyPass certificate installed"
    exit 0
  fi
fi

log "trying Let's Encrypt as last resort"
if issue letsencrypt; then
  if install_from_acme || install_from_disk; then
    log "Let's Encrypt certificate installed"
    exit 0
  fi
fi

log "all CAs failed"
exit 1
