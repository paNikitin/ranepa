#!/usr/bin/env bash
# Генерирует kubeconfig для каждого слота. Запускать ОДИН РАЗ после того,
# как RBAC применён (rbac-slot.yaml). Требует admin kubeconfig локально.
#
# Результат — 5 файлов в /tmp/ranepa-kubeconfigs/:
#   app1.kubeconfig … app5.kubeconfig
#
# Эти файлы потом монтируются в code-server-pod каждого слота как
# k8s secret kubeconfig (см. infra/k8s/code-server/).
#
# Каждый kubeconfig может ТОЛЬКО:
#   - kubectl apply / get / delete в namespace ranepa-app<N>
#   - просматривать pod-логи в этом ns
#   - rollout status
# и НИЧЕГО за пределами своего ns. Изоляция через RoleBinding.

set -euo pipefail

OUT="${OUT:-/tmp/ranepa-kubeconfigs}"
mkdir -p "$OUT"

# API server URL и CA — берём из текущего admin kubeconfig.
API_SERVER=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.server}')
CA_DATA=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

if [[ -z "$CA_DATA" ]]; then
  CA_FILE=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.certificate-authority}')
  if [[ -n "$CA_FILE" && -f "$CA_FILE" ]]; then
    CA_DATA=$(base64 -i "$CA_FILE" | tr -d '\n')
  fi
fi

if [[ -z "$CA_DATA" ]]; then
  echo "ERROR: cannot extract CA from current kubeconfig" >&2
  exit 1
fi

for n in 1 2 3 4 5; do
  SLUG="app$n"
  NS="ranepa-$SLUG"

  TOKEN=$(kubectl -n "$NS" get secret deployer-token -o jsonpath='{.data.token}' | base64 -d)

  cat > "$OUT/$SLUG.kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: ranepa
    cluster:
      server: $API_SERVER
      certificate-authority-data: $CA_DATA
contexts:
  - name: $SLUG
    context:
      cluster: ranepa
      namespace: $NS
      user: deployer
current-context: $SLUG
users:
  - name: deployer
    user:
      token: $TOKEN
EOF
  chmod 600 "$OUT/$SLUG.kubeconfig"
  echo "Generated: $OUT/$SLUG.kubeconfig"
done

echo
echo "Sanity-check (используя свежий kubeconfig слота app1):"
KUBECONFIG="$OUT/app1.kubeconfig" kubectl auth can-i create deployments -n ranepa-app1 || true
KUBECONFIG="$OUT/app1.kubeconfig" kubectl auth can-i get nodes 2>&1 | head -2 || true
echo
echo "Чтобы залить в code-server pod'ы как secret:"
echo "  for n in 1 2 3 4 5; do"
echo "    kubectl -n ranepa-tools create secret generic kubeconfig-app\$n \\"
echo "      --from-file=config=$OUT/app\$n.kubeconfig"
echo "  done"
