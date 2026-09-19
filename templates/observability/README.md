# Optional observability stack

Not required. Start only if you want k6 `--out influxdb=...` plus Grafana.

```bash
k6-agent observability compose
docker compose -f docker-compose.observability.yml up -d
```

Then set in `k6-agent.yaml`:

```yaml
observability:
  influxdbUrl: http://127.0.0.1:8086/k6
```
