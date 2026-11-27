resource "google_service_account" "this" {
  account_id   = "ras-scheduler"
  display_name = "Calls ras's backup route from Cloud Scheduler"
}

resource "google_cloud_scheduler_job" "backup" {
  name             = "ras-backup"
  region           = var.region
  schedule         = "0 3 * * *"
  time_zone        = "Europe/Prague"
  attempt_deadline = "300s"

  http_target {
    http_method = "POST"
    uri         = var.url

    oidc_token {
      service_account_email = google_service_account.this.email
      audience              = var.url
    }
  }
}
