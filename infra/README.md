# infra/ — Infrastructure as Code

This directory contains the Deployment Manager IaC template for the **fieldvet-backend** Cloud Run service and the one-time IAM setup script for the automated CI/CD pipeline.

---

## One-time setup

Run the IAM setup script **once** on a fresh GCP project before the first deploy:

```bash
bash scripts/setup-iam.sh
```

The script prints two values at the end.  Copy them into GitHub repository secrets:

| Secret name | Value |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed by `setup-iam.sh` |
| `GCP_SERVICE_ACCOUNT` | printed by `setup-iam.sh` |

Add them at: **Repository → Settings → Secrets and variables → Actions → New repository secret**

---

## First deploy

Create the Cloud Run service declaratively from the Jinja template:

```bash
gcloud deployment-manager deployments create fieldvet-backend \
  --config infra/field-vet-config.yaml \
  --project wafrivet-agent
```

To update the service after changing `field-vet-config.yaml`:

```bash
gcloud deployment-manager deployments update fieldvet-backend \
  --config infra/field-vet-config.yaml \
  --project wafrivet-agent
```

---

## Ongoing deploys

Every push to the `main` branch triggers the full pipeline automatically — build, push, deploy, and health check — with no further action required.

