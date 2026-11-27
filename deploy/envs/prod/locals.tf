locals {
  services = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ]

  secrets = {
    RAS_AUTH_SECRET                 = "auth-secret"
    RAS_MEMORY_WEBHOOK_SECRET       = "memory-webhook-secret"
    RAS_RECLAIM_API_KEY             = "reclaim-api-key"
    RAS_GRAPH_CLIENT_SECRET         = "graph-client-secret"
    RAS_GOOGLE_CLIENT_SECRET        = "google-client-secret"
    RAS_MAIL_APP_PASSWORD           = "mail-app-password"
    RAS_MEMORY_DEPLOY_KEY           = "memory-deploy-key"
    RAS_BACKUP_R2_ACCESS_KEY_ID     = "r2-access-key-id"
    RAS_BACKUP_R2_SECRET_ACCESS_KEY = "r2-secret-access-key"
  }

  url = "https://${var.domain}"

  # ras expects this URL as the audience of the Scheduler's token, so it is built from RAS_URL.
  backup_url = "${local.url}/backup"
}
