output "workload_identity_provider" {
  description = "The provider the deploy workflow authenticates through."
  value       = google_iam_workload_identity_pool_provider.this.name
}

output "service_account" {
  description = "The email of the account the deploy workflow acts as."
  value       = google_service_account.this.email
}
