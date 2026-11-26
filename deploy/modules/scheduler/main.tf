terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "region" {
  description = "The region the job runs in."
  type        = string
}

variable "url" {
  description = "The URL of ras's backup route, which is also the audience ras expects in the job's token."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+/backup$", var.url))
    error_message = "url is ras's backup route over HTTPS, such as https://ras.example.com/backup."
  }
}

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

output "job" {
  description = "The name of the backup job, which `gcloud scheduler jobs run` takes."
  value       = google_cloud_scheduler_job.backup.name
}

output "service_account" {
  description = "The email of the account the job's token is issued to."
  value       = google_service_account.this.email
}
