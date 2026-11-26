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

  # Cloud Run's deterministic address, known before the service exists, so the service can be told its own URL.
  host = "ras-${data.google_project.this.number}.${var.region}.run.app"
  url  = "https://${local.host}"

  # ras expects this URL as the audience of the Scheduler's token, so it is built from RAS_URL.
  backup_url = "${local.url}/backup"
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "this" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = "ras-runtime"
  display_name = "Runs ras on Cloud Run"
  depends_on   = [google_project_service.this]
}

module "registry" {
  source        = "../../modules/registry"
  location      = var.region
  repository_id = "ras"
  depends_on    = [google_project_service.this]
}

module "replica" {
  source     = "../../modules/replica"
  name       = "${var.project_id}-replica"
  location   = var.region
  writer     = google_service_account.runtime.member
  depends_on = [google_project_service.this]
}

module "secrets" {
  source     = "../../modules/secrets"
  secret_ids = toset(values(local.secrets))
  accessor   = google_service_account.runtime.member
  depends_on = [google_project_service.this]
}

module "service" {
  source          = "../../modules/service"
  name            = "ras"
  region          = var.region
  service_account = google_service_account.runtime.email
  env = {
    RAS_URL                      = local.url
    RAS_REPLICA_BUCKET           = module.replica.name
    RAS_MEMORY_REPOSITORY        = var.memory_repository
    RAS_GRAPH_CLIENT_ID          = var.graph_client_id
    RAS_GOOGLE_CLIENT_ID         = var.google_client_id
    RAS_MAIL_USERNAME            = var.mail_username
    RAS_BACKUP_R2_ENDPOINT       = var.r2_endpoint
    RAS_BACKUP_R2_BUCKET         = var.r2_bucket
    RAS_BACKUP_SCHEDULER_ACCOUNT = module.scheduler.service_account
  }
  secrets    = { for name, id in local.secrets : name => module.secrets.ids[id] }
  depends_on = [module.secrets]
}

module "scheduler" {
  source     = "../../modules/scheduler"
  region     = var.region
  url        = local.backup_url
  depends_on = [google_project_service.this]
}

module "deployer" {
  source          = "../../modules/deployer"
  project_id      = var.project_id
  repository      = var.github_repository
  registry        = { name = module.registry.name, location = module.registry.location }
  runtime_account = google_service_account.runtime.name
  depends_on      = [google_project_service.this]
}

module "alerts" {
  source          = "../../modules/alerts"
  project_id      = var.project_id
  billing_account = var.billing_account
  email           = var.alert_email
  host            = local.host
  depends_on      = [google_project_service.this]
}
