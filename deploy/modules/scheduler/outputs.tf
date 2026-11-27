output "job" {
  description = "The name of the backup job, which `gcloud scheduler jobs run` takes."
  value       = google_cloud_scheduler_job.backup.name
}

output "service_account" {
  description = "The email of the account the job's token is issued to."
  value       = google_service_account.this.email
}
