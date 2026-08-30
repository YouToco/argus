#!/usr/bin/env bash
set -euo pipefail
umask 077

require_env() {
  local name
  for name in "$@"; do
    if [[ -z ${!name:-} ]]; then
      echo "required environment variable is empty: $name" >&2
      exit 1
    fi
  done
}

require_env \
  ALIYUN_BIN ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET \
  ACME_ACCOUNT_EMAIL RUNNER_TEMP
[[ -x $ALIYUN_BIN ]] || {
  echo "pinned Alibaba Cloud CLI is missing: $ALIYUN_BIN" >&2
  exit 1
}

renew_threshold_days=${CERT_RENEW_THRESHOLD_DAYS:-30}
minimum_new_days=${CERT_MIN_NEW_DAYS:-30}
[[ $renew_threshold_days =~ ^[0-9]+$ && $minimum_new_days =~ ^[0-9]+$ ]]

domain=argus.zhuoqidev.com
edge=argus.zhuoqidev.com.w.kunlunaq.com
acme_commit=3661fd86b6304115e42f43910e6dd452ab9866d6

work_dir=$(mktemp -d "$RUNNER_TEMP/argus-cert.XXXXXX")
aliyun_config=$work_dir/aliyun-config.json
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

"$ALIYUN_BIN" configure set \
  --config-path "$aliyun_config" \
  --profile default \
  --mode AK \
  --access-key-id "$ALIYUN_ACCESS_KEY_ID" \
  --access-key-secret "$ALIYUN_ACCESS_KEY_SECRET" \
  --region cn-shenzhen >/dev/null

remote_certificate_days() {
  local response
  response=$(
    "$ALIYUN_BIN" cdn DescribeDomainCertificateInfo \
      --DomainName "$domain" \
      --config-path "$aliyun_config" \
      --profile default
  )
  printf '%s' "$response" | python3 -c '
import datetime as dt
import json
import math
import sys

domain = sys.argv[1]
payload = json.load(sys.stdin)
certificates = payload.get("CertInfos", {}).get("CertInfo", [])
matches = [item for item in certificates if item.get("DomainName") == domain]
if len(matches) != 1:
    raise SystemExit(f"expected one certificate for {domain}, got {len(matches)}")
certificate = matches[0]
if certificate.get("ServerCertificateStatus") != "on":
    raise SystemExit(f"TLS is not enabled for {domain}")
if certificate.get("DomainCnameStatus") != "ok":
    raise SystemExit(f"CDN CNAME is not healthy for {domain}")
expires = certificate.get("CertExpireTime", "").replace("Z", "+00:00")
expiry = dt.datetime.fromisoformat(expires)
remaining = math.floor(
    (expiry - dt.datetime.now(dt.timezone.utc)).total_seconds() / 86400
)
print(remaining)
' "$domain"
}

days=$(remote_certificate_days)
echo "$domain CDN certificate has $days days remaining"

if ((days > renew_threshold_days)); then
  echo "certificate renewal is not needed"
  exit 0
fi

acme_home=$work_dir/acme/home
acme_config=$work_dir/acme/config
acme_certs=$work_dir/acme/certs
mkdir -p "$acme_home" "$acme_config" "$acme_certs"
chmod 700 "$work_dir/acme" "$acme_home" "$acme_config" "$acme_certs"

git init -q "$work_dir/acme-source"
git -C "$work_dir/acme-source" remote add origin \
  https://github.com/acmesh-official/acme.sh.git
git -C "$work_dir/acme-source" fetch --quiet --depth 1 origin "$acme_commit"
git -C "$work_dir/acme-source" checkout --quiet --detach FETCH_HEAD
[[ $(git -C "$work_dir/acme-source" rev-parse HEAD) == "$acme_commit" ]]

(
  cd "$work_dir/acme-source"
  ./acme.sh \
    --install \
    --home "$acme_home" \
    --config-home "$acme_config" \
    --cert-home "$acme_certs" \
    --accountemail "$ACME_ACCOUNT_EMAIL" \
    --no-cron \
    --no-profile
)

