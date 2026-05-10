# Code-server (среда участника)

Один pod на слот в namespace `ranepa-tools`. Внутри:

- `ttyd` слушает на 7681,
- запускает `claude` (Claude Code CLI) в TUI,
- участник видит только этот чат через
  `https://ranepa.gigaparsers.ru/dev/app<N>` под basic-auth.

## Что должно существовать перед apply

### 1. Образ собран и запушен

```sh
docker build -t harbor.parsers360.ru:10443/ranepa/code-server:0.1.0 \
  -f infra/code-server/Dockerfile .
docker push harbor.parsers360.ru:10443/ranepa/code-server:0.1.0
```

(Тег обновлять при каждой правке Dockerfile.)

### 2. Claude OAuth credentials

На локальной машине, авторизованной через Claude Max 5x:

```sh
claude /login
# логинимся через браузер, токен сохраняется в ~/.claude/.credentials.json

kubectl -n ranepa-tools create secret generic claude-credentials \
  --from-file=credentials.json="$HOME/.claude/.credentials.json"
```

### 2b. VLESS+REALITY proxy для api.anthropic.com

api.anthropic.com из РФ заблокирован. Внутри pod'а sing-box поднимает
mixed-inbound на 127.0.0.1:1088 и тоннелит исходящие в VLESS+REALITY
gateway. Перед apply нужен secret `vless-config`. Шаблон конфига —
[`infra/code-server/sing-box.template.json`](../../code-server/sing-box.template.json).

Из строки `vless://<UUID>@<HOST>:<PORT>/?security=reality&pbk=<PBK>&sni=<SNI>&sid=<SID>&fp=chrome&flow=xtls-rprx-vision`
заполнить плейсхолдеры в шаблоне (UUID, HOST, PORT, PBK, SNI, SID),
сохранить как `/tmp/sing-box.json`, затем:

```sh
kubectl -n ranepa-tools create secret generic vless-config \
  --from-file=config.json=/tmp/sing-box.json
rm /tmp/sing-box.json   # реальный конфиг с ключами в репу не коммитим
```

Проверить, что sing-box валидно его читает:

```sh
sing-box check -c /tmp/sing-box.json
```

### 3. Kubeconfig секреты для каждого слота

```sh
infra/k8s/bootstrap/gen-kubeconfigs.sh   # создаст /tmp/ranepa-kubeconfigs/

for n in 1 2 3 4 5; do
  kubectl -n ranepa-tools create secret generic "kubeconfig-app$n" \
    --from-file=config="/tmp/ranepa-kubeconfigs/app$n.kubeconfig"
done
```

### 4. Basic-auth секреты для каждого слота

`htpasswd` формат, можно сгенерировать:

```sh
for n in 1 2 3 4 5; do
  USER="app$n"
  PASS=$(openssl rand -hex 8)
  HASH=$(htpasswd -nbB "$USER" "$PASS" | head -n 1)
  echo "Slot app$n  user=$USER  password=$PASS"
  kubectl -n ranepa-tools create secret generic "code-server-auth-app$n" \
    --from-literal=users="$HASH"
done > /tmp/ranepa-credentials.txt
```

(Сохранить `/tmp/ranepa-credentials.txt` отдельно — это то, что
раздаём участникам.)

## Применение манифестов

```sh
for n in 1 2 3 4 5; do
  for f in deployment.yaml service.yaml ingress.yaml; do
    APP_SLUG=app$n envsubst < "infra/k8s/code-server/$f" | kubectl apply -f -
  done
done
```

## Проверка

```sh
kubectl -n ranepa-tools get pods,svc,ingress
curl -u app1:<password> -I https://ranepa.gigaparsers.ru/dev/app1/
```

Ожидаемо: 200 OK, `Content-Type: text/html` (ttyd UI).
