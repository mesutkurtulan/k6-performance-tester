import { AppConfig } from "../config/schema.js";

/** Optional k6 --out arguments. Grafana/Influx/Prometheus are never required. */
export function observabilityArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.observability.influxdbUrl) {
    args.push("--out", `influxdb=${config.observability.influxdbUrl}`);
  }
  if (config.observability.prometheusRemoteWrite) {
    args.push("-o", "experimental-prometheus-rw");
  }
  return args;
}

export function observabilityCompose(): string {
  return `services:
  influxdb:
    image: influxdb:1.8
    ports:
      - "8086:8086"
    environment:
      INFLUXDB_DB: k6
      INFLUXDB_HTTP_AUTH_ENABLED: "false"
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    depends_on:
      - influxdb
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana-provisioning:/etc/grafana/provisioning
# Optional stack. Core k6-agent does not require these services.
`;
}