Ali_Key=$ALIYUN_ACCESS_KEY_ID \
Ali_Secret=$ALIYUN_ACCESS_KEY_SECRET \
  "$acme_home/acme.sh" \
    --issue \
    --home "$acme_home" \
    --config-home "$acme_config" \
    --cert-home "$acme_certs" \
    --domain "$domain" \
    --server letsencrypt \
    --dns dns_ali \
    --keylength ec-256

fullchain=$acme_certs/${domain}_ecc/fullchain.cer
private_key=$acme_certs/${domain}_ecc/${domain}.key
[[ -s $fullchain && -s $private_key ]]
openssl x509 -in "$fullchain" -noout -checkhost "$domain" >/dev/null
openssl x509 -in "$fullchain" -noout \
  -checkend "$((minimum_new_days * 86400))" >/dev/null

certificate_public_key=$(
  openssl x509 -in "$fullchain" -pubkey -noout |
    openssl pkey -pubin -outform DER 2>/dev/null |
    sha256sum |
    awk '{ print $1 }'
)
private_public_key=$(
  openssl pkey -in "$private_key" -pubout -outform DER 2>/dev/null |
    sha256sum |
    awk '{ print $1 }'
)
[[ $certificate_public_key == "$private_public_key" ]]

certificate_days_remaining() {
  local certificate=$1
  local end expiry now
  end=$(openssl x509 -in "$certificate" -noout -enddate | cut -d= -f2)
  expiry=$(date -d "$end" +%s)
  now=$(date +%s)
  printf '%s' "$(((expiry - now) / 86400))"
}

local_fingerprint=$(
  openssl x509 -in "$fullchain" -noout -fingerprint -sha256 |
    cut -d= -f2
)
local_days=$(certificate_days_remaining "$fullchain")
[[ $local_fingerprint =~ ^([0-9A-F]{2}:){31}[0-9A-F]{2}$ ]]
echo "new certificate fingerprint=$local_fingerprint days=$local_days"

"$ALIYUN_BIN" cdn SetCdnDomainSSLCertificate \
  --DomainName "$domain" \
  --SSLProtocol on \
  --CertType upload \
  --CertName "argus-le-$(date -u +%Y%m%d)" \
  --SSLPub "$(<"$fullchain")" \
  --SSLPri "$(<"$private_key")" \
  --config-path "$aliyun_config" \
  --profile default >/dev/null

edge_chain=$work_dir/edge-chain.pem
edge_leaf=$work_dir/edge-leaf.pem
for attempt in {1..12}; do
  : >"$edge_chain"
  : >"$edge_leaf"
  if openssl s_client \
    -servername "$domain" \
    -connect "$edge:443" \
    -showcerts </dev/null >"$edge_chain" 2>/dev/null; then
    awk '
      /-----BEGIN CERTIFICATE-----/ { capture = 1 }
      capture { print }
      /-----END CERTIFICATE-----/ { exit }
    ' "$edge_chain" >"$edge_leaf"
    if [[ -s $edge_leaf ]]; then
      edge_fingerprint=$(
        openssl x509 -in "$edge_leaf" -noout -fingerprint -sha256 |
          cut -d= -f2
      )
      edge_days=$(certificate_days_remaining "$edge_leaf")
      echo "$domain edge fingerprint=$edge_fingerprint days=$edge_days"
      if [[ $edge_fingerprint == "$local_fingerprint" ]] &&
        ((edge_days >= minimum_new_days)); then
        curl --fail --silent --show-error --max-time 30 \
          --connect-to "$domain:443:$edge:443" \
          --output /dev/null "https://$domain/"
        echo "edge presents the exact uploaded certificate"
        exit 0
      fi
    fi
  fi
  [[ $attempt -lt 12 ]] && sleep 10
done

echo "$domain edge did not present the exact uploaded certificate" >&2
exit 1
