export function generateCi(provider: "github" | "jenkins" | "gitlab"): { path: string; contents: string } {
  if (provider === "github") {
    return {
      path: "ci/github-actions.yml",
      contents: `name: k6 performance
on:
  workflow_dispatch:
  pull_request:
jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: grafana/setup-k6-action@v1
      - run: npx k6-agent generate examples/openapi/petstore.yaml --type smoke --out generated-tests --yes
      - run: npx k6-agent run generated-tests/smoke/main.js --report html,markdown,json,junit --yes
      - name: Publish summary
        if: always()
        run: cat reports/github-summary.md >> "$GITHUB_STEP_SUMMARY" || true
`,
    };
  }
  if (provider === "gitlab") {
    return {
      path: "ci/gitlab-ci.yml",
      contents: `stages: [perf]
performance:
  stage: perf
  image: node:20
  script:
    - npm ci
    - npm run build
    - curl -L https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz | tar xz
    - mv k6-v0.54.0-linux-amd64/k6 /usr/local/bin/k6
    - npx k6-agent generate examples/openapi/petstore.yaml --type smoke --out generated-tests --yes
    - npx k6-agent run generated-tests/smoke/main.js --report junit,markdown --yes
`,
    };
  }
  return {
    path: "ci/Jenkinsfile",
    contents: `pipeline {
  agent any
  stages {
    stage('Generate') {
      steps {
        sh 'npm ci && npm run build'
        sh 'npx k6-agent generate examples/openapi/petstore.yaml --type smoke --out generated-tests --yes'
      }
    }
    stage('Run') {
      steps {
        sh 'npx k6-agent run generated-tests/smoke/main.js --report junit,html --yes'
      }
    }
  }
}
`,
  };
}
