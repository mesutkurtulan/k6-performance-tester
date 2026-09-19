# CLI

Binary: `k6-agent`

| Command | Purpose |
| --- | --- |
| `init` | Interactive setup |
| `analyze <input>` | Parse and print normalized model |
| `generate <input>` | Design + emit k6 |
| `review <path>` | Static review |
| `run <script>` | Execute k6 |
| `report <summary>` | Render reports |
| `compare a b` | Regression |
| `baseline save\|list\|show` | Historical summaries |
| `observability compose` | Optional Influx+Grafana compose file |
| `ci generate <p>` | GitHub/Jenkins/GitLab |
| `doctor` | Environment checks |
| `full-test <input>` | End-to-end workflow |
| `explain <q>` | Why decisions were made |

Global flags: `--persona`, `--verbose`, `--debug`, `--trace`, `--quiet`, `--config`, `--provider`, `--yes`, `--force`, `--dry-run`.
